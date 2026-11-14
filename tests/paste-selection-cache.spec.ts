import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const rootLeaves = '<p>Alpha <strong>one</strong></p><h2><em>Beta</em> tail</h2>';
const grid = '<table><tbody><tr><td rowspan="2" colspan="2"><p>Cell <strong>one</strong></p><h3><em>Body</em> tail</h3></td><td><p>A</p></td></tr><tr><td><p>B</p></td></tr></tbody></table>';
const original = rootLeaves + grid + '<p>Keep</p>';
const incomingTable = '<table><tbody><tr><td><p>Incoming</p></td></tr></tbody></table>';

const initialize = async (page: Page) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate((html) => {
    window.dispose();
    const host = document.createElement('div');
    document.body.append(host);
    window.changes = [];
    window.editor = window.createEditor(host, { value: html, onChange: (change) => window.changes.push(change) });
    window.dispose = () => window.editor.destroy();
    const outside = document.createElement('aside');
    outside.id = 'paste-outside';
    outside.innerHTML = '<button id="paste-outside-control" type="button">Outside control</button><p>Outside keep</p>';
    document.body.append(outside);
  }, original);
};

const rememberThenFocusOutside = async (page: Page, location: 'root' | 'cell') => {
  await page.evaluate((location) => {
    const root = window.editor.surface;
    root.focus();
    const first = root.querySelector(location === 'cell' ? 'td[rowspan] p' : ':scope > p')!.firstChild!;
    const last = root.querySelector(location === 'cell' ? 'td[rowspan] h3 em' : ':scope > h2 em')!.firstChild!;
    const selection = document.getSelection()!;
    selection.setBaseAndExtent(last, 2, first, location === 'cell' ? 2 : 6);
    // Flush the document's selection notification before deliberately removing
    // its active Range; subsequent preflight must use the cached editor bookmark.
    document.dispatchEvent(new Event('selectionchange'));
    (document.getElementById('paste-outside-control') as HTMLButtonElement).focus();
    selection.removeAllRanges();
    document.dispatchEvent(new Event('selectionchange'));
  }, location);
  await expect(page.getByRole('button', { name: 'Outside control', exact: true })).toBeFocused();
  expect(await page.evaluate(() => ({ rangeCount: document.getSelection()!.rangeCount, editorSelection: window.editor.getSelection() }))).toEqual({ rangeCount: 0, editorSelection: undefined });
};

test('cached merged-cell selection rejects a nested table before focus selection DOM or history can change', async ({ page }) => {
  await initialize(page);
  await rememberThenFocusOutside(page, 'cell');
  const result = await page.evaluate((html) => {
    const editor = window.editor;
    const cell = editor.surface.querySelector('td[rowspan]');
    const neighbor = editor.surface.querySelectorAll('td')[1];
    const keep = editor.surface.lastElementChild;
    const outside = document.getElementById('paste-outside')!;
    const beforeOutside = outside.innerHTML;
    const observer = new MutationObserver(() => {});
    observer.observe(editor.surface, { childList: true, subtree: true, attributes: true });
    let rejected = false;
    try { editor.insertHTML(html); }
    catch (error) { rejected = error instanceof TypeError; }
    const mutations = observer.takeRecords().length;
    observer.disconnect();
    return {
      rejected, mutations, html: editor.getHTML(), changes: window.changes.length,
      undo: editor.canUndo(), redo: editor.canRedo(),
      focused: document.activeElement?.id, rangeCount: document.getSelection()!.rangeCount,
      sameCell: cell === editor.surface.querySelector('td[rowspan]'),
      sameNeighbor: neighbor === editor.surface.querySelectorAll('td')[1],
      sameKeep: keep === editor.surface.lastElementChild,
      sameOutside: outside.innerHTML === beforeOutside,
    };
  }, incomingTable);
  expect(result).toEqual({ rejected: true, mutations: 0, html: original, changes: 0, undo: false, redo: false, focused: 'paste-outside-control', rangeCount: 0, sameCell: true, sameNeighbor: true, sameKeep: true, sameOutside: true });
  await expect(page.locator('.mw-content table table')).toHaveCount(0);
});

