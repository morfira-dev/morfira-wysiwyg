import { expect, test } from '@playwright/test';

for (const english of [false, true]) test(`inline node view demo paints and saves canonical source (${english ? 'EN' : 'RU'})`, async ({ page }) => {
  const t = (ru: string, en: string) => english ? en : ru;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(english ? '/en/inline-node-views' : '/inline-node-views');
  const demo = page.locator('.inline-node-views-example');
  const chip = demo.locator('.visual-record-chip');
  await expect(chip).toHaveText('◆ Item 42');
  const output = demo.getByRole('textbox', { name: t('HTML визуального узла', 'Visual node HTML'), exact: true });
  await expect(output).toHaveValue('<p>Before <span data-mw-node="demo:visual" data-id="item-42">Item 42</span> after</p>');
  await demo.getByRole('button', { name: t('Обновить узел', 'Update node'), exact: true }).click();
  await expect(chip).toHaveText('◆ Updated 42');
  expect(await output.inputValue()).not.toContain('◆');
  await demo.getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click();
  await expect(chip).toHaveText('◆ Item 42');
  await chip.locator('..').click();
  await page.keyboard.press('Backspace');
  await expect(chip).toHaveCount(0);
  await expect(output).toHaveValue('<p>Before  after</p>');
  await demo.getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click();
  await expect(chip).toHaveText('◆ Item 42');
  await demo.getByRole('checkbox', { name: t('Только чтение', 'Read only'), exact: true }).check();
  await expect(demo.getByRole('button', { name: t('Обновить узел', 'Update node'), exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
});
