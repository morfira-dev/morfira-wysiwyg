import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import './ui-images-edit.types.js';

const initialize = async (page: Page, edit = false) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async (edit) => {
    window.dispose();
    const mount = document.createElement('div');
    const host = document.createElement('div');
    const opener = document.createElement('button');
    opener.textContent = 'Open image modal';
    document.body.prepend(opener, mount, host);
    window.imageEditUploads = 0;
    window.changes = [];
    window.editor = window.createEditor(mount, {
      value: edit ? '<figure><img src="/logo.svg" alt="Original"><figcaption><strong>Rich</strong> caption</figcaption></figure><p>Tail</p>' : '<p>Alpha</p>',
      locale: 'en',
      plugins: [window.createImages({ upload: (_file, { signal }) => {
        window.imageEditUploads++;
        signal.addEventListener('abort', () => window.imageEditUploads++, { once: true });
        return new Promise<never>(() => {});
      } })],
      onChange: (change) => window.changes.push(change),
    });
    const imagePath = '/packages/plugins/dist/images.js';
    const { imageCommands } = await import(/* @vite-ignore */ imagePath) as typeof import('@morfira-dev/wysiwyg/plugins/images');
    window.imageEditAPI = imageCommands(window.editor);
    if (edit) window.imageEditAPI.select(window.editor.surface.querySelector('img')!);
    else { window.editor.focus(); window.editor.setSelection(2, 2); }
    const path = '/packages/plugins/dist/ui/images.js';
    const { createImageForm } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/ui/images');
    window.imageEditOptions = { presentation: 'dialog', ...(edit ? { mode: 'edit' } : {}) };
    window.imageEditForm = createImageForm(host, window.editor, window.imageEditOptions);
    opener.addEventListener('click', window.imageEditForm.open);
    window.dispose = () => { window.imageEditForm.destroy(); window.editor.destroy(); opener.remove(); mount.remove(); host.remove(); };
  }, edit);
};

const open = async (page: Page) => {
  await page.getByRole('button', { name: 'Open image modal', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Images', exact: true })).toBeVisible();
};

test('image dialog owns modal focus, inserts at the remembered selection and closes with one Undo', async ({ page }) => {
  await initialize(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await open(page);
  await expect(page.getByLabel('Image URL', { exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.querySelector('dialog')!.matches(':modal'))).toBe(true);
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog')))).toBe(true);
  await page.getByLabel('Image URL', { exact: true }).fill('/logo.svg');
  await page.getByLabel('Alt', { exact: true }).fill('Inserted');
  await page.getByRole('button', { name: 'Insert image', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.mw-content img')).toHaveAttribute('alt', 'Inserted');
  await expect(page.locator('.mw-content > p')).toHaveText(['Al', 'a']);
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>Alpha</p>');
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 2, length: 2 });
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('image dialog Escape returns focus without applying a draft and closed controls remain inert', async ({ page }) => {
  await initialize(page);
  const opener = page.getByRole('button', { name: 'Open image modal', exact: true });
  await opener.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Images', exact: true })).toBeVisible();
  await page.getByLabel('Image URL', { exact: true }).fill('/logo.svg');
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
  expect(await page.evaluate(() => window.imageEditForm.isOpen())).toBe(false);
  await page.evaluate(() => window.imageEditForm.element.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>Alpha</p>');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await open(page);
  await expect(page.getByLabel('Image URL', { exact: true })).toHaveValue('/logo.svg');
});

test('image dialog invalid edit stays open with draft and valid update preserves rich caption', async ({ page }) => {
  await initialize(page, true);
  await open(page);
  await page.getByLabel('Image width', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Update image', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel('Image width', { exact: true })).toHaveValue('0');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await page.getByLabel('Image width', { exact: true }).fill('80');
  await page.getByLabel('Alt', { exact: true }).fill('Updated');
  await page.getByRole('button', { name: 'Update image', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.mw-content img')).toHaveAttribute('alt', 'Updated');
  await expect(page.locator('.mw-content figcaption strong')).toHaveText('Rich');
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
});

test('image dialog immediate alignment preserves the open modal and unrelated drafts', async ({ page }) => {
  await initialize(page, true);
  await open(page);
  await page.getByLabel('Alt', { exact: true }).fill('Unsaved alt draft');
  await page.getByRole('button', { name: 'Center image', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Images', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.querySelector('dialog')!.matches(':modal'))).toBe(true);
  await expect(page.getByLabel('Alt', { exact: true })).toHaveValue('Unsaved alt draft');
  await expect(page.locator('.mw-content img')).toHaveAttribute('alt', 'Original');
  expect(await page.evaluate(() => window.editor.surface.querySelector('img')!.style.marginLeft)).toBe('auto');
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
  await page.getByRole('button', { name: 'Reset image alignment', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel('Alt', { exact: true })).toHaveValue('Unsaved alt draft');
  await page.keyboard.press('Escape');
  await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
  expect(await page.evaluate(() => window.editor.surface.querySelector('img')!.getAttribute('style'))).toBeNull();
});

test('image dialog invalidates on external replacement and read-only and removes owned DOM on disposal', async ({ page }) => {
  await initialize(page);
  await open(page);
  await page.getByLabel('Image URL', { exact: true }).fill('/logo.svg');
  await page.evaluate(() => window.editor.setHTML('<p>Replacement</p>'));
  expect(await page.evaluate(() => window.imageEditForm.isOpen())).toBe(false);
  await page.evaluate(() => window.imageEditForm.element.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>Replacement</p>');
  await page.evaluate(() => { window.editor.focus(); window.editor.setSelection(0); window.imageEditForm.refresh(); });
  await open(page);
  await page.evaluate(() => window.editor.setReadOnly(true));
  expect(await page.evaluate(() => window.imageEditForm.isOpen())).toBe(false);
  await page.evaluate(() => { window.imageEditForm.destroy(); window.imageEditForm.destroy(); window.imageEditForm.open(); });
  await expect(page.locator('dialog.mw-image-dialog')).toHaveCount(0);
});

test('image dialog dismissing an owned upload aborts only that pending attempt without late insertion', async ({ page }) => {
  await initialize(page);
  await open(page);
  await page.getByLabel('Image file', { exact: true }).setInputFiles({ name: 'image.png', mimeType: 'image/png', buffer: Buffer.from([137, 80, 78, 71]) });
  await expect.poll(() => page.evaluate(() => window.imageEditUploads)).toBe(1);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close image dialog', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.imageEditUploads)).toBe(2);
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>Alpha</p>');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('image dialog rejects unknown presentation before mounting and localizes its dismissal', async ({ page }) => {
  await initialize(page);
  const invalid = await page.evaluate(async () => {
    const path = '/packages/plugins/dist/ui/images.js';
    const { createImageForm } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/ui/images');
    const host = document.createElement('div');
    document.body.append(host);
    try { createImageForm(host, window.editor, { presentation: 'popup' as 'dialog' }); }
    catch { return host.childNodes.length === 0; }
    return false;
  });
  expect(invalid).toBe(true);
  await open(page);
  await page.evaluate(() => window.editor.setLocale('ru'));
  await expect(page.getByRole('dialog', { name: 'Изображения', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Закрыть окно изображения', exact: true })).toBeVisible();
});
