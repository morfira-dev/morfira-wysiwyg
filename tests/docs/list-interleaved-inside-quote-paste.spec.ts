import { expect, test } from '@playwright/test';

for (const english of [false, true]) for (const selected of [false, true]) for (const heading of [false, true]) {
  test(`inner quote in interleaved item ${selected ? 'selection' : 'caret'} ${heading ? 'heading' : 'multiple blocks'} in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
    const t = (ru: string, en: string) => english ? en : ru;
    await page.setViewportSize({ width: english ? 1280 : 390, height: 900 });
    await page.goto(english ? '/en/playground' : '/');
    const content = page.locator('.mw-content');
    await expect(content).toBeVisible();
    const panel = page.locator('.lab-list-selection');
    await panel.locator('summary').click();
    const labels = [t('Загрузить цитату среди блоков и веток', 'Load quote inside interleaved item'), t('Курсор в цитате среди веток', 'Caret in quote between branches'), t('Выделить блоки цитаты среди веток', 'Select quote bodies between branches')];
    await panel.getByRole('button', { name: labels[0], exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    const viewportWidth = page.viewportSize()!.width;
    for (const name of labels) {
      const box = await panel.getByRole('button', { name, exact: true }).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewportWidth + 1);
    }
    const fieldBox = await panel.getByLabel(t('HTML из нескольких блоков', 'Multi-block HTML'), { exact: true }).boundingBox();
    expect(fieldBox).not.toBeNull();
    expect(fieldBox!.x + fieldBox!.width).toBeLessThanOrEqual(viewportWidth + 1);
    const before = await content.innerHTML();
    const owner = content.locator('[title="Inner inter owner"]');
    const quote = owner.locator('[title="Inner inter quote"]');
    const outerTitles = ['Inner inter before', 'Inner inter prefix branch', 'Inner inter neighbor', 'Inner inter quote', 'Inner inter following branch', 'Inner inter after', 'Inner inter tail'];
    const originalQuote = await quote.elementHandle();
    const untouchedTitles = outerTitles.filter((title) => title !== 'Inner inter quote');
    const outerNodes = await Promise.all(untouchedTitles.map((title) => content.locator(`[title="${title}"]`).elementHandle()));
    const outerHTML = await Promise.all(outerNodes.map((node) => node!.evaluate((node) => node.outerHTML)));
    const keptChildren = await Promise.all(['Inner inter quote before', 'Inner inter quote after'].map((title) => quote.locator(`[title="${title}"]`).elementHandle()));
    await panel.getByLabel(t('HTML из нескольких блоков', 'Multi-block HTML'), { exact: true }).fill('<p title="Inner inserted first">First</p><h4 title="Inner inserted last">Last</h4>');
    await panel.getByLabel(t('HTML одиночного заголовка', 'Single heading HTML'), { exact: true }).fill('<h2 title="Inner inserted heading" style="text-align: right">Title</h2>');
    await panel.getByRole('button', { name: labels[selected ? 2 : 1], exact: true }).click();
    await panel.getByRole('button', { name: t('Вставить цитату', 'Insert quote'), exact: true }).click();
    expect(await content.innerHTML()).toBe(before);
    await panel.getByRole('button', { name: heading ? t('Вставить заголовок', 'Insert heading') : t('Заменить несколькими блоками', 'Replace with multiple blocks'), exact: true }).click();
    expect(await originalQuote!.evaluate((node) => node.isConnected && node === document.querySelector('[title="Inner inter quote"]'))).toBe(true);
    for (const node of keptChildren) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
    for (let index = 0; index < outerNodes.length; index++) {
      expect(await outerNodes[index]!.evaluate((node) => ({ connected: node.isConnected, html: node.outerHTML }))).toEqual({ connected: true, html: outerHTML[index] });
    }
    expect(await owner.evaluate((node) => [...node.children].map((child) => child.getAttribute('title')))).toEqual(outerTitles);
    await expect(owner.locator(':scope > [title^="Inner inserted"]')).toHaveCount(0);
    await expect(quote).toHaveCSS('text-align', 'center');
    await expect(content.locator('blockquote blockquote')).toHaveCount(0);
    await expect(content.locator(':scope > ul > li')).toHaveCount(2);
    await expect(content.locator(':scope > p')).toHaveText('Keep paragraph');
    if (heading) {
      await expect(quote.locator(':scope > h2[title="Inner inserted heading"]')).toHaveText('Title');
      await expect(quote.locator(':scope > h2[title="Inner inserted heading"]')).toHaveCSS('text-align', 'right');
      const suffixTitle = selected ? 'Inner inter end' : 'Inner inter start';
      await expect(quote.locator(`[title="${suffixTitle}"]`).last()).toHaveText(selected ? 'ta tail' : 'ne');
      expect(await quote.evaluate((root) => {
        const suffix = root.querySelector('[title="Inner inserted heading"]')!.nextElementSibling!;
        const selection = document.getSelection()!;
        return { node: selection.anchorNode === suffix, offset: selection.anchorOffset, collapsed: selection.isCollapsed };
      })).toEqual({ node: true, offset: 0, collapsed: true });
    } else {
      await expect(quote.locator(':scope > [title="Inner inter start"]')).toHaveText(selected ? 'Alpha First' : 'Alpha oFirst');
      await expect(quote.locator(':scope > [title="Inner inserted last"]')).toHaveText(selected ? 'Lastta tail' : 'Lastne');
      await expect(quote.locator('[title="Inner inserted first"]')).toHaveCount(0);
      expect(await quote.evaluate((root) => {
        const body = root.querySelector('[title="Inner inserted last"]')!;
        const range = document.getSelection()!.getRangeAt(0);
        const prefix = document.createRange();
        prefix.selectNodeContents(body);
        prefix.setEnd(range.startContainer, range.startOffset);
        return { inside: body.contains(range.startContainer), prefix: prefix.toString(), collapsed: range.collapsed };
      })).toEqual({ inside: true, prefix: 'Last', collapsed: true });
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
    for (const name of labels) await expect(panel.getByRole('button', { name, exact: true })).toBeDisabled();
  });
}
