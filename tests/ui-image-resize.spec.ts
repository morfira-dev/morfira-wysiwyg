import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { ImageFormMode } from '@morfira-dev/wysiwyg/ui/images';
import './ui-image-resize.types.js';

const original = '<figure><img src="/logo.svg" alt="Original" width="400" height="300"><figcaption><strong>Rich</strong> caption</figcaption></figure><p>Tail</p>';
const form = (page: Page) => page.locator('.resize-form-host .mw-image-form');
const content = (page: Page) => page.locator('.resize-form-editor .mw-content');

const initialize = async (page: Page, options: { html?: string; mode?: ImageFormMode; locked?: boolean } = {}) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async ({ html, mode, locked }) => {
    window.dispose();
    const mount = document.createElement('div');
    mount.className = 'resize-form-editor';
    const host = document.createElement('div');
    host.className = 'resize-form-host';
    document.body.prepend(mount, host);
    window.changes = [];
    window.imageResizeFormErrors = [];
    window.editor = window.createEditor(mount, {
      value: html, locale: 'en', plugins: [window.createImages()],
      onChange: (change) => window.changes.push(change),
    });
    const imagePath = '/packages/plugins/dist/images.js';
    const { imageCommands } = await import(/* @vite-ignore */ imagePath) as typeof import('@morfira-dev/wysiwyg/plugins/images');
    window.imageResizeFormAPI = imageCommands(window.editor);
    window.imageResizeFormAPI.select(window.editor.surface.querySelector('img')!);
    const path = '/packages/plugins/dist/ui/images.js';
    const { createImageForm } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/ui/images');
    window.imageResizeFormOptions = { mode, keepAspectRatio: locked, onError: (error) => window.imageResizeFormErrors.push(String(error)) };
    window.imageResizeForm = createImageForm(host, window.editor, window.imageResizeFormOptions);
    window.dispose = () => { window.imageResizeForm.destroy(); window.editor.destroy(); mount.remove(); host.remove(); };
  }, { html: options.html ?? original, mode: options.mode ?? 'edit', locked: options.locked ?? false });
  return page.evaluate(() => window.editor.getHTML());
};

test('locked width and height drafts keep a fixed ratio and apply with rich caption identity in one Undo', async ({ page }) => {
  const before = await initialize(page, { locked: true });
  const lock = form(page).getByLabel('Keep aspect ratio', { exact: true });
  await expect(lock).toBeChecked();
  await page.evaluate(() => { window.imageResizeFormOptions.keepAspectRatio = false; });
  await expect(lock).toBeChecked();
  const identity = await content(page).evaluateHandle((root) => ({
    image: root.querySelector('img'), figure: root.querySelector('figure'), caption: root.querySelector('figcaption strong'),
  }));
  const width = form(page).getByLabel('Image width', { exact: true });
  const height = form(page).getByLabel('Image height', { exact: true });
  await width.fill('101');
  await expect(height).toHaveValue('76');
  await width.fill('160');
  await expect(height).toHaveValue('120');
  await height.fill('150');
  await expect(width).toHaveValue('200');
  await lock.press('Enter');
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo(), changes: window.changes.length })))
    .toEqual({ html: before, undo: false, changes: 0 });
  await height.press('Enter');
  await expect(content(page).locator('img')).toHaveAttribute('width', '200');
  await expect(content(page).locator('img')).toHaveAttribute('height', '150');
  expect(await identity.evaluate((nodes) => nodes.image === window.editor.surface.querySelector('img')
    && nodes.figure === window.editor.surface.querySelector('figure') && nodes.caption === window.editor.surface.querySelector('figcaption strong'))).toBe(true);
  expect(await content(page).evaluate((root) => {
    const image = root.querySelector('img')!;
    const range = document.getSelection()?.getRangeAt(0);
    return range?.startContainer === image.parentNode && range.startContainer === range.endContainer
      && range.endOffset === range.startOffset + 1 && range.startContainer.childNodes[range.startOffset] === image;
  })).toBe(true);
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await page.evaluate(() => window.editor.redo());
  await expect(content(page).locator('img')).toHaveCSS('width', '200px');
  await expect(content(page).locator('img')).toHaveCSS('height', '150px');
});