test('valid HTML restores a cached backward root range before its undo baseline without mutating another document region', async ({ page }) => {
  await initialize(page);
  await rememberThenFocusOutside(page, 'root');
  const keep = await page.locator('.mw-content > p').last().elementHandle();
  const table = await page.locator('.mw-content > table').elementHandle();
  const outside = await page.locator('#paste-outside').elementHandle();
  const outsideHTML = await page.locator('#paste-outside').innerHTML();
  await page.evaluate(() => window.editor.insertHTML('<u>X</u>'));
  const replaced = '<p>Alpha <u>X</u><em>ta</em> tail</p>' + grid + '<p>Keep</p>';
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection(), changes: window.changes.length }))).toEqual({ html: replaced, selection: { index: 7, length: 0 }, changes: 1 });
  expect(await keep!.evaluate((element) => element.isConnected && element === window.editor.surface.lastElementChild)).toBe(true);
  expect(await table!.evaluate((element) => element.isConnected && element === window.editor.surface.querySelector(':scope > table'))).toBe(true);
  expect(await outside!.evaluate((element) => element.isConnected && element === document.getElementById('paste-outside'))).toBe(true);
  expect(await page.locator('#paste-outside').innerHTML()).toBe(outsideHTML);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(original);
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    const selection = document.getSelection()!;
    return {
      anchorRight: selection.anchorNode === root.querySelector(':scope > h2 em')!.firstChild,
      anchorOffset: selection.anchorOffset,
      focusLeft: selection.focusNode === root.querySelector(':scope > p')!.firstChild,
      focusOffset: selection.focusOffset,
      selected: selection.getRangeAt(0).toString(), undo: window.editor.canUndo(),
    };
  })).toEqual({ anchorRight: true, anchorOffset: 2, focusLeft: true, focusOffset: 6, selected: 'oneBe', undo: false });
  await page.evaluate(() => window.editor.redo());
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection() }))).toEqual({ html: replaced, selection: { index: 7, length: 0 } });
  expect(await page.locator('#paste-outside').innerHTML()).toBe(outsideHTML);
});

test('a trusted focus listener moving the range into a cell triggers fresh context validation before any selection cut', async ({ page }) => {
  await initialize(page);
  await rememberThenFocusOutside(page, 'root');
  const result = await page.evaluate((html) => {
    const editor = window.editor;
    let switches = 0;
    editor.surface.addEventListener('focus', () => {
      switches += 1;
      const first = editor.surface.querySelector('td[rowspan] p')!.firstChild!;
      const last = editor.surface.querySelector('td[rowspan] h3 em')!.firstChild!;
      document.getSelection()!.setBaseAndExtent(last, 2, first, 2);
    }, { once: true });
    let rejected = false;
    try { editor.insertHTML(html); }
    catch (error) { rejected = error instanceof TypeError; }
    const selection = document.getSelection()!;
    return {
      switches, rejected, html: editor.getHTML(), changes: window.changes.length,
      undo: editor.canUndo(), redo: editor.canRedo(),
      tables: editor.surface.querySelectorAll('table').length,
      nested: editor.surface.querySelectorAll('table table').length,
      anchor: selection.anchorNode?.textContent, anchorOffset: selection.anchorOffset,
      focus: selection.focusNode?.textContent, focusOffset: selection.focusOffset,
    };
  }, incomingTable);
  expect(result).toEqual({ switches: 1, rejected: true, html: original, changes: 0, undo: false, redo: false, tables: 1, nested: 0, anchor: 'Body', anchorOffset: 2, focus: 'Cell ', focusOffset: 2 });
  await expect(page.locator('.mw-content td[rowspan]')).toHaveAttribute('rowspan', '2');
  await expect(page.locator('.mw-content td[colspan]')).toHaveAttribute('colspan', '2');
  await expect(page.locator('.mw-content td').nth(1)).toHaveText('A');
  await expect(page.locator('.mw-content td').nth(2)).toHaveText('B');
});
