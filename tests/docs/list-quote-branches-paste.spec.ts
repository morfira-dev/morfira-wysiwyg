import { expect, test } from '@playwright/test';

for (const english of [false, true]) {
  for (const direction of ['between', 'into', 'out', 'whole'] as const) test(`quote branch preservation demo ${direction} in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
    const t = (ru: string, en: string) => english ? en : ru;
    await page.goto(english ? '/playground' : '/ru/');
    const content = page.locator('.mw-content');
    await expect(content).toBeVisible();
    const panel = page.locator('.lab-list-selection');
    await panel.locator('summary').click();
    const load = t('Загрузить пример сохранения веток', 'Load quote-branch preservation sample');
    await panel.getByRole('button', { name: load, exact: true }).click();
    const before = await content.innerHTML();
    const owner = content.locator('[title="Branch owner"]');
    const originalOwner = await owner.elementHandle();
    const originalList = await content.locator('[title="Branch list"]').elementHandle();
    const removedItems = await Promise.all(['Branch middle item', 'Branch last item'].map((title) => content.locator(`[title="${title}"]`).elementHandle()));
    const untouchedItem = await content.locator('[title="Branch untouched"]').elementHandle();
    const actualOutsideSuffix = await content.locator('[title="Branch outer end"]').elementHandle();
    const first = owner.locator('[title="Branch first quote"]');
    const last = content.locator('[title="Branch last quote"]');
    const actual = await Promise.all(['Branch first quote', 'Branch middle quote', 'Branch last quote', 'Branch first cut', 'Branch quoted prefix', 'Branch quoted suffix', 'Branch keep', 'Branch branch'].map((title) => content.locator(`[title="${title}"]`).elementHandle()));
    const branchNames = ['Branch first bullets', 'Branch first ordered', 'Branch middle ordered', 'Branch middle bullets', 'Branch branch'];
    const branches = await Promise.all(branchNames.map((title) => content.locator(`[title="${title}"]`).elementHandle()));
    const branchHTML = await Promise.all(branches.map((branch) => branch!.evaluate((node) => node.outerHTML)));
    const deep = await content.locator('[title="Branch deep"]').elementHandle();
    const labels = {
      between: t('Выделить цитаты с ветками', 'Select quotes with branches'),
      into: t('Выделить до цитаты с ветками', 'Select into quote with branches'),
      out: t('Выделить из цитаты с ветками', 'Select from quote with branches'),
      whole: t('Выделить все тела с ветками', 'Select all bodies with branches'),
    };
    await panel.getByLabel(t('HTML из нескольких блоков', 'Multi-block HTML'), { exact: true }).fill('<p title="Branch incoming first" style="text-align: right"><strong>First</strong></p><h4 title="Branch incoming last"><em>Last</em></h4>');
    await panel.getByRole('button', { name: labels[direction], exact: true }).click();
    await panel.getByRole('button', { name: t('Заменить несколькими блоками', 'Replace with multiple blocks'), exact: true }).click();
    await expect(owner.locator(':scope > p[title="Branch incoming first"]')).toHaveText('First');
    await expect(owner.locator(':scope > p[title="Branch incoming first"]')).toHaveCSS('text-align', 'right');
    await expect(owner.locator(':scope > h4[title="Branch incoming last"]')).toHaveText('Last');
    await expect(owner.locator('blockquote [title^="Branch incoming"]')).toHaveCount(0);
    await expect(content.locator('[title="Branch middle quote"], [title="Branch first cut"], [title="Branch last cut"]')).toHaveCount(0);
    expect(await originalOwner!.evaluate((node) => node.isConnected)).toBe(true);
    expect(await originalList!.evaluate((node) => node.isConnected)).toBe(true);
    expect(await untouchedItem!.evaluate((node) => node.isConnected)).toBe(true);
    expect(await actualOutsideSuffix!.evaluate((node) => ({ connected: node.isConnected, owner: node.parentElement?.getAttribute('title') }))).toEqual({ connected: true, owner: 'Branch owner' });
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
    expect(await actual[6]!.evaluate((node) => node.parentElement?.getAttribute('title'))).toBe('Branch owner');
    expect(await actual[7]!.evaluate((node) => node.parentElement?.getAttribute('title'))).toBe('Branch owner');
    if (keepLast) expect(await actual[2]!.evaluate((node) => node.parentElement?.getAttribute('title'))).toBe('Branch owner');
    await expect(first).toHaveCount(keepFirst ? 1 : 0);
    if (keepFirst) {
      await expect(first).toHaveCSS('text-align', 'right');
      await expect(first.locator(':scope > [title="Branch first target"]')).toHaveText('Be');
      await expect(first.locator(':scope > [title="Branch quoted prefix"]')).toHaveText('Keep quoted prefix');
    }
    await expect(last).toHaveCount(keepLast ? 1 : 0);
    if (keepLast) {
      await expect(last).toHaveCSS('text-align', 'center');
      await expect(last.locator(':scope > [title="Branch last target"]')).toHaveText('mma tail');
      await expect(last.locator(':scope > [title="Branch quoted suffix"]')).toHaveText('Keep quoted suffix');
    }
    await expect(owner.locator(':scope > [title="Branch outer start"]')).toHaveText(keepFirst ? 'Alpha tail' : 'Al');
    await expect(owner.locator(':scope > [title="Branch outer end"]')).toHaveText(keepLast ? 'Delta tail' : 'lta tail');
    await expect(owner.locator(':scope > [title="Branch keep"]')).toHaveText('Keep body');
    await expect(owner.locator(':scope > [title="Branch branch"]')).toHaveText('Last branch');
    await expect(content.locator(':scope > ul > li')).toHaveCount(2);
    await expect(owner.locator(':scope > [title="Branch before"]')).toHaveText('Before');
    expect(await owner.evaluate((node) => node.lastElementChild?.getAttribute('title'))).toBe('Branch branch');
    await expect(content.locator(':scope > p')).toHaveText('Keep paragraph');
    expect(await owner.evaluate((root) => {
      const body = root.querySelector('[title="Branch incoming last"]')!.nextElementSibling!;
      const selection = document.getSelection()!;
      return { caret: selection.anchorNode === body && selection.anchorOffset === 0 && selection.isCollapsed, text: body.textContent, placeholder: body.childNodes.length === 1 && body.firstChild?.nodeName === 'BR', nextQuote: body.nextElementSibling?.getAttribute('title') === 'Branch last quote' };
    })).toEqual({ caret: true, text: keepLast ? '' : 'lta tail', placeholder: keepLast, nextQuote: keepLast });
    expect(await owner.evaluate((root) => [...root.children].filter((child) => child.matches('ul,ol')).map((child) => child.getAttribute('title')))).toEqual(branchNames);
    expect(await owner.evaluate((root) => {
      const children = [...root.children];
      const firstBranch = children.findIndex((child) => child.matches('ul,ol'));
      return children.slice(firstBranch).every((child) => child.matches('ul,ol'));
    })).toBe(true);
    for (let index = 0; index < branches.length; index++) {
      expect(await branches[index]!.evaluate((node) => ({ connected: node.isConnected, parent: node.parentElement?.getAttribute('title'), html: node.outerHTML }))).toEqual({ connected: true, parent: 'Branch owner', html: branchHTML[index] });
    }
    expect(await deep!.evaluate((node) => ({ connected: node.isConnected, root: node.parentElement?.parentElement?.getAttribute('title') }))).toEqual({ connected: true, root: 'Branch first bullets' });
    await expect(owner.locator(':scope > [title="Branch first ordered"]')).toHaveAttribute('start', '5');
    await expect(owner.locator(':scope > [title="Branch middle ordered"]')).toHaveAttribute('start', '3');
    await expect(owner.locator(':scope > [title="Branch branch"] > li').last()).toHaveJSProperty('innerHTML', '<br>');
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
