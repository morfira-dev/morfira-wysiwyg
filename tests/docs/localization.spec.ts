import { expect, test } from '@playwright/test';

for (const english of [false, true]) test(`homepage table menus start localized and switch without document or history loss in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
  const t = (ru: string, en: string) => english ? en : ru;
  await page.goto(english ? '/en/' : '/');
  const content = page.locator('.mw-content');
  await expect(content).toBeVisible();
  await page.getByLabel(t('Пример документа', 'Document sample'), { exact: true }).selectOption('tables');
  await page.getByRole('button', { name: t('Загрузить пример', 'Load sample'), exact: true }).click();
  const cell = content.locator('td').first();
  const originalCell = await cell.textContent();
  await cell.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element.querySelector('p')!);
    range.collapse(false);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    (element.closest('.mw-content') as HTMLElement).focus();
  });
  await page.keyboard.type('X');
  await cell.click({ button: 'right' });
  const menu = page.locator('.mw-table-menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem').first()).toHaveText(t('Строка выше', 'Insert row above'));
  await expect(page.locator('.mw-table-resize')).toHaveAttribute('aria-label', t('Изменить ширину столбца', 'Resize column'));
  const before = await content.innerHTML();
  await expect(page.getByRole('button', { name: t('Отменить', 'Undo'), exact: true })).toBeEnabled();
  await page.getByLabel(t('Язык интерфейса редактора', 'Editor interface language'), { exact: true }).selectOption(english ? 'ru' : 'en');
  // Choosing a control outside the editor dismisses the context menu normally.
  await cell.click({ button: 'right' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem').first()).toHaveText(t('Insert row above', 'Строка выше'));
  expect(await content.innerHTML()).toBe(before);
  await expect(content).toHaveAttribute('aria-label', t('Попробуйте Morfira', 'Try Morfira'));
  // The full laboratory supplies its own toolbar labels in the page language.
  await page.getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click();
  await expect(content.locator('td').first()).toHaveText(originalCell!);
});

for (const english of [false, true]) test(`localization guide documents dictionaries and live default-toolbar switching in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
  const t = (ru: string, en: string) => english ? en : ru;
  await page.goto(english ? '/en/localization' : '/localization');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(t('Локализация интерфейса', 'Interface localization'));
  await expect(page.getByRole('cell', { name: 'tables.clipboardError', exact: true })).toHaveCount(1);
  await expect(page.getByRole('cell', { name: 'suggestions.results', exact: true })).toHaveCount(1);
  const content = page.locator('.mw-content');
  await expect(content).toBeVisible();
  await expect(page.getByRole('toolbar')).toHaveAttribute('aria-label', t('Форматирование', 'Formatting'));
  const original = await content.innerHTML();
  await content.locator('p').first().evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    (element.closest('.mw-content') as HTMLElement).focus();
  });
  await page.keyboard.type('X');
  const edited = await content.innerHTML();
  await page.getByLabel(t('Язык интерфейса редактора', 'Editor interface language'), { exact: true }).selectOption(english ? 'ru' : 'en');
  await expect(page.getByRole('toolbar')).toHaveAttribute('aria-label', t('Formatting', 'Форматирование'));
  await expect(page.getByRole('button', { name: t('Bold', 'Полужирный'), exact: true })).toBeVisible();
  expect(await content.innerHTML()).toBe(edited);
  await page.getByRole('button', { name: t('Undo', 'Отменить'), exact: true }).click();
  expect(await content.innerHTML()).toBe(original);
});
