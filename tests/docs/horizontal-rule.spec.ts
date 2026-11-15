import { expect, test } from '@playwright/test';

for (const english of [false, true]) test(`horizontal rule ready control in ${english ? 'English desktop playground' : 'Russian mobile homepage'}`, async ({ page }) => {
  const t = (ru: string, en: string) => english ? en : ru;
  await page.setViewportSize({ width: english ? 1280 : 390, height: 900 });
  await page.goto(english ? '/en/playground' : '/');
  const content = page.locator('.mw-content');
  await expect(content).toBeVisible();
  const panel = page.locator('.lab-horizontal-rule');
  await panel.locator('summary').click();
  await panel.getByRole('button', { name: t('Загрузить пример разделителя', 'Load horizontal rule sample'), exact: true }).click();
  const original = await content.innerHTML();
  const toolbar = page.getByRole('toolbar', { name: t('Форматирование', 'Formatting'), exact: true });
  const insert = toolbar.getByRole('button', { name: t('Разделитель', 'Horizontal rule'), exact: true });
  await expect(insert).toBeEnabled();
  await insert.click();
  await expect(content.locator(':scope > hr')).toHaveCount(1);
  const prefix = content.locator(':scope > p').first();
  const suffix = content.locator(':scope > hr + p');
  await expect(prefix).toHaveText('Alpha o');
  await expect(suffix).toHaveText('ne tail');
  await expect(suffix.locator('strong')).toHaveText('ne');
  expect(await suffix.evaluate((node) => {
    const selection = document.getSelection();
    return selection?.isCollapsed === true && !!selection.anchorNode && node.contains(selection.anchorNode);
  })).toBe(true);
  await toolbar.getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click();
  await expect(content.locator('hr')).toHaveCount(0);
  expect(await content.innerHTML()).toBe(original);
  await expect(toolbar.getByRole('button', { name: t('Отменить', 'Undo'), exact: true })).toBeDisabled();
  await toolbar.getByRole('button', { name: t('Повторить', 'Redo'), exact: true }).click();
  await expect(suffix).toHaveText('ne tail');
  await page.keyboard.type('X');
  await expect(suffix).toHaveText('Xne tail');
  await page.getByRole('button', { name: t('Только чтение', 'Read only'), exact: true }).click();
  await expect(insert).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
