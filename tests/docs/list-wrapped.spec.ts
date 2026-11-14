import { expect, test } from '@playwright/test';

for (const english of [false, true]) {
  test(`mixed paragraph/heading list demo replaces content and restores backward selection in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
    const t = (ru: string, en: string) => english ? en : ru;
    await page.goto(english ? '/en/' : '/');
    const content = page.locator('.mw-content');
    await expect(content).toBeVisible();
    const panel = page.locator('.lab-list-selection');
    await panel.locator('summary').click();
    await panel.getByLabel(t('Содержимое пункта', 'Item body'), { exact: true }).selectOption('mixed');
    await panel.getByRole('button', { name: t('Загрузить пример с блоками', 'Load block-body sample'), exact: true }).click();
    const items = content.locator(':scope > ul > li');
    await expect(items.first().locator(':scope > p')).toHaveText('Alpha one');
    await expect(items.nth(1).locator(':scope > h3')).toHaveText('Beta tail');
    const before = await content.innerHTML();
    await panel.getByRole('button', { name: t('Выделить пункты', 'Select items'), exact: true }).click();
    await panel.getByLabel(t('Строчный HTML', 'Inline HTML'), { exact: true }).fill('<u>Rich</u>');
    await panel.getByRole('button', { name: t('Заменить HTML', 'Replace with HTML'), exact: true }).click();
    await expect(items).toHaveCount(2);
    await expect(items.first().locator(':scope > p')).toHaveJSProperty('innerHTML', 'Alpha <u>Rich</u><em>ta</em> tail');
    await expect(items.first().locator(':scope > p')).toHaveCSS('text-align', 'center');
    await expect(items.first().locator(':scope > ul')).toHaveText('Nested branch');
    await expect(items.first().locator('p ul, p h3')).toHaveCount(0);
    await page.getByRole('toolbar', { name: t('Форматирование', 'Formatting'), exact: true })
      .getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click();
    expect(await content.innerHTML()).toBe(before);
    expect(await content.evaluate(() => {
      const selection = document.getSelection()!;
      return { anchor: selection.anchorNode?.textContent, anchorOffset: selection.anchorOffset, focus: selection.focusNode?.textContent, focusOffset: selection.focusOffset };
    })).toEqual({ anchor: 'Beta', anchorOffset: 2, focus: 'Alpha ', focusOffset: 6 });
  });

  test(`heading list demo keeps wrapper boundaries for Delete, Enter and Shift+Enter in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
    const t = (ru: string, en: string) => english ? en : ru;
    await page.goto(english ? '/en/playground' : '/playground');
    const content = page.locator('.mw-content');
    await expect(content).toBeVisible();
    const panel = page.locator('.lab-list-selection');
    await panel.locator('summary').click();
    await panel.getByLabel(t('Содержимое пункта', 'Item body'), { exact: true }).selectOption('heading');
    await panel.getByRole('button', { name: t('Загрузить пример с блоками', 'Load block-body sample'), exact: true }).click();
    const before = await content.innerHTML();
    const items = content.locator(':scope > ul > li');
    await panel.getByRole('button', { name: t('Курсор перед Delete', 'Caret before Delete'), exact: true }).click();
    await page.keyboard.press('Delete');
    await expect(items).toHaveCount(2);
    await expect(items.first().locator(':scope > h2')).toHaveJSProperty('innerHTML', 'Alpha <strong>one</strong><em>Beta</em> tail');
    await expect(items.first().locator(':scope > ul')).toHaveText('Nested branch');
    await page.getByRole('toolbar', { name: t('Форматирование', 'Formatting'), exact: true })
      .getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click();
    expect(await content.innerHTML()).toBe(before);
    await panel.getByRole('button', { name: t('Курсор перед Delete', 'Caret before Delete'), exact: true }).click();
    await page.keyboard.press('Enter');
    await expect(items).toHaveCount(4);
    await expect(items.nth(1).locator(':scope > h2')).toHaveJSProperty('innerHTML', '<br>');
    await expect(items.nth(1).locator(':scope > h2')).toHaveCSS('text-align', 'center');
    await page.keyboard.press('Shift+Enter');
    await expect(items).toHaveCount(4);
    await expect(items.nth(1).locator(':scope > h2 > br')).toHaveCount(2);
    await expect(items.nth(1).locator(':scope > br')).toHaveCount(0);
    await expect(items.nth(2).locator(':scope > ul')).toHaveText('Nested branch');
  });
}
