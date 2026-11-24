import { expect, test } from '@playwright/test';

for (const english of [false, true]) {
  for (const direction of ['into', 'out', 'whole'] as const) test(`quote-crossing demo ${direction} in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
    const t = (ru: string, en: string) => english ? en : ru;
    await page.goto(english ? '/playground' : '/ru/');
    const content = page.locator('.mw-content');
    await expect(content).toBeVisible();
    const panel = page.locator('.lab-list-selection');
    await panel.locator('summary').click();
    await panel.getByRole('button', { name: t('Загрузить пример пересечения цитаты', 'Load quote-crossing sample'), exact: true }).click();
    const before = await content.innerHTML();
    const quote = content.locator('[title="Cross quote"]');
    const originalQuote = await quote.elementHandle();
    const untouched = await Promise.all([
      content.locator('[title="Cross keep"]').elementHandle(),
      content.locator('[title="Cross branch"]').elementHandle(),
      quote.locator(direction === 'into' ? '[title="Cross quoted after"]' : '[title="Cross quoted before"]').elementHandle(),
    ]);
    const label = direction === 'into'
      ? t('Выделить снаружи внутрь цитаты', 'Select outside into quote')
      : direction === 'out'
        ? t('Выделить из цитаты наружу', 'Select quote into outside')
        : t('Выделить через целую цитату', 'Select across whole quote');
    await panel.getByLabel(t('HTML из нескольких блоков', 'Multi-block HTML'), { exact: true }).fill('<p title="Incoming first" style="text-align: right"><strong>First</strong></p><h3 title="Incoming last"><em>Last</em></h3>');
    await panel.getByRole('button', { name: label, exact: true }).click();
    await panel.getByRole('button', { name: t('Заменить несколькими блоками', 'Replace with multiple blocks'), exact: true }).click();
    const owner = content.locator('[title="Cross quote owner"]');
    await expect(owner.locator(':scope > p[title="Incoming first"]')).toHaveText('First');
    await expect(owner.locator(':scope > p[title="Incoming first"]')).toHaveCSS('text-align', 'right');
    await expect(owner.locator(':scope > h3[title="Incoming last"]')).toHaveText('Last');
    await expect(owner.locator(':scope > h3[title="Cross keep"]')).toHaveText('Keep body');
    await expect(owner.locator(':scope > ol[title="Cross branch"]')).toHaveText('Nested branch');
    await expect(content.locator(':scope > ul > li')).toHaveCount(2);
    await expect(content.locator(':scope > p')).toHaveText('Keep paragraph');
    for (const handle of untouched.slice(0, 2)) expect(await handle!.evaluate((node) => node.isConnected)).toBe(true);
    if (direction === 'whole') {
      await expect(quote).toHaveCount(0);
      expect(await originalQuote!.evaluate((node) => node.isConnected)).toBe(false);
    }
    else {
      expect(await originalQuote!.evaluate((node) => node === document.querySelector('[title="Cross quote"]'))).toBe(true);
      expect(await untouched[2]!.evaluate((node) => node.isConnected)).toBe(true);
      await expect(quote).toHaveCSS('text-align', 'center');
      await expect(quote.locator(':scope > p')).toHaveText(direction === 'into' ? ['ta tail', 'After quote body'] : ['Before quote body', 'Be']);
      await expect(quote.locator('[title^="Incoming"]')).toHaveCount(0);
    }
    if (direction !== 'out') await expect(owner.locator(':scope > [title="Cross outer start"]')).toHaveText('Alpha ');
    expect(await owner.evaluate((root) => {
      const body = root.querySelector('[title="Incoming last"]')!.nextElementSibling!;
      const selection = document.getSelection()!;
      return {
        caretAtStart: selection.anchorNode === body && selection.anchorOffset === 0 && selection.isCollapsed,
        text: body.textContent,
        placeholder: body.localName === 'p' && body.childNodes.length === 1 && body.firstChild?.nodeName === 'BR',
        beforeQuote: body.nextElementSibling?.getAttribute('title') === 'Cross quote',
      };
    })).toEqual(direction === 'into'
      ? { caretAtStart: true, text: '', placeholder: true, beforeQuote: true }
      : { caretAtStart: true, text: 'mma tail', placeholder: false, beforeQuote: false });
    const after = await content.innerHTML();
    const toolbar = page.getByRole('toolbar', { name: t('Форматирование', 'Formatting'), exact: true });
    await toolbar.getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click();
    expect(await content.innerHTML()).toBe(before);
    expect(await content.evaluate(() => {
      const selection = document.getSelection()!;
      return { anchor: selection.anchorNode?.textContent, anchorOffset: selection.anchorOffset, focus: selection.focusNode?.textContent, focusOffset: selection.focusOffset };
    })).toEqual({ anchor: direction === 'into' ? 'Beta' : 'Gamma', anchorOffset: 2, focus: direction === 'out' ? 'Beta' : 'Alpha ', focusOffset: direction === 'out' ? 2 : 6 });
    await toolbar.getByRole('button', { name: t('Повторить', 'Redo'), exact: true }).click();
    expect(await content.innerHTML()).toBe(after);
    await page.getByRole('button', { name: t('Только чтение', 'Read only'), exact: true }).click();
    for (const name of [t('Загрузить пример пересечения цитаты', 'Load quote-crossing sample'), t('Выделить снаружи внутрь цитаты', 'Select outside into quote'), t('Выделить из цитаты наружу', 'Select quote into outside'), t('Выделить через целую цитату', 'Select across whole quote')])
      await expect(panel.getByRole('button', { name, exact: true })).toBeDisabled();
  });
}
