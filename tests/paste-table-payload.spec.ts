import { expect, test } from '@playwright/test';

test('a merged table payload replaces a backward root range and preserves suffix caret JSON and isolated history', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  const original = '<p>Alpha <strong>one</strong></p><h2><em>Beta</em> tail</h2><p>Keep</p>';
  const tableHTML = '<table><tbody><tr><td rowspan="2" colspan="2"><p>Merged</p></td><td><p>A</p></td></tr><tr><td><p>B</p></td></tr></tbody></table>';
  await page.evaluate((html) => {
    window.editor.setHTML(html);
    window.changes.length = 0;
    const root = window.editor.surface;
    root.focus();
    document.getSelection()!.setBaseAndExtent(root.querySelector('h2 em')!.firstChild!, 2, root.querySelector('p')!.firstChild!, 6);
  }, original);
  const prefix = await page.locator('.mw-content > p').first().elementHandle();
  const suffix = await page.locator('.mw-content > h2').elementHandle();
  const keep = await page.locator('.mw-content > p').last().elementHandle();
  await page.evaluate((html) => window.editor.insertHTML(html), tableHTML);
  const replaced = '<p>Alpha </p>' + tableHTML + '<h2><em>ta</em> tail</h2><p>Keep</p>';
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), changes: window.changes.length }))).toEqual({ html: replaced, changes: 1 });
  expect(await prefix!.evaluate((element) => element.isConnected && element === window.editor.surface.firstElementChild)).toBe(true);
  expect(await suffix!.evaluate((element) => element.isConnected && element === window.editor.surface.querySelector(':scope > h2'))).toBe(true);
  expect(await keep!.evaluate((element) => element.isConnected && element === window.editor.surface.lastElementChild)).toBe(true);
  const table = page.locator('.mw-content > table');
  await expect(table).toHaveCount(1);
  await expect(table.locator('tr')).toHaveCount(2);
  await expect(table.locator('td')).toHaveCount(3);
  await expect(table.locator('td').first()).toHaveAttribute('rowspan', '2');
  await expect(table.locator('td').first()).toHaveAttribute('colspan', '2');
  await expect(table.locator('td')).toHaveText(['Merged', 'A', 'B']);
  const insertedJSON = await page.evaluate(() => window.editor.getJSON());
  const roundTrip = await page.evaluate((value) => {
    const host = document.createElement('div');
    document.body.append(host);
    const replica = window.createEditor(host, { plugins: [window.createTables()] });
    try {
      replica.setJSON(value);
      return { json: replica.getJSON(), html: replica.getHTML() };
    }
    finally {
      replica.destroy();
      host.remove();
    }
  }, insertedJSON);
  expect(roundTrip).toEqual({ json: insertedJSON, html: replaced });
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    const range = document.getSelection()!.getRangeAt(0);
    return {
      collapsed: range.collapsed,
      inSuffix: range.startContainer === root.querySelector(':scope > h2'),
      offset: range.startOffset,
      nextIsMarkedSuffix: range.startContainer.childNodes[range.startOffset] === root.querySelector(':scope > h2 em'),
      selection: window.editor.getSelection(),
    };
  })).toEqual({ collapsed: true, inSuffix: true, offset: 0, nextIsMarkedSuffix: true, selection: { index: 14, length: 0 } });
  await page.keyboard.insertText('!');
  await expect(page.locator('.mw-content > h2')).toHaveText('!ta tail');
  await expect(page.locator('.mw-content > h2 em')).toHaveText(/^!?ta$/);
  await expect(table.locator('td')).toHaveText(['Merged', 'A', 'B']);
  expect(await page.evaluate(() => {
    const selection = document.getSelection()!;
    const preceding = document.createRange();
    preceding.selectNodeContents(window.editor.surface.querySelector(':scope > h2')!);
    preceding.setEnd(selection.anchorNode!, selection.anchorOffset);
    return { textBeforeCaret: preceding.toString(), selection: window.editor.getSelection() };
  })).toEqual({ textBeforeCaret: '!', selection: { index: 15, length: 0 } });
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection() }))).toEqual({ html: replaced, selection: { index: 14, length: 0 } });
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo() }))).toEqual({ html: original, undo: false });
  expect(await page.evaluate(() => {
    const selection = document.getSelection()!;
    const root = window.editor.surface;
    return {
      anchorRight: selection.anchorNode === root.querySelector('h2 em')!.firstChild,
      anchorOffset: selection.anchorOffset,
      focusLeft: selection.focusNode === root.querySelector('p')!.firstChild,
      focusOffset: selection.focusOffset,
      selected: selection.getRangeAt(0).toString(),
    };
  })).toEqual({ anchorRight: true, anchorOffset: 2, focusLeft: true, focusOffset: 6, selected: 'oneBe' });
});
