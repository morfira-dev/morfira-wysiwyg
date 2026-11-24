import { expect, test } from '@playwright/test';

for (const english of [false, true]) test(`outline demo navigates the actual nested heading read-only in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
  const t = (ru: string, en: string) => english ? en : ru;
  await page.goto(english ? '/playground' : '/ru/');
  const content = page.locator('.mw-content');
  await expect(content).toBeVisible();
  const panel = page.locator('.lab-reading');
  await panel.locator('summary').click();
  await panel.getByRole('button', { name: t('Загрузить пример чтения', 'Load reading sample'), exact: true }).click();
  const outline = panel.locator('.mw-outline');
  const nested = outline.getByRole('button', { name: new RegExp(t('Вложенный раздел', 'Nested section')) });
  await expect(nested).toBeVisible();
  await expect(outline.getByRole('button')).toHaveCount(4);
  const before = await content.evaluate((node) => node.innerHTML);
  await page.getByRole('button', { name: t('Только чтение', 'Read only'), exact: true }).click();
  await expect(nested).toBeEnabled();
  await nested.click();
  expect(await page.evaluate(() => {
    const selection = document.getSelection();
    const heading = selection?.anchorNode?.nodeType === Node.ELEMENT_NODE
      ? selection.anchorNode as Element : selection?.anchorNode?.parentElement;
    const actual = heading?.closest('h3');
    return { collapsed: selection?.isCollapsed, label: actual?.textContent,
      nested: actual?.parentElement?.localName, inEditor: Boolean(actual?.closest('.mw-content')) };
  })).toEqual({ collapsed: true, label: t('Вложенный раздел', 'Nested section'), nested: 'blockquote', inEditor: true });
  expect(await content.evaluate((node) => node.innerHTML)).toBe(before);
  await expect(content.locator('[id]')).toHaveCount(0);
  const toolbar = page.getByRole('toolbar', { name: t('Форматирование', 'Formatting'), exact: true });
  await expect(toolbar.locator('[data-mw-ui-action="undo"]')).toBeDisabled();
  await expect(panel.locator('[data-outline-hint]')).toContainText('read-only');
  await expect(panel.getByRole('link', { name: t('Подключение оглавления', 'Outline setup'), exact: true })).toHaveAttribute('href', english ? '/outline' : '/ru/outline');
});
