import { expect, test } from '@playwright/test';

for (const english of [false, true]) {
  for (const selected of [false, true]) test(`inside-quote demo ${selected ? 'inserts a heading over child bodies' : 'inserts blocks at a caret'} in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
    const t = (ru: string, en: string) => english ? en : ru;
    await page.goto(english ? '/playground' : '/ru/');
    const content = page.locator('.mw-content');
    await expect(content).toBeVisible();
    const panel = page.locator('.lab-list-selection');
    await panel.locator('summary').click();
    await panel.getByRole('button', { name: t('Загрузить пример вставки внутри цитаты', 'Load insertion-inside-quote sample'), exact: true }).click();
    const before = await content.innerHTML();
    const quote = content.locator('blockquote[title="Editable quote"]');
    const handles = await Promise.all([
      quote.elementHandle(),
      content.locator('[title="Quote before"]').elementHandle(),
      content.locator('[title="Quote after"]').elementHandle(),
      content.locator('[title="Outer before"]').elementHandle(),
      content.locator('[title="Outer after"]').elementHandle(),
      content.locator('[title="Quote branch"]').elementHandle(),
    ]);
    await panel.getByRole('button', { name: selected ? t('Выделить блоки внутри цитаты', 'Select blocks inside quote') : t('Курсор внутри цитаты', 'Caret inside quote'), exact: true }).click();
    await panel.getByRole('button', { name: t('Вставить цитату', 'Insert quote'), exact: true }).click();
    expect(await content.innerHTML()).toBe(before);
    await panel.getByRole('button', { name: selected ? t('Вставить заголовок', 'Insert heading') : t('Заменить несколькими блоками', 'Replace with multiple blocks'), exact: true }).click();
    for (const handle of handles) expect(await handle!.evaluate((node) => node.isConnected)).toBe(true);
    expect(await handles[0]!.evaluate((node) => node === document.querySelector('.mw-content blockquote[title="Editable quote"]'))).toBe(true);
    await expect(quote).toHaveCSS('text-align', 'center');
    await expect(content.locator(':scope > ul > li')).toHaveCount(2);
    await expect(content.locator('[title="Quote owner"] > p')).toHaveText(['Outer before', 'Outer after']);
    await expect(content.locator('[title="Quote owner"] > ol')).toHaveText('Nested branch');
    await expect(content.locator('blockquote blockquote, blockquote ul, blockquote ol, p h2, p h3')).toHaveCount(0);
    if (selected) {
      await expect(quote.locator(':scope > p')).toHaveText(['Before quote body', 'Alpha ', 'After quote body']);
      await expect(quote.locator(':scope > h2[title="Inserted heading"]')).toHaveText('Title');
      await expect(quote.locator(':scope > h2')).toHaveCSS('text-align', 'right');
      await expect(quote.locator(':scope > h3')).toHaveText('ta tail');
      expect(await quote.evaluate((root) => ({ suffix: document.getSelection()!.anchorNode === root.querySelector('[title="Quote end"]'), offset: document.getSelection()!.anchorOffset, collapsed: document.getSelection()!.isCollapsed }))).toEqual({ suffix: true, offset: 0, collapsed: true });
    }
    else {
      await expect(quote.locator(':scope > p')).toHaveText(['Before quote body', 'Alpha oFirst', 'Lastne', 'After quote body']);
      await expect(quote.locator(':scope > h3')).toHaveText(['Middle', 'Beta tail']);
      expect(await quote.evaluate((root) => {
        const last = root.querySelector(':scope > h3')!.nextElementSibling!;
        const range = document.getSelection()!.getRangeAt(0);
        const prefix = document.createRange();
        prefix.selectNodeContents(last);
        prefix.setEnd(range.startContainer, range.startOffset);
        return { text: prefix.toString(), collapsed: range.collapsed, inside: last.contains(range.startContainer) };
      })).toEqual({ text: 'Last', collapsed: true, inside: true });
    }
    const after = await content.innerHTML();
    const toolbar = page.getByRole('toolbar', { name: t('Форматирование', 'Formatting'), exact: true });
    await toolbar.getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click();
    expect(await content.innerHTML()).toBe(before);
    expect(await content.evaluate(() => {
      const selection = document.getSelection()!;
      return { anchor: selection.anchorNode?.textContent, anchorOffset: selection.anchorOffset, focus: selection.focusNode?.textContent, focusOffset: selection.focusOffset };
    })).toEqual(selected ? { anchor: 'Beta', anchorOffset: 2, focus: 'Alpha ', focusOffset: 6 } : { anchor: 'one', anchorOffset: 1, focus: 'one', focusOffset: 1 });
    await toolbar.getByRole('button', { name: t('Повторить', 'Redo'), exact: true }).click();
    expect(await content.innerHTML()).toBe(after);
    await page.getByRole('button', { name: t('Только чтение', 'Read only'), exact: true }).click();
    for (const name of [t('Загрузить пример вставки внутри цитаты', 'Load insertion-inside-quote sample'), t('Курсор внутри цитаты', 'Caret inside quote'), t('Выделить блоки внутри цитаты', 'Select blocks inside quote')])
      await expect(panel.getByRole('button', { name, exact: true })).toBeDisabled();
  });
}
