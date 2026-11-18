import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { initializeRowHeight, rowHeightSample } from './table-row-height.fixture.js';

const form = (page: Page) => page.locator('.headers-tools .mw-table-properties-form');
const height = (page: Page) => form(page).locator('[data-mw-table-property="rowMinHeight"]');
const apply = (page: Page) => form(page).getByRole('button', { name: 'Apply properties', exact: true });

test('mixed row minimum drafts apply through Enter, localize, reset and preserve other table properties', async ({ page }) => {
  const value = rowHeightSample.replace('<tr style="color:navy">', '<tr style="color:navy;height:48px">')
    .replace('<tr><td><p>Second', '<tr style="height:72px"><td><p>Second');
  await initializeRowHeight(page, value, true);
  const before = await page.evaluate(() => window.editor.getHTML());
  await expect(height(page)).toHaveAccessibleName('Minimum row height (1–1000px)');
  await expect(height(page)).toHaveValue('');
  await expect(height(page)).toHaveAttribute('placeholder', 'Mixed values');
  await height(page).fill('88px');
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
  await height(page).press('Enter');
  expect(await page.evaluate(() => {
    const table = window.editor.surface.querySelector('table')!;
    return { rows: [...table.rows].map((row) => row.style.height), caption: table.caption!.textContent,
      headers: table.querySelectorAll('th').length, span: table.querySelector('td')!.rowSpan, changes: window.changes.length,
      draft: window.headerForm.getValues().rowMinHeight };
  })).toEqual({ rows: ['', '88px', '88px', ''], caption: 'Keep caption', headers: 3, span: 2, changes: 1, draft: '88px' });
  await page.evaluate(() => window.editor.setLocale('ru'));
  await expect(height(page)).toHaveAccessibleName('Минимальная высота строк (1–1000px)');
  await expect(height(page)).toHaveValue('88px');
  await height(page).fill('');
  await form(page).getByRole('button', { name: 'Применить свойства', exact: true }).click();
  expect(await page.evaluate(() => [...window.editor.surface.querySelector('table')!.rows].map((row) => row.style.height))).toEqual(['', '', '', '']);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => [...window.editor.surface.querySelector('table')!.rows].map((row) => row.style.height))).toEqual(['', '88px', '88px', '']);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
});

test('invalid row drafts remain atomic and readonly, IME and disposed controls cannot apply them', async ({ page }) => {
  await initializeRowHeight(page, rowHeightSample, true);
  const before = await page.evaluate(() => window.editor.getHTML());
  await height(page).fill('1001px');
  await form(page).locator('[data-mw-table-property="caption"]').fill('Do not apply');
  await apply(page).click();
  await expect(form(page).getByRole('status')).toHaveText('Could not apply table properties.');
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo() }))).toEqual({ html: before, undo: false });
  await expect(height(page)).toHaveValue('1001px');
  await height(page).fill('72px');
  await page.evaluate(() => window.editor.setReadOnly(true));
  await expect(height(page)).toBeDisabled();
  await apply(page).dispatchEvent('click');
  await page.evaluate(() => {
    window.editor.setReadOnly(false);
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  });
  await expect(height(page)).toBeDisabled();
  await apply(page).dispatchEvent('click');
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
  await page.evaluate(() => window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  const retained = await apply(page).elementHandle();
  await page.evaluate(() => window.headerForm.destroy());
  await retained!.evaluate((button) => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await expect(form(page)).toHaveCount(0);
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo() }))).toEqual({ html: before, undo: false });
});
