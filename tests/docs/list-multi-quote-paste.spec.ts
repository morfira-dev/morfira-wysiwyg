import { expect, test } from '@playwright/test';

for (const english of [false, true]) {
  for (const direction of ['between', 'into', 'out', 'whole'] as const) test(`multiple-quote demo ${direction} in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
    const t = (ru: string, en: string) => english ? en : ru;
    await page.goto(english ? '/en/playground' : '/');
    const content = page.locator('.mw-content');
    await expect(content).toBeVisible();
    const panel = page.locator('.lab-list-selection');
    await panel.locator('summary').click();
    const load = t('Загрузить пример нескольких цитат', 'Load multiple-quote sample');
    await panel.getByRole('button', { name: load, exact: true }).click();
    const before = await content.innerHTML();
    const owner = content.locator('[title="Multi quote owner"]');
    const first = owner.locator('[title="Multi first quote"]');
    const last = owner.locator('[title="Multi last quote"]');
    const actual = await Promise.all(['Multi first quote', 'Multi middle quote', 'Multi last quote', 'Multi covered body', 'Multi quoted prefix', 'Multi quoted suffix', 'Multi keep', 'Multi branch'].map((title) => owner.locator(`[title="${title}"]`).elementHandle()));
    const labels = {
      between: t('Выделить между цитатами', 'Select between quotes'),
      into: t('Выделить снаружи до последней цитаты', 'Select outside into last quote'),
      out: t('Выделить из первой цитаты наружу', 'Select first quote into outside'),
      whole: t('Выделить через все цитаты', 'Select across all quotes'),
    };
    await panel.getByLabel(t('HTML из нескольких блоков', 'Multi-block HTML'), { exact: true }).fill('<p title="Multi incoming first" style="text-align: right"><strong>First</strong></p><h4 title="Multi incoming last"><em>Last</em></h4>');
    await panel.getByRole('button', { name: labels[direction], exact: true }).click();
    await panel.getByRole('button', { name: t('Заменить несколькими блоками', 'Replace with multiple blocks'), exact: true }).click();
    await expect(owner.locator(':scope > p[title="Multi incoming first"]')).toHaveText('First');
    await expect(owner.locator(':scope > p[title="Multi incoming first"]')).toHaveCSS('text-align', 'right');
    await expect(owner.locator(':scope > h4[title="Multi incoming last"]')).toHaveText('Last');
    await expect(owner.locator('blockquote [title^="Multi incoming"]')).toHaveCount(0);
    await expect(owner.locator('[title="Multi middle quote"], [title="Multi covered body"]')).toHaveCount(0);
    expect(await actual[1]!.evaluate((node) => node.isConnected)).toBe(false);
    expect(await actual[3]!.evaluate((node) => node.isConnected)).toBe(false);
    const keepFirst = direction === 'between' || direction === 'out';
    const keepLast = direction === 'between' || direction === 'into';
    expect(await actual[0]!.evaluate((node) => node.isConnected)).toBe(keepFirst);
    expect(await actual[2]!.evaluate((node) => node.isConnected)).toBe(keepLast);
    expect(await actual[4]!.evaluate((node) => node.isConnected)).toBe(keepFirst);
    expect(await actual[5]!.evaluate((node) => node.isConnected)).toBe(keepLast);
    for (const node of actual.slice(6)) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
    await expect(first).toHaveCount(keepFirst ? 1 : 0);
    if (keepFirst) {
      await expect(first).toHaveCSS('text-align', 'right');
      await expect(first.locator(':scope > [title="Multi first target"]')).toHaveText('Be');
      await expect(first.locator(':scope > [title="Multi quoted prefix"]')).toHaveText('Keep quoted prefix');
    }
    await expect(last).toHaveCount(keepLast ? 1 : 0);
    if (keepLast) {
      await expect(last).toHaveCSS('text-align', 'center');
      await expect(last.locator(':scope > [title="Multi last target"]')).toHaveText('mma tail');
      await expect(last.locator(':scope > [title="Multi quoted suffix"]')).toHaveText('Keep quoted suffix');
    }
    await expect(owner.locator(':scope > [title="Multi outer start"]')).toHaveText(keepFirst ? 'Alpha tail' : 'Al');
    await expect(owner.locator(':scope > [title="Multi outer end"]')).toHaveText(keepLast ? 'Delta tail' : 'lta tail');
    await expect(owner.locator(':scope > [title="Multi keep"]')).toHaveText('Keep body');
    await expect(owner.locator(':scope > [title="Multi branch"]')).toHaveText('Nested branch');
    await expect(content.locator(':scope > ul > li')).toHaveCount(2);
    await expect(content.locator(':scope > p')).toHaveText('Keep paragraph');
    expect(await owner.evaluate((root) => {
      const body = root.querySelector('[title="Multi incoming last"]')!.nextElementSibling!;
      const selection = document.getSelection()!;
      return { caret: selection.anchorNode === body && selection.anchorOffset === 0 && selection.isCollapsed, text: body.textContent, placeholder: body.childNodes.length === 1 && body.firstChild?.nodeName === 'BR', nextQuote: body.nextElementSibling?.getAttribute('title') === 'Multi last quote' };
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
