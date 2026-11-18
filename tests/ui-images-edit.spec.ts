import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { ImageValue } from '@morfira-dev/wysiwyg/plugins/images';
import './ui-images-edit.types.js';

const original = '<figure><img src="/logo.svg" alt="Original" width="80" height="60"><figcaption><strong>Rich</strong> caption</figcaption></figure><p>Tail</p>';
const replacement = '<figure><img src="/logo.svg" alt="Replacement"></figure><p>New</p>';
const form = (page: Page) => page.locator('.image-edit-form .mw-image-form');
const content = (page: Page) => page.locator('.image-edit-editor .mw-content');
const initialize = async (page: Page, value = original, selected = true) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async ({ value, selected }) => {
    window.dispose();
    const mount = document.createElement('div');
    mount.className = 'image-edit-editor';
    const host = document.createElement('div');
    host.className = 'image-edit-form';
    document.body.prepend(mount, host);
    window.imageEditUploads = 0;
    window.changes = [];
    window.editor = window.createEditor(mount, {
      value,
      locale: 'en',
      plugins: [window.createImages({ upload: () => { window.imageEditUploads++; return new Promise<ImageValue>(() => {}); } })],
      onChange: (change) => window.changes.push(change),
    });
    const imagePath = '/packages/plugins/dist/images.js';
    const { imageCommands } = await import(/* @vite-ignore */ imagePath) as typeof import('@morfira-dev/wysiwyg/plugins/images');
    window.imageEditAPI = imageCommands(window.editor);
    if (selected && window.editor.surface.querySelector('img')) window.imageEditAPI.select(window.editor.surface.querySelector('img')!);
    const formPath = '/packages/plugins/dist/ui/images.js';
    const { createImageForm } = await import(/* @vite-ignore */ formPath) as typeof import('@morfira-dev/wysiwyg/ui/images');
    window.imageEditOptions = { mode: 'edit' };
    window.imageEditForm = createImageForm(host, window.editor, window.imageEditOptions);
    window.dispose = () => { window.imageEditForm.destroy(); window.editor.destroy(); mount.remove(); host.remove(); };
  }, { value, selected });
  return page.evaluate(() => window.editor.getHTML());
};
const selectImage = async (page: Page, index = 0) => {
  await page.evaluate((index) => {
    window.imageEditAPI.select(window.editor.surface.querySelectorAll('img')[index]);
    window.imageEditForm.refresh();
  }, index);
};

test('edit mode Enter updates the actual image, preserves unchanged rich caption, and removal has a separate Undo', async ({ page }) => {
  const before = await initialize(page);
  await expect(form(page).getByRole('button', { name: 'Update image', exact: true })).toHaveCount(1);
  await expect(form(page).getByRole('button', { name: 'Remove image', exact: true })).toHaveCount(1);
  await expect(form(page).getByRole('group', { name: 'Image alignment', exact: true }).getByRole('button')).toHaveCount(4);
  await expect(form(page).getByRole('button', { name: 'Insert image', exact: true })).toHaveCount(0);
  await expect(form(page).locator('input[type=file]')).toHaveCount(0);
  await expect(form(page).getByRole('button', { name: 'Cancel upload', exact: true })).toHaveCount(0);
  const identity = await page.evaluateHandle(() => ({ image: window.editor.surface.querySelector('img'), caption: window.editor.surface.querySelector('figcaption strong') }));
  await form(page).getByLabel('Alt', { exact: true }).fill('Edited');
  await form(page).getByLabel('Image width', { exact: true }).fill('');
  await page.evaluate(() => window.imageEditOptions.mode = 'all');
  await form(page).getByLabel('Image width', { exact: true }).press('Enter');
  await expect(content(page).locator('img')).toHaveCount(1);
  await expect(content(page).locator('img')).toHaveAttribute('alt', 'Edited');
  expect(await content(page).locator('img').getAttribute('width')).toBeNull();
  expect(await identity.evaluate((before) => before.image === window.editor.surface.querySelector('img') && before.caption === window.editor.surface.querySelector('figcaption strong'))).toBe(true);
  expect(await page.evaluate(() => ({ changes: window.changes.length, uploads: window.imageEditUploads, selected: window.imageEditAPI.getSelected()?.alt }))).toEqual({ changes: 1, uploads: 0, selected: 'Edited' });
  await form(page).getByRole('button', { name: 'Remove image', exact: true }).click();
  await expect(content(page).locator('figure')).toHaveCount(0);
  await expect(content(page).locator('p')).toHaveText('Tail');
  await page.evaluate(() => window.editor.undo());
  await expect(content(page).locator('img')).toHaveAttribute('alt', 'Edited');
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('invalid edit metadata stays atomic and localized drafts survive before explicit caption text is saved', async ({ page }) => {
  const before = await initialize(page);
  await form(page).getByLabel('Image width', { exact: true }).fill('0');
  await form(page).getByRole('button', { name: 'Update image', exact: true }).click();
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ html: before, changes: 0, undo: false });
  await expect(form(page).getByLabel('Image width', { exact: true })).toHaveValue('0');
  await form(page).getByLabel('Image width', { exact: true }).fill('80');
  await form(page).getByLabel('Image URL', { exact: true }).fill('javascript:alert(1)');
  await form(page).getByRole('button', { name: 'Update image', exact: true }).click();
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
  await form(page).getByLabel('Image URL', { exact: true }).fill('/logo.svg');
  await form(page).getByLabel('Image caption', { exact: true }).fill('<b>Literal caption</b>');
  await page.evaluate(() => window.editor.setLocale('ru'));
  await expect(form(page).getByLabel('Подпись изображения', { exact: true })).toHaveValue('<b>Literal caption</b>');
  await form(page).getByLabel('Подпись изображения', { exact: true }).press('Enter');
  await expect(content(page).locator('figcaption')).toHaveText('<b>Literal caption</b>');
  await expect(content(page).locator('figcaption b')).toHaveCount(0);
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
});

