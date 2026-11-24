import { expect, test } from '@playwright/test';

for (const english of [false, true]) test(`root object navigation example supports insertion and undo in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
  await page.goto(english ? '/block-navigation' : '/ru/block-navigation');
  const example = page.locator('.block-navigation-example');
  const content = example.locator('.mw-content');
  await expect(content).toBeVisible();
  const before = await content.innerHTML();
  await example.getByRole('button', { name: english ? 'Select divider' : 'Выбрать разделитель', exact: true }).click();
  await expect(example.getByRole('status')).toContainText('hr');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Inserted between objects');
  await expect(content.locator('p')).toContainText(['Before', 'Inserted between objects', 'After']);
  const undo = example.getByRole('button', { name: english ? 'Undo' : 'Отменить', exact: true });
  await undo.click();
  await undo.click();
  expect(await content.innerHTML()).toBe(before);
  await example.getByRole('checkbox', { name: 'Read-only', exact: true }).check();
  await expect(example.getByRole('button', { name: english ? 'Select image' : 'Выбрать изображение', exact: true })).toBeDisabled();
});
