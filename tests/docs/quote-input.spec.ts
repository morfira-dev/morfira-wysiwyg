import { expect, test } from '@playwright/test';

for (const english of [false, true]) test(`cross-quote input demo restores backward selection in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
  const t = (ru: string, en: string) => english ? en : ru;
  await page.goto(english ? '/en/playground' : '/');
  const content = page.locator('.mw-content');
  await expect(content).toBeVisible();
  const panel = page.locator('.lab-quote-input');
  await panel.locator('summary').click();
  await panel.getByRole('button', { name: t('Загрузить пример ввода через цитаты', 'Load cross-quote input sample'), exact: true }).click();
  const original = await content.innerHTML();
  await panel.getByRole('button', { name: t('Выделить между цитатами', 'Select between quotes'), exact: true }).click();
  await page.keyboard.type('X');
  await expect(content.locator('[title="Quote input start"]')).toHaveJSProperty('innerHTML', 'BeX<em>mma</em> tail');
  await expect(content.locator('[title="Quote input first"]')).toHaveText('Keep quoted prefixBeXmma tail');
  await expect(content.locator('[title="Quote input last"]')).toHaveText('Keep quoted suffix');
  const toolbar = page.getByRole('toolbar', { name: t('Форматирование', 'Formatting'), exact: true });
  await toolbar.getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click();
  expect(await content.innerHTML()).toBe(original);
  expect(await content.evaluate(() => {
    const selection = document.getSelection()!;
    return { anchor: selection.anchorNode?.textContent, offset: selection.anchorOffset, focus: selection.focusNode?.textContent };
  })).toEqual({ anchor: 'Gamma', offset: 2, focus: 'Beta ' });
  await page.getByRole('button', { name: t('Только чтение', 'Read only'), exact: true }).click();
  await expect(panel.getByRole('button', { name: t('Загрузить пример ввода через цитаты', 'Load cross-quote input sample'), exact: true })).toBeDisabled();
});
