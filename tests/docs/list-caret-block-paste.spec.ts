import { expect, test } from '@playwright/test';

for (const english of [false, true]) {
  for (const position of ['start', 'middle', 'end']) test(`list block insertion demo ${position} retains source text and its exact undo caret in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
    const t = (ru: string, en: string) => english ? en : ru;
    await page.goto(english ? '/en/playground' : '/');
    const content = page.locator('.mw-content');
    await expect(content).toBeVisible();
    const panel = page.locator('.lab-list-selection');
    await panel.locator('summary').click();
    const mode = position === 'start' ? 'inline' : position === 'middle' ? 'paragraph' : 'multiblock';
    await panel.getByLabel(t('Содержимое пункта', 'Item body'), { exact: true }).selectOption(mode);
    await panel.getByRole('button', { name: t('Загрузить пример с блоками', 'Load block-body sample'), exact: true }).click();
    const before = await content.innerHTML();
    const items = content.locator(':scope > ul > li');
    const next = await items.nth(1).innerHTML();
    await panel.getByLabel(t('Позиция вставки блоков', 'Block insertion position'), { exact: true }).selectOption(position);
    await panel.getByRole('button', { name: t('Курсор для вставки блоков', 'Caret for block insertion'), exact: true }).click();
    const originalCaret = await content.evaluate(() => {
      const selection = document.getSelection()!;
      return { text: selection.anchorNode?.textContent, offset: selection.anchorOffset, collapsed: selection.isCollapsed };
    });
    await panel.getByRole('button', { name: t('Заменить несколькими блоками', 'Replace with multiple blocks'), exact: true }).click();
    await expect(items).toHaveCount(3);
    const first = items.first();
    const expected = position === 'start' ? ['First', 'Middle', 'LastAlpha one']
      : position === 'middle' ? ['Alpha oFirst', 'Middle', 'Lastne'] : ['Alpha oneFirst', 'Middle', 'Last', 'Middle'];
    await expect(first.locator(':scope > p, :scope > h3, :scope > h2')).toHaveText(expected);
    await expect(first.locator(':scope > h3')).toHaveCSS('text-align', 'right');
    if (mode !== 'inline') await expect(first.locator(':scope > p').first()).toHaveCSS('text-align', 'center');
    expect(await items.nth(1).innerHTML()).toBe(next);
    await expect(first.locator('p p, p h3, p ul')).toHaveCount(0);
    expect(await content.evaluate(() => {
      const root = document.querySelector('.mw-content')!;
      const last = root.querySelector(':scope > ul > li > p:nth-of-type(2)')!;
      const range = document.getSelection()!.getRangeAt(0);
      const prefix = document.createRange();
      prefix.selectNodeContents(last);
      prefix.setEnd(range.startContainer, range.startOffset);
      return { text: prefix.toString(), collapsed: range.collapsed };
    })).toEqual({ text: 'Last', collapsed: true });
    const after = await content.innerHTML();
    const toolbar = page.getByRole('toolbar', { name: t('Форматирование', 'Formatting'), exact: true });
    await toolbar.getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click();
    expect(await content.innerHTML()).toBe(before);
    expect(await content.evaluate((root) => {
      const selection = document.getSelection()!;
      return { text: selection.anchorNode?.textContent, offset: selection.anchorOffset, collapsed: selection.isCollapsed, inFirst: root.querySelector(':scope > ul > li')!.contains(selection.anchorNode) };
    })).toEqual({ ...originalCaret, inFirst: true });
    expect(await content.evaluate((root, position) => {
      const item = root.querySelector(':scope > ul > li')!;
      const body = (item.firstElementChild?.matches('p,h1,h2,h3,h4,h5,h6') ? item.firstElementChild : item)!;
      const selection = document.getSelection()!;
      return position === 'middle' ? selection.anchorNode === body.querySelector('strong')!.firstChild : selection.anchorNode === body;
    }, position)).toBe(true);
    await toolbar.getByRole('button', { name: t('Повторить', 'Redo'), exact: true }).click();
    expect(await content.innerHTML()).toBe(after);
    await page.getByRole('button', { name: t('Только чтение', 'Read only'), exact: true }).click();
    await expect(panel.getByLabel(t('Позиция вставки блоков', 'Block insertion position'), { exact: true })).toBeDisabled();
    await expect(panel.getByRole('button', { name: t('Курсор для вставки блоков', 'Caret for block insertion'), exact: true })).toBeDisabled();
  });
}
