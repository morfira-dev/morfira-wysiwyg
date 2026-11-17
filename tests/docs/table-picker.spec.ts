import { expect, test } from '@playwright/test';

test('Russian homepage table quick picker previews without editing and inserts one undoable table', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const content = page.locator('.mw-content');
  await expect(content).toBeVisible();
  await page.getByLabel('Пример документа', { exact: true }).selectOption('empty');
  await page.getByRole('button', { name: 'Загрузить пример', exact: true }).click();
  await expect(content).toHaveText('');
  await content.click();
  const toolbar = page.getByRole('toolbar', { name: 'Форматирование', exact: true });
  await toolbar.locator('[data-mw-ui-action="table"]').click();
  const picker = page.getByRole('group', { name: 'Размер таблицы', exact: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const size = picker.getByRole('button', { name: 'Вставить таблицу: 2 × 3', exact: true });
  await size.hover();
  await expect(picker.getByRole('status')).toHaveText('2 × 3');
  await expect(content.locator('table')).toHaveCount(0);
  await size.click();
  await expect(content.locator('tr')).toHaveCount(2);
  await expect(content.locator('td')).toHaveCount(6);
  await toolbar.locator('[data-mw-ui-action="undo"]').click();
  await expect(content.locator('table')).toHaveCount(0);
});

test('English playground picker exposes keyboard labels and numeric fallback beyond eight', async ({ page }) => {
  await page.goto('/en/playground');
  const content = page.locator('.mw-content');
  await expect(content).toBeVisible();
  await page.getByLabel('Document sample', { exact: true }).selectOption('empty');
  await page.getByRole('button', { name: 'Load sample', exact: true }).click();
  await expect(content).toHaveText('');
  await content.click();
  const toolbar = page.getByRole('toolbar', { name: 'Formatting', exact: true });
  await toolbar.locator('[data-mw-ui-action="table"]').click();
  const picker = page.getByRole('group', { name: 'Table size', exact: true });
  const first = picker.getByRole('button', { name: 'Insert table: 1 × 1', exact: true });
  await first.focus();
  await first.press('ArrowRight');
  await expect(picker.getByRole('button', { name: 'Insert table: 1 × 2', exact: true })).toBeFocused();
  const form = page.locator('.mw-table-form');
  await form.getByLabel('Table rows', { exact: true }).fill('9');
  await form.getByLabel('Table columns', { exact: true }).fill('1');
  await form.getByRole('button', { name: 'Insert table', exact: true }).click();
  await expect(content.locator('tr')).toHaveCount(9);
  await expect(content.locator('td')).toHaveCount(9);
});
