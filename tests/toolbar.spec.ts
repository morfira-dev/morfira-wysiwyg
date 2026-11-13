import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const initialize = async (page: Page, html: string) => { await page.goto('/'); await expect(page.getByRole('textbox')).toBeVisible(); await page.evaluate((value) => { window.editor.setHTML(value); window.editor.setSelection(0); }, html); };

test('mixed inline selection applies a uniform mark and clearing preserves outside text, lists and alignment', async ({ page }) => {
  await initialize(page, '<ul><li style="text-align: center"><strong>AB</strong><em><a href="https://example.com"><span style="color: red">CD</span></a></em>EF</li></ul>');
  await page.evaluate(() => window.editor.setSelection(1, 3));
  await expect(page.getByRole('button', { name: 'Полужирный', exact: true })).toHaveAttribute('aria-pressed', 'mixed');
  await page.getByRole('button', { name: 'Полужирный', exact: true }).click();
  expect(await page.evaluate(() => window.editor.getFormats().mixed)).not.toContain('bold');
  await page.getByRole('button', { name: 'Очистить форматирование', exact: true }).click();
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<ul><li style="text-align: center"><strong>A</strong>BCDEF</li></ul>');
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 1, length: 3 });
  await page.evaluate(() => window.editor.undo()); await expect(page.locator('.mw-content a')).toHaveText('CD');
});

test('history buttons and indentation availability reflect state and readonly', async ({ page }) => {
  await initialize(page, '<ul><li>A</li><li>B</li></ul>');
  await expect(page.getByRole('button', { name: 'Отменить', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Повторить', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Увеличить отступ', exact: true })).toBeDisabled();
  await page.evaluate(() => window.editor.setSelection(1, 1)); await expect(page.getByRole('button', { name: 'Увеличить отступ', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Увеличить отступ', exact: true }).click(); await expect(page.locator('.mw-content li ul li')).toHaveText('B');
  await expect(page.getByRole('button', { name: 'Отменить', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Отменить', exact: true }).click(); await expect(page.getByRole('button', { name: 'Повторить', exact: true })).toBeEnabled();
  await page.evaluate(() => window.editor.setReadOnly(true));
  expect(await page.locator('.mw-toolbar button:enabled').count()).toBe(0);
});

test('toolbar bookmarks keep the caret in an empty middle item', async ({ page }) => {
  await initialize(page, '<ul><li>A</li><li><br></li><li>B</li></ul>');
  await page.locator('.mw-content li').nth(1).evaluate((element) => { const r = document.createRange(); r.selectNodeContents(element); r.collapse(true); const s = window.getSelection()!; s.removeAllRanges(); s.addRange(r); });
  await expect(page.getByRole('button', { name: 'Увеличить отступ', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Увеличить отступ', exact: true }).click(); await page.keyboard.type('X');
  await expect(page.locator('.mw-content > ul > li').first().locator('ul > li')).toHaveText('X');
  await expect(page.locator('.mw-content > ul > li').last()).toHaveText('B');
});

test('keyboard navigation has one tab stop, skips disabled controls and restores selection on activation', async ({ page }) => {
  await initialize(page, '<p>Hello</p>'); await page.evaluate(() => window.editor.setSelection(0, 5));
  await page.getByRole('button', { name: 'Полужирный', exact: true }).focus(); await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: 'Курсив', exact: true })).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.locator('.mw-content em')).toHaveText('Hello');
  await page.getByRole('button', { name: 'Курсив', exact: true }).focus(); await page.keyboard.press('Home'); await expect(page.getByRole('button', { name: 'Отменить', exact: true })).toBeFocused();
  expect(await page.locator('.mw-toolbar button[tabindex="0"]').count()).toBe(1);
  await page.keyboard.press('Escape'); await expect(page.getByRole('textbox')).toBeFocused();
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 0, length: 5 });
});

test('external replacement resets saved selection and detached toolbar buttons are inert', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await initialize(page, '<p>Long original document</p>'); await page.evaluate(() => window.editor.setSelection(5, 8));
  await page.evaluate(() => window.editor.setHTML('<p>New</p>'));
  await expect(page.getByRole('button', { name: 'Отменить', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Полужирный', exact: true }).click(); await page.keyboard.type('X');
  await expect(page.getByRole('textbox')).toContainText('New');
  const result = await page.evaluate(() => { const button = document.querySelector<HTMLButtonElement>('.mw-toolbar button[aria-label="Полужирный"]')!; window.dispose(); window.dispose(); try { button.click(); return true; } catch { return false; } });
  expect(result).toBe(true); await expect(page.locator('.mw-toolbar')).toHaveCount(0); expect(errors).toEqual([]);
});
