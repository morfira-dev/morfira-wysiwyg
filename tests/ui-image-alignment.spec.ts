import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { ImageFormMode } from '@morfira-dev/wysiwyg/ui/images';
import './image-alignment.types.js';
import './ui-image-alignment.types.js';

const initialize = async (page: Page, mode: ImageFormMode = 'edit') => {
  await page.goto('/');
  await expect(page.locator('.mw-content')).toBeVisible();
  await page.evaluate(async (mode) => {
    window.dispose();
    const mount = document.createElement('div');
    mount.className = 'alignment-form-editor';
    const host = document.createElement('div');
    host.className = 'alignment-form-host';
    document.body.replaceChildren(mount, host);
    window.changes = [];
    window.alignmentImageErrors = [];
    window.editor = window.createEditor(mount, { locale: 'en', plugins: [window.createImages()],
      value: '<figure><img src="/logo.svg" alt="Original" width="120" height="80"><figcaption><strong>Rich</strong> caption</figcaption></figure><p>Tail</p>',
      onChange: (change) => window.changes.push(change) });
    window.alignmentImageAPI = window.imageCommands(window.editor);
    window.alignmentImageAPI.select(window.editor.surface.querySelector('img')!);
    const path = '/packages/plugins/dist/ui/images.js';
    const { createImageForm } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/ui/images');
    window.alignmentImageForm = createImageForm(host, window.editor, { mode, onError: (error) => window.alignmentImageErrors.push(String(error)) });
    window.dispose = () => { window.alignmentImageForm.destroy(); window.editor.destroy(); host.remove(); mount.remove(); };
  }, mode);
};
const form = (page: Page) => page.locator('.alignment-form-host .mw-image-form');
const button = (page: Page, name: string) => form(page).getByRole('button', { name, exact: true });

test('immediate placement preserves unrelated form drafts, rich caption and one-step history', async ({ page }) => {
  await initialize(page);
  const before = await page.evaluate(() => window.editor.getHTML());
  const nodes = await page.locator('.alignment-form-editor img').evaluateHandle((img) => ({ img, strong: img.parentElement!.querySelector('strong')! }));
  await form(page).getByLabel('Alt', { exact: true }).fill('Unsaved alternative');
  await form(page).getByLabel('Image width', { exact: true }).fill('95');
  const draft = await page.evaluate(() => window.alignmentImageForm.getValues());
  await expect(form(page).getByRole('group', { name: 'Image alignment', exact: true })).toBeVisible();
  await button(page, 'Center image').click();
  await expect(button(page, 'Center image')).toHaveAttribute('aria-pressed', 'true');
  await expect(button(page, 'Center image')).toBeFocused();
  expect(await page.evaluate(() => window.alignmentImageForm.getValues())).toEqual(draft);
  expect(await nodes.evaluate(({ img, strong }) => img === window.editor.surface.querySelector('img') && strong === img.parentElement!.querySelector('strong'))).toBe(true);
  await expect(page.locator('.alignment-form-editor img')).toHaveAttribute('alt', 'Original');
  await expect(page.locator('.alignment-form-editor img')).toHaveAttribute('width', '120');
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
  await button(page, 'Center image').click();
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo() }))).toEqual({ html: before, undo: false });
  await page.evaluate(() => window.editor.redo());
  await expect(page.locator('.alignment-form-editor img')).toHaveCSS('display', 'block');
});

test('all-mode controls localize and reset, while readonly/IME and destroyed controls cannot mutate', async ({ page }) => {
  await initialize(page, 'all');
  await button(page, 'Align image right').click();
  await page.evaluate(() => window.editor.setLocale('ru'));
  await expect(form(page).getByRole('group', { name: 'Выравнивание изображения', exact: true })).toBeVisible();
  await expect(button(page, 'Изображение справа')).toHaveAttribute('aria-pressed', 'true');
  await button(page, 'Сбросить выравнивание изображения').click();
  await expect(button(page, 'Сбросить выравнивание изображения')).toHaveAttribute('aria-pressed', 'true');
  const before = await page.evaluate(() => window.editor.getHTML());
  await page.evaluate(() => window.editor.setReadOnly(true));
  await expect(button(page, 'Изображение слева')).toBeDisabled();
  await button(page, 'Изображение слева').dispatchEvent('click');
  await page.evaluate(() => {
    window.editor.setReadOnly(false);
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  });
  await expect(button(page, 'Изображение по центру')).toBeDisabled();
  await button(page, 'Изображение по центру').dispatchEvent('click');
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
  await page.evaluate(() => window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  await expect(button(page, 'Изображение слева')).toBeEnabled();
  const retained = await button(page, 'Изображение слева').elementHandle();
  await page.evaluate(() => window.alignmentImageForm.destroy());
  await retained!.evaluate((element) => element.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
  await expect(form(page)).toHaveCount(0);
});

test('focus-time selection redirection and external replacement cannot apply an old form action', async ({ page }) => {
  await initialize(page);
  await form(page).getByLabel('Alt', { exact: true }).focus();
  const before = await page.evaluate(() => window.editor.getHTML());
  await page.evaluate(() => {
    window.editor.surface.addEventListener('focusin', () => {
      const text = window.editor.surface.querySelector('p')!.firstChild!;
      const range = document.createRange();
      range.setStart(text, 2); range.collapse(true);
      const native = document.getSelection()!;
      native.removeAllRanges(); native.addRange(range);
    }, { once: true });
  });
  await button(page, 'Align image left').click();
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo() }))).toEqual({ html: before, undo: false });
  await page.evaluate(() => {
    window.alignmentImageAPI.select(window.editor.surface.querySelector('img')!);
    window.alignmentImageForm.refresh();
  });
  await form(page).getByLabel('Alt', { exact: true }).focus();
  await page.evaluate(() => {
    window.editor.surface.addEventListener('focusin', () => {
      window.editor.setHTML('<p><img src="/logo.svg?replacement" alt="External">Tail</p>');
    }, { once: true });
  });
  await button(page, 'Align image right').click();
  await expect(page.locator('.alignment-form-editor img')).toHaveAttribute('alt', 'External');
  expect(await page.locator('.alignment-form-editor img').evaluate((img) => ({ display: img.style.display, left: img.style.marginLeft, right: img.style.marginRight }))).toEqual({ display: '', left: '', right: '' });
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});
