import { expect, test } from '@playwright/test';

for (const english of [false, true]) {
  for (const selected of [false, true]) test(`list quote demo ${selected ? 'replaces selected items' : 'splits at a caret'} in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
    const t = (ru: string, en: string) => english ? en : ru;
    await page.goto(english ? '/en/playground' : '/');
    const content = page.locator('.mw-content');
    await expect(content).toBeVisible();
    const panel = page.locator('.lab-list-selection');
    await panel.locator('summary').click();
    await panel.getByLabel(t('Содержимое пункта', 'Item body'), { exact: true }).selectOption(selected ? 'multiblock' : 'paragraph');
    await panel.getByRole('button', { name: t('Загрузить пример с блоками', 'Load block-body sample'), exact: true }).click();
    const before = await content.innerHTML();
    const items = content.locator(':scope > ul > li');
    const branch = await items.nth(1).locator(':scope > ul').elementHandle();
    if (selected) await panel.getByRole('button', { name: t('Выделить пункты', 'Select items'), exact: true }).click();
    else {
      await panel.getByLabel(t('Позиция вставки блоков', 'Block insertion position'), { exact: true }).selectOption('middle');
      await panel.getByRole('button', { name: t('Курсор для вставки блоков', 'Caret for block insertion'), exact: true }).click();
    }
    await panel.getByRole('button', { name: t('Вставить цитату', 'Insert quote'), exact: true }).click();
    const quote = content.locator('blockquote[title="Inserted quote"]');
    await expect(quote).toHaveCSS('text-align', 'right');
    await expect(quote.locator(':scope > p > em')).toHaveText('Quote');
    await expect(quote.locator(':scope > h3')).toHaveText('Source');
    await expect(items).toHaveCount(selected ? 2 : 3);
    await expect(items.first().locator(':scope > p').first()).toHaveText(selected ? 'Alpha ' : 'Alpha o');
    await expect(items.first().locator(':scope > p').first()).toHaveCSS('text-align', 'center');
    expect(await quote.evaluate((node) => ({ parent: node.parentElement?.localName, suffixTag: node.nextElementSibling?.localName, suffix: node.nextElementSibling?.textContent })))
      .toEqual({ parent: 'li', suffixTag: selected ? 'h3' : 'p', suffix: selected ? 'ta tail' : 'ne' });
    expect(await content.evaluate((root) => {
      const quote = root.querySelector('[title="Inserted quote"]')!;
      const selection = document.getSelection()!;
      return { suffix: selection.anchorNode === quote.nextElementSibling, offset: selection.anchorOffset, collapsed: selection.isCollapsed };
    })).toEqual({ suffix: true, offset: 0, collapsed: true });
    expect(await branch!.evaluate((node) => node.isConnected)).toBe(true);
    if (selected) {
      await expect(items.first().locator(':scope > p').last()).toHaveText('After body');
      expect(await branch!.evaluate((node) => node.parentElement === document.querySelector('.mw-content > ul > li'))).toBe(true);
    }
    await expect(content.locator('p blockquote, h3 blockquote, blockquote ul')).toHaveCount(0);
    const after = await content.innerHTML();
    await page.keyboard.insertText('X');
    await expect(content.locator('blockquote[title="Inserted quote"] + p, blockquote[title="Inserted quote"] + h3')).toHaveText(selected ? 'Xta tail' : 'Xne');
    const toolbar = page.getByRole('toolbar', { name: t('Форматирование', 'Formatting'), exact: true });
    await toolbar.getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click();
    expect(await content.innerHTML()).toBe(after);
    await toolbar.getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click();
    expect(await content.innerHTML()).toBe(before);
    expect(await content.evaluate(() => {
      const selection = document.getSelection()!;
      return { anchor: selection.anchorNode?.textContent, anchorOffset: selection.anchorOffset, focus: selection.focusNode?.textContent, focusOffset: selection.focusOffset };
    })).toEqual(selected ? { anchor: 'Beta', anchorOffset: 2, focus: 'Alpha ', focusOffset: 6 } : { anchor: 'one', anchorOffset: 1, focus: 'one', focusOffset: 1 });
    await toolbar.getByRole('button', { name: t('Повторить', 'Redo'), exact: true }).click();
    expect(await content.innerHTML()).toBe(after);
    await page.getByRole('button', { name: t('Только чтение', 'Read only'), exact: true }).click();
    await expect(panel.getByRole('button', { name: t('Вставить цитату', 'Insert quote'), exact: true })).toBeDisabled();
    await expect(panel.getByLabel(t('HTML цитаты', 'Quote HTML'), { exact: true })).toBeDisabled();
  });
}
