import { expect, test } from '@playwright/test';

for (const english of [false, true]) {
  test(`rich multi-block insertion demo retains the suffix and backward history in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
    const t = (ru: string, en: string) => english ? en : ru;
    await page.goto(english ? '/en/' : '/');
    const content = page.locator('.mw-content');
    await expect(content).toBeVisible();
    await page.getByLabel(t('Пример документа', 'Document sample'), { exact: true }).selectOption('paste');
    await page.getByRole('button', { name: t('Загрузить пример', 'Load sample'), exact: true }).click();
    const before = await content.innerHTML();
    const panel = page.locator('.lab-paste');
    await panel.locator('summary').click();
    await panel.getByRole('button', { name: t('Выделить пример', 'Select sample'), exact: true }).click();
    await panel.getByLabel(t('HTML для вставки', 'HTML to insert'), { exact: true }).fill('<p><strong>First</strong></p><h3><u>Second</u></h3>');
    await panel.getByRole('button', { name: t('Вставить HTML', 'Insert HTML'), exact: true }).click();
    await expect(content.locator(':scope > p').first()).toHaveJSProperty('innerHTML', 'Alpha <strong>First</strong>');
    await expect(content.locator(':scope > h3')).toHaveJSProperty('innerHTML', '<u>Second</u><em>ta</em> tail');
    await expect(content.locator(':scope > h2')).toHaveCount(0);
    await expect(content.locator('td[rowspan="2"]')).toHaveText('Cell onetwo end');
    const toolbar = page.getByRole('toolbar', { name: t('Форматирование', 'Formatting'), exact: true });
    await toolbar.getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click();
    expect(await content.innerHTML()).toBe(before);
    expect(await content.evaluate(() => {
      const selection = document.getSelection()!;
      return { anchor: selection.anchorNode?.textContent, offset: selection.anchorOffset, focus: selection.focusNode?.textContent, focusOffset: selection.focusOffset };
    })).toEqual({ anchor: 'Beta', offset: 2, focus: 'Alpha ', focusOffset: 6 });
    await toolbar.getByRole('button', { name: t('Повторить', 'Redo'), exact: true }).click();
    await page.keyboard.insertText('!');
    await expect(content.locator(':scope > h3')).toHaveText('Second!ta tail');
  });

  test(`plain-text insertion demo keeps literal markup and merged cells in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
    const t = (ru: string, en: string) => english ? en : ru;
    await page.goto(english ? '/en/playground' : '/playground');
    const content = page.locator('.mw-content');
    await expect(content).toBeVisible();
    await page.getByLabel(t('Пример документа', 'Document sample'), { exact: true }).selectOption('paste');
    await page.getByRole('button', { name: t('Загрузить пример', 'Load sample'), exact: true }).click();
    const panel = page.locator('.lab-paste');
    await panel.locator('summary').click();
    await panel.getByLabel(t('Область вставки', 'Paste area'), { exact: true }).selectOption('cell');
    await panel.getByRole('button', { name: t('Выделить пример', 'Select sample'), exact: true }).click();
    await panel.getByLabel(t('Текст для вставки', 'Text to insert'), { exact: true }).fill('<literal>\nSecond');
    await panel.getByRole('button', { name: t('Вставить текст', 'Insert text'), exact: true }).click();
    const cell = content.locator('td[rowspan="2"]');
    await expect(cell.locator('p')).toHaveJSProperty('innerHTML', 'Cell &lt;literal&gt;<br>Second<em>o</em> end');
    await expect(cell.locator('h3')).toHaveCount(0);
    await expect(content.locator('td').nth(1)).toHaveText('Neighbor A');
    await expect(content.locator('td').nth(2)).toHaveText('Neighbor B');
    await expect(content.locator('blockquote')).toHaveText('Quote onetwo end');
    await page.getByRole('toolbar', { name: t('Форматирование', 'Formatting'), exact: true }).getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click();
    await expect(cell.locator('p')).toHaveText('Cell one');
    await expect(cell.locator('h3')).toHaveText('two end');
    await page.getByRole('button', { name: t('Только чтение', 'Read only'), exact: true }).click();
    await expect(panel.getByRole('button', { name: t('Вставить текст', 'Insert text'), exact: true })).toBeDisabled();
    await expect(panel.getByRole('button', { name: t('Вставить HTML', 'Insert HTML'), exact: true })).toBeDisabled();
  });
}
