import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { initializeTableHeaders } from './table-headers-caption.fixture.js';
import { cellBoxSample } from './table-cell-box.fixture.js';

const form = (page: Page) => page.locator('.headers-tools .mw-table-properties-form');
const field = (page: Page, key: string) => form(page).locator(`[data-mw-table-property="${key}"]`);
const apply = (page: Page) => form(page).getByRole('button', { name: 'Apply properties', exact: true });
const initialize = async (page: Page) => {
  await initializeTableHeaders(page, cellBoxSample, true);
  await page.evaluate(() => {
    window.headerTables.select({ row: 0, column: 0 }, { row: 0, column: 1 });
    window.headerForm.refresh();
  });
};

test('mixed cell-box drafts apply only dirty values, localize and reset borders independently', async ({ page }) => {
  await initialize(page);
  await expect(field(page, 'cellPadding')).toHaveAccessibleName('Cell padding (0–48px)');
  await expect(field(page, 'cellBorderWidth')).toHaveAccessibleName('Border width (0–12px)');
  await expect(field(page, 'cellBorderStyle')).toHaveAccessibleName('Border style');
  await expect(field(page, 'cellPadding')).toHaveAttribute('placeholder', 'Mixed values');
  await expect(field(page, 'cellBorderStyle')).toHaveValue('__mixed');
  const before = await page.evaluate(() => window.editor.getHTML());
  await field(page, 'cellPadding').fill('6px');
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
  await field(page, 'cellPadding').press('Enter');
  expect(await page.evaluate(() => {
    const state = window.headerProperties.getState();
    return [state.cellPadding, state.cellBorderWidth, state.cellBorderStyle, window.changes.length];
  })).toEqual(['6px', 'mixed', 'mixed', 1]);
  await field(page, 'cellBorderWidth').fill('3px');
  await field(page, 'cellBorderStyle').selectOption('dotted');
  await apply(page).click();
  await page.evaluate(() => window.editor.setLocale('ru'));
  await expect(field(page, 'cellPadding')).toHaveAccessibleName('Отступы ячеек (0–48px)');
  await expect(field(page, 'cellBorderWidth')).toHaveAccessibleName('Толщина границ (0–12px)');
  await expect(field(page, 'cellBorderStyle')).toHaveAccessibleName('Стиль границ');
  await expect(field(page, 'cellBorderStyle')).toHaveValue('dotted');
  await field(page, 'cellBorderWidth').fill('');
  await form(page).getByRole('button', { name: 'Применить свойства', exact: true }).click();
  expect(await page.evaluate(() => {
    const state = window.headerProperties.getState();
    return [state.cellPadding, state.cellBorderWidth, state.cellBorderStyle, window.changes.length];
  })).toEqual(['6px', false, 'dotted', 3]);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.headerProperties.getState().cellBorderWidth)).toBe('3px');
  await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo() }))).toEqual({ html: before, undo: false });
});

test('invalid cell-box drafts reject together and blocked or disposed controls cannot apply pending values', async ({ page }) => {
  await initialize(page);
  const before = await page.evaluate(() => window.editor.getHTML());
  await field(page, 'cellPadding').fill('49px');
  await field(page, 'caption').fill('Do not apply');
  await apply(page).click();
  await expect(form(page).getByRole('status')).toHaveText('Could not apply table properties.');
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo() }))).toEqual({ html: before, undo: false });
  await field(page, 'cellPadding').fill('8px');
  await page.evaluate(() => window.editor.setReadOnly(true));
  await expect(field(page, 'cellPadding')).toBeDisabled();
  await apply(page).dispatchEvent('click');
  await page.evaluate(() => {
    window.editor.setReadOnly(false);
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  });
  await expect(field(page, 'cellBorderStyle')).toBeDisabled();
  await apply(page).dispatchEvent('click');
  await page.evaluate(() => window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  const retained = await apply(page).elementHandle();
  await page.evaluate(() => window.headerForm.destroy());
  await retained!.evaluate((button) => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo() }))).toEqual({ html: before, undo: false });
});