test('without a selected target Enter cannot insert and a stale draft cannot reach an API replacement', async ({ page }) => {
  await initialize(page, '<p>Empty target</p>', false);
  await expect(form(page).getByRole('button', { name: 'Update image', exact: true })).toBeDisabled();
  await form(page).getByLabel('Image URL', { exact: true }).fill('/logo.svg');
  await form(page).getByLabel('Image URL', { exact: true }).press('Enter');
  await expect(content(page).locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => ({ changes: window.changes.length, upload: window.imageEditUploads }))).toEqual({ changes: 0, upload: 0 });
  await page.evaluate((value) => window.editor.setHTML(value), original);
  await selectImage(page);
  await form(page).getByLabel('Alt', { exact: true }).fill('Old draft');
  await page.evaluate((value) => window.editor.setHTML(value), replacement);
  await form(page).getByLabel('Alt', { exact: true }).press('Enter');
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(replacement);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await selectImage(page);
  await expect(form(page).getByLabel('Alt', { exact: true })).toHaveValue('Replacement');
  await form(page).getByLabel('Alt', { exact: true }).fill('Fresh');
  await form(page).getByLabel('Alt', { exact: true }).press('Enter');
  await expect(content(page).locator('img')).toHaveAttribute('alt', 'Fresh');
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    const caption = document.createElement('figcaption');
    root.querySelector('figure')!.append(caption);
    const results: boolean[] = [];
    for (const foreign of [false, true]) {
      const protectedNode = foreign ? document.createElementNS('http://www.w3.org/2000/svg', 'svg') : document.createElement('span');
      if (!foreign) protectedNode.setAttribute('data-mw-node', 'app:owned-caption');
      protectedNode.textContent = 'Protected';
      caption.replaceChildren(protectedNode);
      window.imageEditForm.refresh();
      const before = root.innerHTML;
      const changes = window.changes.length;
      for (const button of window.imageEditForm.element.querySelectorAll('button'))
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      results.push(root.innerHTML === before && window.changes.length === changes && protectedNode.isConnected);
    }
    return results;
  })).toEqual([true, true]);
});

test('focus-time replacement or disposal cannot move an image draft into a new document', async ({ page }) => {
  await initialize(page);
  await form(page).getByLabel('Alt', { exact: true }).fill('Old draft');
  expect(await page.evaluate((value) => {
    window.editor.surface.addEventListener('focusin', () => window.editor.setHTML(value), { once: true });
    window.imageEditForm.element.querySelectorAll<HTMLButtonElement>('button')[0].click();
    return { html: window.editor.getHTML(), undo: window.editor.canUndo(), changes: window.changes.map((change) => change.source) };
  }, replacement)).toEqual({ html: replacement, undo: false, changes: ['api'] });
  await selectImage(page);
  await form(page).getByLabel('Alt', { exact: true }).fill('Disposed draft');
  expect(await page.evaluate(() => {
    const button = window.imageEditForm.element.querySelector<HTMLButtonElement>('button')!;
    window.editor.surface.addEventListener('focusin', () => window.imageEditForm.destroy(), { once: true });
    button.click();
    return { html: window.editor.getHTML(), undo: window.editor.canUndo(), connected: window.imageEditForm.element.isConnected };
  })).toEqual({ html: replacement, undo: false, connected: false });
});

test('read-only, composition and their authoritative reset paths keep edit actions inert', async ({ page }) => {
  const before = await initialize(page);
  await form(page).getByLabel('Alt', { exact: true }).fill('Guarded');
  await page.evaluate(() => {
    window.editor.setReadOnly(true);
    window.imageEditForm.element.querySelector<HTMLButtonElement>('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
  await page.evaluate(() => {
    window.editor.setReadOnly(false);
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    window.imageEditForm.element.querySelector<HTMLButtonElement>('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
  await page.evaluate((value) => window.editor.setHTML(value), replacement);
  await selectImage(page);
  await expect(form(page).getByRole('button', { name: 'Update image', exact: true })).toBeEnabled();
  await form(page).getByLabel('Alt', { exact: true }).fill('After API reset');
  await form(page).getByLabel('Alt', { exact: true }).press('Enter');
  await expect(content(page).locator('img')).toHaveAttribute('alt', 'After API reset');
  await page.evaluate(() => {
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    window.editor.setReadOnly(true);
    window.editor.setReadOnly(false);
  });
  await selectImage(page);
  await expect(form(page).getByRole('button', { name: 'Update image', exact: true })).toBeEnabled();
});

test('mode validation leaves the host untouched and edit-form disposal cannot cancel an application upload', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(async () => {
    const path = '/packages/plugins/dist/ui/images.js';
    const { createImageForm } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/ui/images');
    const host = document.createElement('div');
    document.body.append(host);
    let rejected = false;
    try { createImageForm(host, window.editor, { mode: 'insert' as 'edit' }); }
    catch { rejected = true; }
    const empty = host.childNodes.length === 0;
    host.remove();
    const paragraph = window.editor.surface.querySelector('p')!;
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    range.collapse(false);
    window.editor.surface.focus();
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    const abort = new AbortController();
    const request = window.imageEditAPI.upload(new File(['png'], 'image.png', { type: 'image/png' }), { signal: abort.signal });
    await Promise.resolve();
    window.imageEditForm.destroy();
    const stillUploading = window.imageEditAPI.isUploading();
    abort.abort();
    const result = await request;
    return { rejected, empty, stillUploading, result };
  })).toEqual({ rejected: true, empty: true, stillUploading: true, result: false });
});
