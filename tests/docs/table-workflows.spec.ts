import { expect, test } from '@playwright/test';

for (const english of [false, true]) test(`table workflow selects, pastes, copies and preserves readonly (${english ? 'EN' : 'RU'})`, async ({ page }) => {
  const t = (ru: string, en: string) => english ? en : ru;
  await page.goto(english ? '/table-workflows' : '/ru/table-workflows');
  const demo = page.locator('.table-workflows-example');
  const controls = demo.locator('.table-workflow-controls');
  await controls.getByRole('button', { name: t('Загрузить простую таблицу', 'Load simple table'), exact: true }).click();
  await controls.getByRole('button', { name: t('Выделить таблицу', 'Select table'), exact: true }).click();
  await expect(demo.locator('.table-workflow-region')).toContainText('2 × 2');
  await controls.getByRole('button', { name: t('Вставить учебный TSV', 'Paste sample TSV'), exact: true }).click();
  await expect(demo.locator('.mw-content table')).toContainText('Coffee');
  await controls.getByRole('button', { name: t('Выделить таблицу', 'Select table'), exact: true }).click();
  await controls.getByRole('button', { name: t('Скопировать HTML и TSV', 'Copy HTML and TSV'), exact: true }).click();
  await expect(demo.locator('.table-workflow-copy')).toContainText('Product\tQuantity');
  const before = await demo.locator('.mw-content').innerHTML();
  await controls.getByRole('checkbox', { name: t('Только чтение', 'Read only'), exact: true }).check();
  await expect(controls.getByRole('button', { name: t('Вставить учебный TSV', 'Paste sample TSV'), exact: true })).toBeDisabled();
  await controls.getByRole('button', { name: t('Выделить таблицу', 'Select table'), exact: true }).click();
  expect(await demo.locator('.mw-content').innerHTML()).toBe(before);
});
