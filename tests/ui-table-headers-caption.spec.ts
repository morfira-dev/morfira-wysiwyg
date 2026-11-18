import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { headerTableSample, initializeTableHeaders } from './table-headers-caption.fixture.js';

const form = (page: Page) => page.locator('.headers-tools .mw-table-properties-form');
const field = (page: Page, key: string) => form(page).locator(`[data-mw-table-property="${key}"]`);
const apply = (page: Page) => form(page).getByRole('button', { name: 'Apply properties', exact: true });

test('new table controls apply dirty header/caption drafts together, localize and Undo once', async ({ page }) => {
  await initializeTableHeaders(page, headerTableSample, true);
  const before = await page.evaluate(() => window.editor.getHTML());
  await expect(field(page, 'headerRow')).toHaveAccessibleName('Header row');
  await expect(field(page, 'headerColumn')).toHaveAccessibleName('Header column');
  await expect(field(page, 'caption')).toHaveAccessibleName('Table caption');
  await expect(field(page, 'caption')).toHaveAttribute('maxlength', '5000');
  await expect(field(page, 'caption')).toHaveJSProperty('tagName', 'TEXTAREA');
  await field(page, 'headerRow').selectOption('true');
  await field(page, 'headerColumn').selectOption('true');
  await field(page, 'caption').fill(' <b>Literal table title</b>\nsecond line ');
  await field(page, 'caption').press('End');
  await field(page, 'caption').press('Enter');
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ changes: 0, undo: false });
  const captionDraft = await field(page, 'caption').inputValue();
  expect(captionDraft).toBe(' <b>Literal table title</b>\nsecond line \n');
  await apply(page).click();
  await expect(page.locator('.headers-editor th')).toHaveCount(5);
  expect(await page.locator('.headers-editor caption').evaluate((caption) => caption.textContent)).toBe(captionDraft);
  await expect(page.locator('.headers-editor caption b')).toHaveCount(0);
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
  await expect(apply(page)).toBeDisabled();
  await page.evaluate(() => window.editor.setLocale('ru'));
  await expect(field(page, 'headerRow')).toHaveAccessibleName('Строка заголовков');
  await expect(field(page, 'headerColumn')).toHaveAccessibleName('Столбец заголовков');
  await expect(field(page, 'caption')).toHaveAccessibleName('Подпись таблицы');
  await expect(field(page, 'headerRow')).toHaveValue('true');
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('a crossing merged header request reports failure without applying caption or losing existing content', async ({ page }) => {
  const merged = '<table><tbody><tr><td rowspan="2"><p><strong>Keep</strong></p></td><td><p>A</p></td></tr><tr><td><p>B</p></td></tr></tbody></table><p>After</p>';
  await initializeTableHeaders(page, merged, true);
  const before = await page.evaluate(() => window.editor.getHTML());
  await field(page, 'headerRow').selectOption('true');
  await field(page, 'caption').fill('Should not apply');
  await apply(page).click();
  await expect(form(page).getByRole('status')).toHaveText('Could not apply table properties.');
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo() }))).toEqual({ html: before, undo: false });
  await expect(field(page, 'caption')).toHaveValue('Should not apply');
  // Move to another actual cell to discard the failed whole-patch draft.
  await page.locator('.headers-editor td p').nth(1).click();
  await page.evaluate(() => window.headerForm.refresh());
  await expect(field(page, 'headerRow')).toHaveValue('');
  await field(page, 'headerColumn').selectOption('true');
  await field(page, 'caption').fill('Valid column');
  await apply(page).click();
  await expect(page.locator('.headers-editor th[rowspan="2"]')).toHaveText('Keep');
  await expect(page.locator('.headers-editor caption')).toHaveText('Valid column');
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
});
