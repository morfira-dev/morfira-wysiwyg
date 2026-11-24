import { expect, test } from '@playwright/test';

for (const english of [false, true]) test(`homepage mounts optional authoring editors and disposes them (${english ? 'EN' : 'RU'})`, async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(english ? '/' : '/ru/');
  const examples = page.locator('.home-optional-examples');
  for (const label of english
    ? ['Safe HTML source editing', 'Node views inside the editor', 'Positions through structural edits', 'Application extension recipes', 'Navigation around images and objects', 'Paragraph layout and format painter', 'Code blocks and highlighting']
    : ['Безопасный HTML-исходник', 'Узлы внутри области редактирования', 'Позиции через структурные изменения', 'Готовые рецепты расширений', 'Навигация вокруг изображений и объектов', 'Интервалы и перенос форматирования', 'Блоки кода и подсветка']) {
    const summary = examples.locator('summary').filter({ hasText: label });
    const panel = summary.locator('..');
    await expect(panel.locator('.mw-content')).toHaveCount(0);
    await summary.click();
    await expect(panel.locator('.mw-content')).toHaveCount(1);
    await summary.click();
    await expect(panel.locator('.mw-content')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
