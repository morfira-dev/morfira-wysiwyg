import { expect, test } from '@playwright/test';

for (const english of [false, true]) {
  test(`list-item replacement demo retains its trailing branch and backwards history in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
    const t = (ru: string, en: string) => english ? en : ru;
    await page.goto(english ? '/' : '/ru/');
    const content = page.locator('.mw-content');
    await expect(content).toBeVisible();
    await page.getByLabel(t('Пример документа', 'Document sample'), { exact: true }).selectOption('list-selection');
    await page.getByRole('button', { name: t('Загрузить пример', 'Load sample'), exact: true }).click();
    const before = await content.innerHTML();
    const panel = page.locator('.lab-list-selection');
    await panel.locator('summary').click();
    await panel.getByRole('button', { name: t('Выделить пункты', 'Select items'), exact: true }).click();
    await panel.getByLabel(t('Текст замены', 'Replacement text'), { exact: true }).fill('X');
    await panel.getByRole('button', { name: t('Заменить текстом', 'Replace with text'), exact: true }).click();
    const items = content.locator(':scope > ul > li');
    await expect(items).toHaveCount(2);
    await expect(items.first()).toHaveJSProperty('innerHTML', 'Alpha X<em>ta</em> tail<ul><li>Nested branch</li></ul>');
    await expect(items.last()).toHaveText('Keep item');
    await expect(content.locator(':scope > p')).toHaveText('Keep paragraph');
    const toolbar = page.getByRole('toolbar', { name: t('Форматирование', 'Formatting'), exact: true });
    await toolbar.getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click();
    expect(await content.innerHTML()).toBe(before);
    expect(await content.evaluate(() => {
      const selection = document.getSelection()!;
      return { anchor: selection.anchorNode?.textContent, anchorOffset: selection.anchorOffset, focus: selection.focusNode?.textContent, focusOffset: selection.focusOffset };
    })).toEqual({ anchor: 'Beta', anchorOffset: 2, focus: 'Alpha ', focusOffset: 6 });
    await panel.getByLabel(t('Строчный HTML', 'Inline HTML'), { exact: true }).fill('<u>Rich</u>');
    await panel.getByRole('button', { name: t('Заменить HTML', 'Replace with HTML'), exact: true }).click();
    await expect(items.first()).toHaveJSProperty('innerHTML', 'Alpha <u>Rich</u><em>ta</em> tail<ul><li>Nested branch</li></ul>');
  });

  test(`forward Delete demo joins item bodies without dropping nested branches in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
    const t = (ru: string, en: string) => english ? en : ru;
    await page.goto(english ? '/playground' : '/ru/playground');
    const content = page.locator('.mw-content');
    await expect(content).toBeVisible();
    await page.getByLabel(t('Пример документа', 'Document sample'), { exact: true }).selectOption('list-selection');
    await page.getByRole('button', { name: t('Загрузить пример', 'Load sample'), exact: true }).click();
    const before = await content.innerHTML();
    const panel = page.locator('.lab-list-selection');
    await panel.locator('summary').click();
    await panel.getByRole('button', { name: t('Курсор перед Delete', 'Caret before Delete'), exact: true }).click();
    await page.keyboard.press('Delete');
    const items = content.locator(':scope > ul > li');
    await expect(items).toHaveCount(2);
    await expect(items.first()).toHaveJSProperty('innerHTML', 'Alpha <strong>one</strong><em>Beta</em> tail<ul><li>Nested branch</li></ul>');
    await expect(items.last()).toHaveText('Keep item');
    await page.getByRole('toolbar', { name: t('Форматирование', 'Formatting'), exact: true }).getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click();
    expect(await content.innerHTML()).toBe(before);
    await page.getByRole('button', { name: t('Только чтение', 'Read only'), exact: true }).click();
    await expect(panel.getByRole('button', { name: t('Заменить текстом', 'Replace with text'), exact: true })).toBeDisabled();
    await expect(panel.getByRole('button', { name: t('Заменить HTML', 'Replace with HTML'), exact: true })).toBeDisabled();
  });
}
