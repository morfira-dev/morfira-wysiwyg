import { expect, test } from '@playwright/test';

for (const english of [false, true]) test(`whole-figure properties and caption caret retain their original context in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
  const t = (ru: string, en: string) => english ? en : ru;
  await page.goto(english ? '/en/playground' : '/');
  const content = page.locator('.mw-content');
  await expect(content).toBeVisible();
  const lab = page.locator('.lab-contextual-image');
  await lab.locator('summary').click();
  await lab.getByRole('button', { name: t('Загрузить пример свойств изображения', 'Load image properties sample'), exact: true }).click();
  const figure = content.locator('[title="Contextual image sample"]');
  const image = figure.locator('img');
  const caption = t('Исходная подпись', 'Original caption');
  const panel = page.locator('.mw-contextual-image');
  const properties = panel.getByRole('button', { name: t('Свойства изображения', 'Image properties'), exact: true });
  await lab.getByRole('button', { name: t('Выделить всю фигуру', 'Select whole figure'), exact: true }).click();
  await expect(panel).toBeVisible();
  await expect(panel.locator('img')).toHaveCount(0);
  expect(await figure.evaluate((node) => {
    const range = document.getSelection()?.getRangeAt(0);
    return Boolean(range && !range.collapsed && range.startContainer === node.parentNode && range.startContainer.childNodes[range.startOffset] === node);
  })).toBe(true);
  await properties.click();
  await panel.getByLabel('Alt', { exact: true }).fill('Figure context updated');
  await panel.getByLabel('Alt', { exact: true }).press('Enter');
  await expect(image).toHaveAttribute('alt', 'Figure context updated');
  await expect(figure.locator('figcaption em')).toHaveText(caption);
  const toolbar = page.getByRole('toolbar', { name: t('Форматирование', 'Formatting'), exact: true });
  await toolbar.locator('[data-mw-ui-action="undo"]').click();
  await expect(image).toHaveAttribute('alt', t('Знак Morfira', 'Morfira mark'));
  await expect(toolbar.locator('[data-mw-ui-action="undo"]')).toBeDisabled();
  await lab.getByRole('button', { name: t('Поставить курсор в подпись', 'Place caret in caption'), exact: true }).click();
  await expect(panel).toBeVisible();
  await properties.click();
  const href = panel.getByLabel(t('URL изображения', 'Image URL'), { exact: true });
  await expect(href).toBeFocused();
  await href.press('Escape');
  await expect(panel).toBeHidden();
  expect(await figure.evaluate((node) => {
    const native = document.getSelection();
    return { collapsed: native?.isCollapsed, node: native?.anchorNode === node.querySelector('figcaption em')?.firstChild, offset: native?.anchorOffset };
  })).toEqual({ collapsed: true, node: true, offset: 3 });
  await lab.getByRole('button', { name: t('Поставить курсор в подпись', 'Place caret in caption'), exact: true }).click();
  await page.getByRole('button', { name: t('Только чтение', 'Read only'), exact: true }).click();
  await expect(panel.locator('button:enabled:visible')).toHaveCount(0);
  await expect(panel.getByRole('form')).toHaveCount(0);
  await expect(figure.locator('figcaption em')).toHaveText(caption);
  await expect(content.locator('img')).toHaveCount(1);
});