test('all-mode lock rejects inconsistent programmatic dimensions and unlock restores independent dimensions and resets', async ({ page }) => {
  const before = await initialize(page, { mode: 'all' });
  const lock = form(page).getByLabel('Keep aspect ratio', { exact: true });
  await expect(lock).not.toBeChecked();
  await lock.check();
  await form(page).getByLabel('Image width', { exact: true }).focus();
  await page.evaluate(() => window.imageResizeForm.setValues({ width: '200', height: '100' }));
  await form(page).getByRole('button', { name: 'Update image', exact: true }).click();
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
  await expect(form(page).getByRole('status')).toHaveText('Unable to apply image changes. Check the image URL, dimensions and selection.');
  await expect(form(page).getByLabel('Image width', { exact: true })).toHaveValue('200');
  await expect(form(page).getByLabel('Image height', { exact: true })).toHaveValue('100');
  await lock.uncheck();
  await form(page).getByLabel('Image width', { exact: true }).fill('');
  await form(page).getByLabel('Image height', { exact: true }).fill('75');
  await form(page).getByRole('button', { name: 'Update image', exact: true }).click();
  expect(await content(page).locator('img').getAttribute('width')).toBeNull();
  await expect(content(page).locator('img')).toHaveAttribute('height', '75');
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('unknown proportions disable locking until the existing image load supplies natural dimensions', async ({ page }) => {
  let release = () => {};
  const loaded = new Promise<void>((resolve) => { release = resolve; });
  let requests = 0;
  await page.route('**/resize-natural.svg', async (route) => {
    requests++;
    await loaded;
    await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="blue"/></svg>' });
  });
  await initialize(page, { html: '<figure><img src="/resize-natural.svg" alt="Natural"></figure><p>Tail</p>' });
  const lock = form(page).getByLabel('Keep aspect ratio', { exact: true });
  await expect(lock).toBeDisabled();
  release();
  await expect.poll(() => content(page).locator('img').evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBe(640);
  await expect(lock).toBeEnabled();
  await lock.check();
  await form(page).getByLabel('Image height', { exact: true }).fill('150');
  await expect(form(page).getByLabel('Image width', { exact: true })).toHaveValue('200');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await form(page).getByRole('button', { name: 'Update image', exact: true }).click();
  await expect(content(page).locator('img')).toHaveAttribute('width', '200');
  await expect(content(page).locator('img')).toHaveAttribute('height', '150');
  expect(requests).toBe(1);
});

test('locale, read-only, composition and destruction preserve drafts without allowing detached resize actions', async ({ page }) => {
  const before = await initialize(page, { locked: true });
  const width = form(page).getByLabel('Image width', { exact: true });
  await width.fill('200');
  await page.evaluate(() => window.editor.setLocale('ru'));
  const lock = form(page).getByLabel('Сохранять пропорции', { exact: true });
  await expect(lock).toBeChecked();
  await expect(form(page).getByLabel('Высота изображения', { exact: true })).toHaveValue('150');
  await page.evaluate(() => window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
  await expect(lock).toBeDisabled();
  await form(page).getByRole('button', { name: 'Обновить изображение', exact: true }).dispatchEvent('click');
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
  await page.evaluate(() => window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  await page.evaluate(() => window.editor.setReadOnly(true));
  await expect(lock).toBeDisabled();
  await page.evaluate(() => window.editor.setReadOnly(false));
  await expect(lock).toBeChecked();
  const detached = await form(page).evaluateHandle((element) => element);
  await page.evaluate(() => window.imageResizeForm.destroy());
  expect(await detached.evaluate((element) => {
    const width = element.querySelector<HTMLInputElement>('input[inputmode="numeric"]')!;
    const dimensions = [...element.querySelectorAll<HTMLInputElement>('input[inputmode="numeric"]')];
    width.value = '333';
    width.dispatchEvent(new InputEvent('input', { bubbles: true }));
    element.querySelector<HTMLButtonElement>('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return dimensions[1].value;
  })).toBe('150');
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('external replacement cannot apply an old locked draft to a new selected image', async ({ page }) => {
  await initialize(page, { locked: true });
  await form(page).getByLabel('Image width', { exact: true }).fill('200');
  const replacement = '<figure><img src="/logo.svg" alt="Replacement" width="200" height="100"><figcaption>New</figcaption></figure><p>New tail</p>';
  await page.evaluate((html) => window.editor.setHTML(html), replacement);
  const replaced = await page.evaluate(() => window.editor.getHTML());
  await form(page).getByRole('button', { name: 'Update image', exact: true }).dispatchEvent('click');
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(replaced);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await content(page).locator('img').click();
  await form(page).getByLabel('Image width', { exact: true }).fill('150');
  await expect(form(page).getByLabel('Image height', { exact: true })).toHaveValue('75');
  await form(page).getByRole('button', { name: 'Update image', exact: true }).click();
  await expect(content(page).locator('img')).toHaveAttribute('alt', 'Replacement');
  await expect(content(page).locator('img')).toHaveAttribute('width', '150');
  await expect(content(page).locator('img')).toHaveAttribute('height', '75');
});

test('invalid aspect-ratio constructor options fail before mounting and leave the editor unchanged', async ({ page }) => {
  const before = await initialize(page);
  expect(await page.evaluate(async () => {
    const path = '/packages/plugins/dist/ui/images.js';
    const { createImageForm } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/ui/images');
    const host = document.createElement('div');
    host.textContent = 'Application child';
    document.body.append(host);
    let rejected = false;
    try { createImageForm(host, window.editor, { keepAspectRatio: 'yes' as unknown as boolean }); }
    catch (error) { rejected = error instanceof TypeError; }
    return { rejected, text: host.textContent, controls: host.querySelectorAll('input, button').length };
  })).toEqual({ rejected: true, text: 'Application child', controls: 0 });
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo() }))).toEqual({ html: before, undo: false });
});
