import { expect, test } from '@playwright/test';

for (const english of [false, true]) {
  test(`multi-block list paste demo retains suffix and following bodies in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
    const t = (ru: string, en: string) => english ? en : ru;
    await page.goto(english ? '/' : '/ru/');
    const content = page.locator('.mw-content');
    await expect(content).toBeVisible();
    const panel = page.locator('.lab-list-selection');
    await panel.locator('summary').click();
    await panel.getByLabel(t('Содержимое пункта', 'Item body'), { exact: true }).selectOption('multiblock');
    await panel.getByRole('button', { name: t('Загрузить пример с блоками', 'Load block-body sample'), exact: true }).click();
    const before = await content.innerHTML();
    const branch = await content.locator(':scope > ul > li > ul').elementHandle();
    await panel.getByRole('button', { name: t('Выделить пункты', 'Select items'), exact: true }).click();
    await panel.getByRole('button', { name: t('Заменить несколькими блоками', 'Replace with multiple blocks'), exact: true }).click();
    const items = content.locator(':scope > ul > li');
    await expect(items).toHaveCount(2);
    const first = items.first();
    await expect(first.locator(':scope > p')).toHaveText(['Alpha First', 'Lastta tail', 'After body']);
    await expect(first.locator(':scope > p').first()).toHaveCSS('text-align', 'center');
    await expect(first.locator(':scope > h3')).toHaveText('Middle');
    await expect(first.locator(':scope > h3')).toHaveCSS('text-align', 'right');
    await expect(first.locator(':scope > p').nth(1).locator('u')).toHaveText('Last');
    await expect(first.locator(':scope > p').nth(1).locator('em')).toHaveText('ta');
    await expect(first.locator(':scope > ul')).toHaveText('Nested branch');
    expect(await branch!.evaluate((node) => node.isConnected && node.parentElement === document.querySelector('.mw-content > ul > li'))).toBe(true);
    await expect(first.locator('p p, p h3, p ul')).toHaveCount(0);
    const after = await content.innerHTML();
    const toolbar = page.getByRole('toolbar', { name: t('Форматирование', 'Formatting'), exact: true });
    await toolbar.getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click();
    expect(await content.innerHTML()).toBe(before);
    expect(await content.evaluate(() => {
      const selection = document.getSelection()!;
      return { anchor: selection.anchorNode?.textContent, anchorOffset: selection.anchorOffset, focus: selection.focusNode?.textContent, focusOffset: selection.focusOffset };
    })).toEqual({ anchor: 'Beta', anchorOffset: 2, focus: 'Alpha ', focusOffset: 6 });
    await toolbar.getByRole('button', { name: t('Повторить', 'Redo'), exact: true }).click();
    expect(await content.innerHTML()).toBe(after);
    await page.keyboard.insertText('!');
    await expect(first.locator(':scope > p').nth(1)).toHaveText('Last!ta tail');
  });

  test(`multi-block list paste demo replaces text within one body in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
    const t = (ru: string, en: string) => english ? en : ru;
    await page.goto(english ? '/playground' : '/ru/playground');
    const content = page.locator('.mw-content');
    await expect(content).toBeVisible();
    const panel = page.locator('.lab-list-selection');
    await panel.locator('summary').click();
    await panel.getByLabel(t('Содержимое пункта', 'Item body'), { exact: true }).selectOption('paragraph');
    await panel.getByRole('button', { name: t('Загрузить пример с блоками', 'Load block-body sample'), exact: true }).click();
    const before = await content.innerHTML();
    const items = content.locator(':scope > ul > li');
    const untouched = await items.nth(1).innerHTML();
    await panel.getByRole('button', { name: t('Выделить текст одного блока', 'Select text in one body'), exact: true }).click();
    await panel.getByRole('button', { name: t('Заменить несколькими блоками', 'Replace with multiple blocks'), exact: true }).click();
    await expect(items).toHaveCount(3);
    await expect(items.first().locator(':scope > p')).toHaveText(['Alpha First', 'Last']);
    await expect(items.first().locator(':scope > h3')).toHaveText('Middle');
    expect(await items.nth(1).innerHTML()).toBe(untouched);
    await expect(items.first().locator('p p, p h3')).toHaveCount(0);
    await page.getByRole('toolbar', { name: t('Форматирование', 'Formatting'), exact: true })
      .getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click();
    expect(await content.innerHTML()).toBe(before);
    expect(await content.evaluate(() => {
      const selection = document.getSelection()!;
      return { anchor: selection.anchorNode?.textContent, anchorOffset: selection.anchorOffset, focus: selection.focusNode?.textContent, focusOffset: selection.focusOffset };
    })).toEqual({ anchor: 'one', anchorOffset: 3, focus: 'Alpha ', focusOffset: 6 });
    await page.getByRole('button', { name: t('Только чтение', 'Read only'), exact: true }).click();
    await expect(panel.getByRole('button', { name: t('Заменить несколькими блоками', 'Replace with multiple blocks'), exact: true })).toBeDisabled();
    await expect(panel.getByLabel(t('HTML из нескольких блоков', 'Multi-block HTML'), { exact: true })).toBeDisabled();
  });
}
