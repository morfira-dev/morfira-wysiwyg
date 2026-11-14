import { expect, test } from '@playwright/test';

for (const english of [false, true]) {
  for (const direction of ['between', 'into', 'out', 'whole'] as const) test(`interleaved quote demo ${direction} in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
    const t = (ru: string, en: string) => english ? en : ru;
    await page.goto(english ? '/en/playground' : '/');
    const content = page.locator('.mw-content');
    await expect(content).toBeVisible();
    const panel = page.locator('.lab-list-selection');
    await panel.locator('summary').click();
    const load = t('Загрузить блоки после веток', 'Load blocks-after-branches sample');
    await panel.getByRole('button', { name: load, exact: true }).click();
    const before = await content.innerHTML();
    const owner = content.locator('[title="Inter owner"]');
    const originalOwner = await owner.elementHandle();
    const originalList = await content.locator('[title="Inter list"]').elementHandle();
    const removedItems = await Promise.all(['Inter middle item', 'Inter last item'].map((title) => content.locator(`[title="${title}"]`).elementHandle()));
    const untouched = await content.locator('[title="Inter untouched"]').elementHandle();
    const branchNames = ['Inter prefix branch', 'Inter first branch', 'Inter middle branch', 'Inter last branch', 'Inter following branch', 'Inter tail branch'];
    const branches = await Promise.all(branchNames.map((title) => content.locator(`[title="${title}"]`).elementHandle()));
    const branchHTML = await Promise.all(branches.map((branch) => branch!.evaluate((node) => node.outerHTML)));
    const edges = await Promise.all(['Inter first quote', 'Inter last quote', 'Inter outer end', 'Inter keep'].map((title) => content.locator(`[title="${title}"]`).elementHandle()));
    const labels = {
      between: t('Выделить цитаты между ветками', 'Select quotes between branches'),
      into: t('Выделить до цитаты после ветки', 'Select into quote after branch'),
      out: t('Выделить из цитаты через ветки', 'Select from quote across branches'),
      whole: t('Выделить все тела между ветками', 'Select all bodies between branches'),
    };
    await panel.getByLabel(t('HTML из нескольких блоков', 'Multi-block HTML'), { exact: true }).fill('<p title="Inter incoming first" style="text-align: right"><strong>First</strong></p><h4 title="Inter incoming last"><em>Last</em></h4>');
    await panel.getByRole('button', { name: labels[direction], exact: true }).click();
    await panel.getByRole('button', { name: t('Заменить несколькими блоками', 'Replace with multiple blocks'), exact: true }).click();
    const keepFirst = direction === 'between' || direction === 'out';
    const keepLast = direction === 'between' || direction === 'into';
    await expect(owner.locator(':scope > p[title="Inter incoming first"]')).toHaveText('First');
    await expect(owner.locator(':scope > p[title="Inter incoming first"]')).toHaveCSS('text-align', 'right');
    await expect(owner.locator(':scope > h4[title="Inter incoming last"]')).toHaveText('Last');
    await expect(content.locator('[title="Inter first cut"], [title="Inter middle quote"], [title="Inter last cut"]')).toHaveCount(0);
    expect(await originalOwner!.evaluate((node) => node.isConnected)).toBe(true);
    expect(await originalList!.evaluate((node) => node.isConnected)).toBe(true);
    expect(await untouched!.evaluate((node) => node.isConnected)).toBe(true);
    for (const item of removedItems) expect(await item!.evaluate((node) => node.isConnected)).toBe(false);
    expect(await edges[0]!.evaluate((node) => node.isConnected)).toBe(keepFirst);
    expect(await edges[1]!.evaluate((node) => node.isConnected)).toBe(keepLast);
    for (const edge of edges.slice(2)) expect(await edge!.evaluate((node) => node.isConnected && node.parentElement?.getAttribute('title') === 'Inter owner')).toBe(true);
    if (keepFirst) {
      await expect(owner.locator('[title="Inter first quote"]')).toHaveCSS('text-align', 'right');
      await expect(owner.locator('[title="Inter first target"]')).toHaveText('Be');
      await expect(owner.locator('[title="Inter quoted prefix"]')).toHaveText('Keep quoted prefix');
    }
    if (keepLast) {
      await expect(owner.locator('[title="Inter last quote"]')).toHaveCSS('text-align', 'center');
      await expect(owner.locator('[title="Inter last target"]')).toHaveText('mma tail');
      await expect(owner.locator('[title="Inter quoted suffix"]')).toHaveText('Keep quoted suffix');
    }
    await expect(owner.locator('[title="Inter outer start"]')).toHaveText(keepFirst ? 'Alpha tail' : 'Al');
    await expect(owner.locator('[title="Inter outer end"]')).toHaveText(keepLast ? 'Delta tail' : 'lta tail');
    expect(await owner.evaluate((root) => [...root.children].map((node) => node.getAttribute('title')))).toEqual([
      'Inter before', 'Inter prefix branch', 'Inter outer start', ...(keepFirst ? ['Inter first quote'] : []),
      'Inter incoming first', 'Inter incoming last', 'Inter first branch', 'Inter middle branch', 'Inter last branch',
      ...(keepLast ? [null, 'Inter last quote'] : []), 'Inter outer end', 'Inter following branch', 'Inter keep', 'Inter tail branch',
    ]);
    for (let index = 0; index < branches.length; index++) {
      expect(await branches[index]!.evaluate((node) => ({ connected: node.isConnected, parent: node.parentElement?.getAttribute('title'), html: node.outerHTML }))).toEqual({ connected: true, parent: 'Inter owner', html: branchHTML[index] });
    }
    await expect(owner.locator(':scope > [title="Inter middle branch"]')).toHaveAttribute('start', '5');
    await expect(owner.locator(':scope > [title="Inter following branch"]')).toHaveAttribute('start', '7');
    await expect(owner.locator(':scope > [title="Inter last branch"] > li')).toHaveJSProperty('innerHTML', '<br>');
    expect(await owner.evaluate((root) => {
      const quoted = root.querySelector('[title="Inter last quote"]');
      const suffix = quoted?.previousElementSibling ?? root.querySelector('[title="Inter outer end"]')!;
      const selection = document.getSelection()!;
      return { caret: selection.anchorNode === suffix && selection.anchorOffset === 0 && selection.isCollapsed, text: suffix.textContent, placeholder: suffix.childNodes.length === 1 && suffix.firstChild?.nodeName === 'BR', afterBranch: suffix.previousElementSibling?.getAttribute('title') === 'Inter last branch' };
    })).toEqual({ caret: true, text: keepLast ? '' : 'lta tail', placeholder: keepLast, afterBranch: true });
    await expect(content.locator(':scope > ul > li')).toHaveCount(2);
    await expect(content.locator(':scope > p')).toHaveText('Keep paragraph');
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
