import { expect, test } from '@playwright/test';

for (const english of [false, true]) test(`cell text form applies merged selection and preserves descendant overrides in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
  const t = (ru: string, en: string) => english ? en : ru;
  await page.goto(english ? '/en/playground' : '/');
  const content = page.locator('.mw-content');
  await expect(content).toBeVisible();
  const panel = page.locator('.lab-tables');
  await panel.getByRole('button', { name: t('Загрузить пример текста в ячейках', 'Load cell text sample'), exact: true }).click();
  const table = content.locator('table[title="Cell typography sample"]');
  const text = await table.textContent();
  const form = page.getByRole('form', { name: t('Свойства таблицы', 'Table properties'), exact: true });
  const alignment = form.getByLabel(t('Выравнивание текста ячеек', 'Cell text alignment'), { exact: true });
  const direction = form.getByLabel(t('Направление текста ячеек', 'Cell text direction'), { exact: true });
  const apply = form.getByRole('button', { name: t('Применить свойства', 'Apply properties'), exact: true });
  await expect(alignment).toBeEnabled();
  await alignment.selectOption('right');
  await direction.selectOption('rtl');
  await apply.click();
  const chosen = table.locator('td').filter({ has: page.locator('strong,em,u') });
  expect(await chosen.evaluateAll((cells) => cells.map((cell) => ({ align: cell.style.textAlign, direction: cell.getAttribute('dir') })))).toEqual(Array.from({ length: 3 }, () => ({ align: 'right', direction: 'rtl' })));
  await expect(table.locator('[title="Explicit child"]')).toHaveAttribute('dir', 'ltr');
  expect(await table.locator('[title="Explicit child"]').evaluate((node) => node.style.textAlign)).toBe('left');
  const outside = table.locator('td').filter({ hasText: /^Outside [AB]$/ });
  expect(await outside.evaluateAll((cells) => cells.every((cell) => !cell.style.textAlign && !cell.hasAttribute('dir')))).toBe(true);
  expect(await table.textContent()).toBe(text);
  await expect(table.locator('td[rowspan="2"]')).toHaveCount(1);
  const undo = page.getByRole('toolbar', { name: t('Форматирование', 'Formatting'), exact: true }).locator('[data-mw-ui-action="undo"]');
  await undo.click();
  expect(await chosen.evaluateAll((cells) => cells.map((cell) => ({ align: cell.style.textAlign, direction: cell.getAttribute('dir') })))).toEqual([
    { align: 'left', direction: 'ltr' }, { align: 'right', direction: 'rtl' }, { align: '', direction: null },
  ]);
  await expect(undo).toBeDisabled();
  await panel.getByRole('button', { name: t('Загрузить пример текста в ячейках', 'Load cell text sample'), exact: true }).click();
  await alignment.selectOption('');
  await apply.click();
  expect(await chosen.evaluateAll((cells) => cells.every((cell) => !cell.style.textAlign))).toBe(true);
  expect(await chosen.evaluateAll((cells) => cells.map((cell) => cell.getAttribute('dir')))).toEqual(['ltr', 'rtl', null]);
  await expect(panel.locator('[data-cell-typography-hint]')).toContainText(t('дочернее оформление', 'descendant formatting'));
  await page.getByRole('button', { name: t('Только чтение', 'Read only'), exact: true }).click();
  await expect(alignment).toBeDisabled();
  await expect(direction).toBeDisabled();
});
