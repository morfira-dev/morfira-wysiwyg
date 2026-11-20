import { expect, test } from '@playwright/test';

for (const english of [false, true]) test(`demo color pickers apply on confirmation without Apply in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
  const t = (ru: string, en: string) => english ? en : ru;
  await page.goto(english ? '/en/playground' : '/');
  const content = page.locator('.mw-content');
  await expect(content).toBeVisible();
  // Use an existing public sample and real text boundaries; no editor internals.
  await page.getByLabel(t('Пример документа', 'Document sample'), { exact: true }).selectOption('input');
  await page.getByRole('button', { name: t('Загрузить пример', 'Load sample'), exact: true }).click();
  const original = await content.innerHTML();
  await content.evaluate((root) => {
    const text = root.querySelector(':scope > p')!.firstChild!;
    (root as HTMLElement).focus();
    document.getSelection()!.setBaseAndExtent(text, 5, text, 0);
    document.dispatchEvent(new Event('selectionchange'));
  });
  const colors = page.locator('.lab-color-controls');
  const textPicker = colors.getByLabel(t('Цвет текста', 'Text color'), { exact: true });
  await textPicker.dispatchEvent('pointerdown');
  await textPicker.focus();
  await textPicker.evaluate((node) => {
    document.getSelection()!.removeAllRanges();
    const input = node as HTMLInputElement;
    input.value = '#123456';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(content.locator(':scope > p').first().locator('span')).toHaveCSS('color', 'rgb(18, 52, 86)');
  const background = colors.getByLabel(t('Выделение цветом', 'Highlight color'), { exact: true });
  await background.dispatchEvent('pointerdown');
  await background.focus();
  await background.evaluate((node) => {
    document.getSelection()!.removeAllRanges();
    const input = node as HTMLInputElement;
    input.value = '#fedcba';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const highlighted = content.locator(':scope > p').first().locator('[style*="background-color"]');
  await expect(highlighted).toHaveText('Alpha');
  await expect(highlighted).toHaveCSS('background-color', 'rgb(254, 220, 186)');
  expect(await highlighted.evaluate((node) => {
    const text = document.createTreeWalker(node, NodeFilter.SHOW_TEXT).nextNode();
    return text?.parentElement ? getComputedStyle(text.parentElement).color : undefined;
  })).toBe('rgb(18, 52, 86)');
  await expect(content.locator(':scope > p').first()).toHaveText('Alpha one');
  const undo = page.getByRole('toolbar', { name: t('Форматирование', 'Formatting'), exact: true }).getByRole('button', { name: t('Отменить', 'Undo'), exact: true });
  await undo.click();
  await expect(content.locator(':scope > p').first().locator('[style*="background-color"]')).toHaveCount(0);
  await undo.click();
  expect(await content.innerHTML()).toBe(original);
  await page.getByRole('button', { name: t('Только чтение', 'Read only'), exact: true }).click();
  await expect(textPicker).toBeDisabled();
  await expect(background).toBeDisabled();
});
