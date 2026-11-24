import { expect, test } from '@playwright/test';

for (const english of [false, true]) {
  test(`multi-body list demo preserves following bodies across item replacement in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
    const t = (ru: string, en: string) => english ? en : ru;
    await page.goto(english ? '/' : '/ru/');
    const content = page.locator('.mw-content');
    await expect(content).toBeVisible();
    const panel = page.locator('.lab-list-selection');
    await panel.locator('summary').click();
    await panel.getByLabel(t('Содержимое пункта', 'Item body'), { exact: true }).selectOption('multiblock');
    await panel.getByRole('button', { name: t('Загрузить пример с блоками', 'Load block-body sample'), exact: true }).click();
    const before = await content.innerHTML();
    const items = content.locator(':scope > ul > li');
    await expect(items.first().locator(':scope > h2')).toHaveText('Middle');
    await expect(items.nth(1).locator(':scope > p')).toHaveText('After body');
    await panel.getByRole('button', { name: t('Выделить пункты', 'Select items'), exact: true }).click();
    await panel.getByLabel(t('Строчный HTML', 'Inline HTML'), { exact: true }).fill('<u>Rich</u>');
    await panel.getByRole('button', { name: t('Заменить HTML', 'Replace with HTML'), exact: true }).click();
    await expect(items).toHaveCount(2);
    await expect(items.first().locator(':scope > p')).toHaveText(['Alpha Richta tail', 'After body']);
    await expect(items.first().locator(':scope > p').first()).toHaveCSS('text-align', 'center');
    await expect(items.first().locator(':scope > h2, :scope > h3')).toHaveCount(0);
    await expect(items.first().locator(':scope > ul')).toHaveText('Nested branch');
    await expect(items.first().locator('p ul')).toHaveCount(0);
    await expect(items.last()).toHaveText('Keep item');
    await page.getByRole('toolbar', { name: t('Форматирование', 'Formatting'), exact: true })
      .getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click();
    expect(await content.innerHTML()).toBe(before);
    expect(await content.evaluate(() => {
      const selection = document.getSelection()!;
      return { anchor: selection.anchorNode?.textContent, anchorOffset: selection.anchorOffset, focus: selection.focusNode?.textContent, focusOffset: selection.focusOffset };
    })).toEqual({ anchor: 'Beta', anchorOffset: 2, focus: 'Alpha ', focusOffset: 6 });
  });

  test(`multi-body list demo selects two bodies in one item without removing neighbors in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
    const t = (ru: string, en: string) => english ? en : ru;
    await page.goto(english ? '/playground' : '/ru/playground');
    const content = page.locator('.mw-content');
    await expect(content).toBeVisible();
    const panel = page.locator('.lab-list-selection');
    await panel.locator('summary').click();
    await panel.getByLabel(t('Содержимое пункта', 'Item body'), { exact: true }).selectOption('multiblock');
    await panel.getByRole('button', { name: t('Загрузить пример с блоками', 'Load block-body sample'), exact: true }).click();
    const before = await content.innerHTML();
    const items = content.locator(':scope > ul > li');
    const nextItem = await items.nth(1).innerHTML();
    await panel.getByRole('button', { name: t('Выделить блоки пункта', 'Select item blocks'), exact: true }).click();
    await panel.getByLabel(t('Текст замены', 'Replacement text'), { exact: true }).fill('X');
    await panel.getByRole('button', { name: t('Заменить текстом', 'Replace with text'), exact: true }).click();
    await expect(items).toHaveCount(3);
    await expect(items.first().locator(':scope > p')).toHaveText('Alpha Xdle');
    await expect(items.first().locator(':scope > h2')).toHaveCount(0);
    expect(await items.nth(1).innerHTML()).toBe(nextItem);
    await page.getByRole('toolbar', { name: t('Форматирование', 'Formatting'), exact: true })
      .getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click();
    expect(await content.innerHTML()).toBe(before);
    expect(await content.evaluate(() => {
      const selection = document.getSelection()!;
      return { anchor: selection.anchorNode?.textContent, anchorOffset: selection.anchorOffset, focus: selection.focusNode?.textContent, focusOffset: selection.focusOffset };
    })).toEqual({ anchor: 'Middle', anchorOffset: 3, focus: 'Alpha ', focusOffset: 6 });
  });

  test(`multi-body list demo exposes internal Delete and item splitting in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
    const t = (ru: string, en: string) => english ? en : ru;
    await page.goto(english ? '/' : '/ru/');
    const content = page.locator('.mw-content');
    await expect(content).toBeVisible();
    const panel = page.locator('.lab-list-selection');
    await panel.locator('summary').click();
    await panel.getByLabel(t('Содержимое пункта', 'Item body'), { exact: true }).selectOption('multiblock');
    await panel.getByRole('button', { name: t('Загрузить пример с блоками', 'Load block-body sample'), exact: true }).click();
    const before = await content.innerHTML();
    const items = content.locator(':scope > ul > li');
    await panel.getByRole('button', { name: t('Курсор перед Delete', 'Caret before Delete'), exact: true }).click();
    await page.keyboard.press('Delete');
    await expect(items).toHaveCount(3);
    await expect(items.first().locator(':scope > p')).toHaveText('Alpha oneMiddle');
    await expect(items.first().locator(':scope > h2')).toHaveCount(0);
    await page.getByRole('toolbar', { name: t('Форматирование', 'Formatting'), exact: true })
      .getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click();
    expect(await content.innerHTML()).toBe(before);
    await panel.getByRole('button', { name: t('Курсор перед Delete', 'Caret before Delete'), exact: true }).click();
    await page.keyboard.press('Enter');
    await expect(items).toHaveCount(4);
    await expect(items.first().locator(':scope > p')).toHaveText('Alpha one');
    await expect(items.nth(1).locator(':scope > p')).toHaveJSProperty('innerHTML', '<br>');
    await expect(items.nth(1).locator(':scope > h2')).toHaveText('Middle');
    await expect(items.nth(2).locator(':scope > p')).toHaveText('After body');
    await expect(items.nth(2).locator(':scope > ul')).toHaveText('Nested branch');
  });
}
