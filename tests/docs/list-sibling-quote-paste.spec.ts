import { expect, test } from '@playwright/test';

for (const english of [false, true]) {
  for (const direction of ['between', 'into', 'out', 'whole'] as const) test(`sibling-item quote demo ${direction} in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
    const t = (ru: string, en: string) => english ? en : ru;
    await page.goto(english ? '/en/playground' : '/');
    const content = page.locator('.mw-content');
    await expect(content).toBeVisible();
    const panel = page.locator('.lab-list-selection');
    await panel.locator('summary').click();
    const load = t('Загрузить цитаты в соседних пунктах', 'Load sibling-item quote sample');
    await panel.getByRole('button', { name: load, exact: true }).click();
    const before = await content.innerHTML();
    const owner = content.locator('[title="Sibling owner"]');
    const originalOwner = await owner.elementHandle();
    const originalList = await content.locator('[title="Sibling list"]').elementHandle();
    const removedItems = await Promise.all(['Sibling middle item', 'Sibling last item'].map((title) => content.locator(`[title="${title}"]`).elementHandle()));
    const untouchedItem = await content.locator('[title="Sibling untouched"]').elementHandle();
    const actualOutsideSuffix = await content.locator('[title="Sibling outer end"]').elementHandle();
    const first = owner.locator('[title="Sibling first quote"]');
    const last = content.locator('[title="Sibling last quote"]');
    const actual = await Promise.all(['Sibling first quote', 'Sibling middle quote', 'Sibling last quote', 'Sibling first cut', 'Sibling quoted prefix', 'Sibling quoted suffix', 'Sibling keep', 'Sibling branch'].map((title) => content.locator(`[title="${title}"]`).elementHandle()));
    const labels = {
      between: t('Выделить цитаты соседних пунктов', 'Select quotes across sibling items'),
      into: t('Выделить до цитаты последнего пункта', 'Select into last item quote'),
      out: t('Выделить из цитаты до внешнего остатка', 'Select from quote into outside suffix'),
      whole: t('Выделить через цитаты всех пунктов', 'Select across all item quotes'),
    };
    await panel.getByLabel(t('HTML из нескольких блоков', 'Multi-block HTML'), { exact: true }).fill('<p title="Sibling incoming first" style="text-align: right"><strong>First</strong></p><h4 title="Sibling incoming last"><em>Last</em></h4>');
    await panel.getByRole('button', { name: labels[direction], exact: true }).click();
    await panel.getByRole('button', { name: t('Заменить несколькими блоками', 'Replace with multiple blocks'), exact: true }).click();
    await expect(owner.locator(':scope > p[title="Sibling incoming first"]')).toHaveText('First');
    await expect(owner.locator(':scope > p[title="Sibling incoming first"]')).toHaveCSS('text-align', 'right');
    await expect(owner.locator(':scope > h4[title="Sibling incoming last"]')).toHaveText('Last');
    await expect(owner.locator('blockquote [title^="Sibling incoming"]')).toHaveCount(0);
    await expect(content.locator('[title="Sibling middle quote"], [title="Sibling first cut"], [title="Sibling last cut"]')).toHaveCount(0);
    expect(await originalOwner!.evaluate((node) => node.isConnected)).toBe(true);
    expect(await originalList!.evaluate((node) => node.isConnected)).toBe(true);
    expect(await untouchedItem!.evaluate((node) => node.isConnected)).toBe(true);
    expect(await actualOutsideSuffix!.evaluate((node) => ({ connected: node.isConnected, owner: node.parentElement?.getAttribute('title') }))).toEqual({ connected: true, owner: 'Sibling owner' });
    for (const item of removedItems) expect(await item!.evaluate((node) => node.isConnected)).toBe(false);
    expect(await actual[1]!.evaluate((node) => node.isConnected)).toBe(false);
    expect(await actual[3]!.evaluate((node) => node.isConnected)).toBe(false);
    const keepFirst = direction === 'between' || direction === 'out';
    const keepLast = direction === 'between' || direction === 'into';
    expect(await actual[0]!.evaluate((node) => node.isConnected)).toBe(keepFirst);
    expect(await actual[2]!.evaluate((node) => node.isConnected)).toBe(keepLast);
    expect(await actual[4]!.evaluate((node) => node.isConnected)).toBe(keepFirst);
    expect(await actual[5]!.evaluate((node) => node.isConnected)).toBe(keepLast);
    for (const node of actual.slice(6)) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
    expect(await actual[6]!.evaluate((node) => node.parentElement?.getAttribute('title'))).toBe('Sibling owner');
    expect(await actual[7]!.evaluate((node) => node.parentElement?.getAttribute('title'))).toBe('Sibling owner');
    if (keepLast) expect(await actual[2]!.evaluate((node) => node.parentElement?.getAttribute('title'))).toBe('Sibling owner');
    await expect(first).toHaveCount(keepFirst ? 1 : 0);
    if (keepFirst) {
      await expect(first).toHaveCSS('text-align', 'right');
      await expect(first.locator(':scope > [title="Sibling first target"]')).toHaveText('Be');
      await expect(first.locator(':scope > [title="Sibling quoted prefix"]')).toHaveText('Keep quoted prefix');
    }
    await expect(last).toHaveCount(keepLast ? 1 : 0);
    if (keepLast) {
      await expect(last).toHaveCSS('text-align', 'center');
      await expect(last.locator(':scope > [title="Sibling last target"]')).toHaveText('mma tail');
      await expect(last.locator(':scope > [title="Sibling quoted suffix"]')).toHaveText('Keep quoted suffix');
    }
    await expect(owner.locator(':scope > [title="Sibling outer start"]')).toHaveText(keepFirst ? 'Alpha tail' : 'Al');
    await expect(owner.locator(':scope > [title="Sibling outer end"]')).toHaveText(keepLast ? 'Delta tail' : 'lta tail');
    await expect(owner.locator(':scope > [title="Sibling keep"]')).toHaveText('Keep body');
    await expect(owner.locator(':scope > [title="Sibling branch"]')).toHaveText('Nested branch');
    await expect(content.locator(':scope > ul > li')).toHaveCount(2);
    await expect(owner.locator(':scope > [title="Sibling before"]')).toHaveText('Before');
    expect(await owner.evaluate((node) => node.lastElementChild?.getAttribute('title'))).toBe('Sibling branch');
    await expect(content.locator(':scope > p')).toHaveText('Keep paragraph');
    expect(await owner.evaluate((root) => {
      const body = root.querySelector('[title="Sibling incoming last"]')!.nextElementSibling!;
      const selection = document.getSelection()!;
      return { caret: selection.anchorNode === body && selection.anchorOffset === 0 && selection.isCollapsed, text: body.textContent, placeholder: body.childNodes.length === 1 && body.firstChild?.nodeName === 'BR', nextQuote: body.nextElementSibling?.getAttribute('title') === 'Sibling last quote' };
    })).toEqual({ caret: true, text: keepLast ? '' : 'lta tail', placeholder: keepLast, nextQuote: keepLast });
    const after = await content.innerHTML();
    const toolbar = page.getByRole('toolbar', { name: t('Форматирование', 'Formatting'), exact: true });
    await toolbar.getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click();
    expect(await content.innerHTML()).toBe(before);
    expect(await content.evaluate(() => {
      const selection = document.getSelection()!;
      return { anchor: selection.anchorNode?.textContent, focus: selection.focusNode?.textContent, anchorOffset: selection.anchorOffset, focusOffset: selection.focusOffset };
    })).toEqual({ anchor: keepLast ? 'Gamma tail' : 'Delta tail', focus: keepFirst ? 'Beta tail' : 'Alpha tail', anchorOffset: 2, focusOffset: 2 });
    await toolbar.getByRole('button', { name: t('Повторить', 'Redo'), exact: true }).click();
    expect(await content.innerHTML()).toBe(after);
    await page.getByRole('button', { name: t('Только чтение', 'Read only'), exact: true }).click();
    for (const name of [load, ...Object.values(labels)]) await expect(panel.getByRole('button', { name, exact: true })).toBeDisabled();
  });
}
