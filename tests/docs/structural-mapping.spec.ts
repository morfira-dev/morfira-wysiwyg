import { expect, test } from '@playwright/test';

for (const english of [false, true]) test(`structural mapping demo preserves paths through split, branch move and history (${english ? 'EN' : 'RU'})`, async ({ page }) => {
  const t = (russian: string, translated: string) => english ? translated : russian;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(english ? '/structural-mapping' : '/ru/structural-mapping');
  const demo = page.locator('.structural-mapping-example');
  const points = demo.locator('.structural-mapping-points');
  await expect(points).toHaveText('[{"path":[0],"offset":5,"deleted":false},{"path":[2,0,1,0,0],"offset":3,"deleted":false}]');
  await demo.getByRole('button', { name: t('Разделить абзац', 'Split paragraph'), exact: true }).click();
  await expect(points).toHaveText('[{"path":[1],"offset":0,"deleted":false},{"path":[3,0,1,0,0],"offset":3,"deleted":false}]');
  await demo.getByRole('button', { name: t('Поднять вложенный пункт', 'Lift nested item'), exact: true }).click();
  await expect(points).toHaveText('[{"path":[1],"offset":0,"deleted":false},{"path":[3,1,0],"offset":3,"deleted":false}]');
  await expect(demo.locator('.mw-content')).toContainText('NestedBranch');
  await demo.getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click();
  await expect(points).toHaveText('[{"path":[1],"offset":0,"deleted":false},{"path":[3,0,1,0,0],"offset":3,"deleted":false}]');
  expect(errors).toEqual([]);
});
