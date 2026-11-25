import { expect, test } from '@playwright/test';

for (const english of [false, true]) test(`homepage publishes accepted saves without exposing unsaved edits (${english ? 'EN' : 'RU'})`, async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  if (english) await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(english ? '/' : '/ru/');
  const summary = page.locator('.home-optional-examples > details > summary').filter({
    hasText: english ? 'Write, save and publish' : 'Написать, сохранить, опубликовать',
  });
  await summary.click();
  const workflow = page.locator('.publishing-workflow-example');
  const field = workflow.locator('.editor-field-example');
  const input = field.locator('.mw-content');
  const published = workflow.locator('.content-view-example .mw-content-view');
  await expect(input).toBeVisible();
  await expect(published).toBeVisible();
  const initial = await published.textContent();
  await input.fill('First saved article');
  await expect(published).toHaveText(initial!);
  await field.getByRole('button', { name: english ? 'Save publication' : 'Сохранить публикацию', exact: true }).click();
  await expect(published).toHaveText('First saved article');
  await input.fill('Unsaved second draft');
  await expect(published).toHaveText('First saved article');
  await expect(workflow.locator('.content-view-example .mw-editor')).toHaveCount(0);
  await expect(published).not.toHaveAttribute('contenteditable');
  await field.getByRole('button', { name: english ? 'Restore saved' : 'Восстановить сохранённое', exact: true }).click();
  await expect(input).toHaveText('First saved article');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  if (english) await workflow.screenshot({ path: 'artifacts/publishing-workflow-en.png' });
  await summary.click();
  await expect(workflow).toHaveCount(0);
  expect(errors).toEqual([]);
});
