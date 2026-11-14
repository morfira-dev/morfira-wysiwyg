import { expect, test } from '@playwright/test';

for (const english of [false, true]) {
  test(`block-boundary sample replaces a backwards range and restores history in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
    const t = (ru: string, en: string) => english ? en : ru;
    await page.goto(english ? '/en/' : '/');
    const content = page.locator('.mw-content');
    await expect(content).toBeVisible();
    await page.getByLabel(t('Пример документа', 'Document sample'), { exact: true }).selectOption('input');
    await page.getByRole('button', { name: t('Загрузить пример', 'Load sample'), exact: true }).click();
    await expect(content.locator(':scope > p').first()).toHaveText('Alpha one');
    const before = await content.innerHTML();
    await content.evaluate((root) => {
      const first = root.querySelector('p')!.firstChild!;
      const last = root.querySelector('h2 em')!.firstChild!;
      (root as HTMLElement).focus();
      document.getSelection()!.setBaseAndExtent(last, 2, first, 6);
    });
    await page.keyboard.type('X');
    const first = content.locator(':scope > p').first();
    await expect(first).toHaveJSProperty('innerHTML', 'Alpha X<em>ta</em> tail');
    await expect(content.locator(':scope > h2')).toHaveCount(0);
    await expect(content.locator(':scope > p').nth(1)).toHaveText('Keep');
    await expect(content.locator('td[rowspan="2"]')).toHaveCount(1);
    const toolbar = page.getByRole('toolbar', { name: t('Форматирование', 'Formatting'), exact: true });
    await toolbar.getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click();
    expect(await content.innerHTML()).toBe(before);
    expect(await content.evaluate(() => {
      const selection = document.getSelection()!;
      return { anchor: selection.anchorNode?.textContent, anchorOffset: selection.anchorOffset, focus: selection.focusNode?.textContent, focusOffset: selection.focusOffset };
    })).toEqual({ anchor: 'Beta', anchorOffset: 2, focus: 'Alpha ', focusOffset: 6 });
    await toolbar.getByRole('button', { name: t('Повторить', 'Redo'), exact: true }).click();
    await page.keyboard.type('Y');
    await expect(first).toHaveJSProperty('innerHTML', 'Alpha XY<em>ta</em> tail');
  });

  test(`block-boundary sample deletes within a merged cell without altering neighbors in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
    const t = (ru: string, en: string) => english ? en : ru;
    await page.goto(english ? '/en/playground' : '/playground');
    const content = page.locator('.mw-content');
    await expect(content).toBeVisible();
    await page.getByLabel(t('Пример документа', 'Document sample'), { exact: true }).selectOption('input');
    await page.getByRole('button', { name: t('Загрузить пример', 'Load sample'), exact: true }).click();
    const cell = content.locator('td[rowspan="2"]');
    await cell.evaluate((element) => {
      const range = document.createRange();
      range.setStart(element.querySelector('p')!.firstChild!, 5);
      range.setEnd(element.querySelector('h3 em')!.firstChild!, 1);
      (element.closest('.mw-content') as HTMLElement).focus();
      const selection = document.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await page.keyboard.press('Delete');
    await expect(cell.locator('p')).toHaveJSProperty('innerHTML', 'Cell <em>wo</em> end');
    await expect(cell.locator('h3')).toHaveCount(0);
    await expect(content.locator('td').nth(1)).toHaveText('Neighbor A');
    await expect(content.locator('td').nth(2)).toHaveText('Neighbor B');
    await expect(content.locator('blockquote')).toHaveText('Quote onetwo end');
    await page.getByRole('toolbar', { name: t('Форматирование', 'Formatting'), exact: true }).getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click();
    await expect(cell.locator('p')).toHaveText('Cell one');
    await expect(cell.locator('h3')).toHaveText('two end');
    await expect(cell).toHaveAttribute('rowspan', '2');
  });
}
