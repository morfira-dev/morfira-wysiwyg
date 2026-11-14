import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { SchemaNodeSpec } from '@morfira-dev/wysiwyg';

const initialize = async (page: Page, value: string, schema: SchemaNodeSpec[] = []) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  return page.evaluate(({ value, schema }) => {
    window.dispose();
    const host = document.createElement('div');
    document.body.append(host);
    window.changes = [];
    window.editor = window.createEditor(host, { value, schema, onChange: (change) => window.changes.push(change) });
    window.dispose = () => window.editor.destroy();
    return window.editor.getHTML();
  }, { value, schema });
};
const html = (page: Page) => page.evaluate(() => window.editor.getHTML());
const select = (page: Page, start: string, end: string, backward = false, startOffset = 1, endOffset = 1) => page.evaluate(({ start, end, backward, startOffset, endOffset }) => {
  const root = window.editor.surface;
  const first = root.querySelector(start)!.firstChild!;
  const last = root.querySelector(end)!.firstChild!;
  root.focus();
  document.getSelection()!.setBaseAndExtent(backward ? last : first, backward ? endOffset : startOffset, backward ? first : last, backward ? startOffset : endOffset);
}, { start, end, backward, startOffset, endOffset });
const paste = (page: Page, value: string) => page.evaluate((value) => {
  const data = new DataTransfer();
  data.setData('text/html', value);
  data.setData('text/plain', 'Wrong fallback');
  const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: data });
  window.editor.surface.dispatchEvent(event);
  return event.defaultPrevented;
}, value);
const open = '<ul><li title="Owner"><p title="Keep before">Before</p>';
const outsideStart = '<h2 title="Start" style="text-align: center">AB</h2>';
const left = '<blockquote title="Left" style="text-align: right"><p title="Left keep">Keep left</p><h3 title="Left body">CD</h3><p title="Left cut">Cut left</p></blockquote>';
const middle = '<p title="Covered body">Covered</p><blockquote title="Middle"><p>Middle</p></blockquote><h4 title="Covered last">Cut</h4>';
const right = '<blockquote title="Right" style="text-align: center"><p title="Right cut">Cut right</p><h2 title="Right body">EF</h2><p title="Right keep">Keep right</p></blockquote>';
const outsideEnd = '<h3 title="End">GH</h3>';
const close = '<p title="Keep after">After</p><ol title="Branch"><li>Nested</li></ol></li><li>Sibling</li></ul>';
const source = open + outsideStart + left + middle + right + outsideEnd + close;
const leftPrefix = outsideStart + '<blockquote title="Left" style="text-align: right"><p title="Left keep">Keep left</p><h3 title="Left body">C</h3></blockquote>';
const rightSuffix = '<p><br></p><blockquote title="Right" style="text-align: center"><h2 title="Right body">F</h2><p title="Right keep">Keep right</p></blockquote>' + outsideEnd;
const payloads = [
  { name: 'multiple bodies', input: '\n<p title="First" style="text-align: right"><u>X</u></p>\n<h4 title="Incoming">Y</h4>\n', result: '<p title="First" style="text-align: right"><u>X</u></p><h4 title="Incoming">Y</h4>' },
  { name: 'heading', input: '<h4 title="Incoming"><em>H</em></h4>', result: '<h4 title="Incoming"><em>H</em></h4>' },
  { name: 'quote', input: '<blockquote title="Incoming"><p title="Payload body">Q</p></blockquote>', result: '<blockquote title="Incoming"><p title="Payload body">Q</p></blockquote>' },
];
const directions = [
  { name: 'between different quotes', first: '[title="Left body"]', last: '[title="Right body"]', prefix: leftPrefix, suffix: rightSuffix, left: true, right: true },
  { name: 'outside to quote past whole quotes', first: '[title="Start"]', last: '[title="Right body"]', prefix: '<h2 title="Start" style="text-align: center">A</h2>', suffix: rightSuffix, left: false, right: true },
  { name: 'quote to outside past whole quotes', first: '[title="Left body"]', last: '[title="End"]', prefix: leftPrefix, suffix: '<h3 title="End">H</h3>', left: true, right: false },
  { name: 'outside across all quotes', first: '[title="Start"]', last: '[title="End"]', prefix: '<h2 title="Start" style="text-align: center">A</h2>', suffix: '<h3 title="End">H</h3>', left: false, right: false },
];

for (const direction of directions) for (const payload of payloads) for (const clipboard of [false, true]) test(`${clipboard ? 'clipboard forward' : 'API backward'} ${payload.name} replacement ${direction.name} preserves wrappers, order and exact history`, async ({ page }) => {
  const before = await initialize(page, source);
  const kept = await Promise.all(['Owner', 'Keep before', 'Keep after', 'Branch', ...(direction.left ? ['Left', 'Left keep', 'Left body'] : []), ...(direction.right ? ['Right', 'Right body', 'Right keep'] : [])].map((title) => page.locator(`.mw-content [title="${title}"]`).elementHandle()));
  const removed = await Promise.all(['Middle', 'Covered body', 'Covered last', 'Left cut', 'Right cut', ...(!direction.left ? ['Left'] : []), ...(!direction.right ? ['Right'] : [])].map((title) => page.locator(`.mw-content [title="${title}"]`).elementHandle()));
  await select(page, direction.first, direction.last, !clipboard);
  if (clipboard) expect(await paste(page, payload.input)).toBe(true);
  else await page.evaluate((value) => window.editor.insertHTML(value), payload.input);
  const expected = open + direction.prefix + payload.result + direction.suffix + close;
  expect(await html(page)).toBe(expected);
  for (const node of kept) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
  for (const node of removed) expect(await node!.evaluate((node) => node.isConnected)).toBe(false);
  expect(await page.evaluate(() => {
    const incoming = window.editor.surface.querySelector('[title="Incoming"]')!;
    const selection = document.getSelection()!;
    return { parent: incoming.parentElement?.getAttribute('title'), nested: window.editor.surface.querySelectorAll('blockquote blockquote').length, caret: selection.anchorNode === incoming.nextElementSibling, offset: selection.anchorOffset, collapsed: selection.isCollapsed, changes: window.changes.length };
  })).toEqual({ parent: 'Owner', nested: 0, caret: true, offset: 0, collapsed: true, changes: 1 });
  await page.keyboard.type('X');
  await expect(page.locator('.mw-content [title="Incoming"] + *')).toHaveText(direction.right ? 'X' : 'XH');
  await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(({ first, last, backward }) => {
    const selection = document.getSelection()!;
    const root = window.editor.surface;
    return { anchor: selection.anchorNode === root.querySelector(backward ? last : first)!.firstChild, focus: selection.focusNode === root.querySelector(backward ? first : last)!.firstChild, anchorOffset: selection.anchorOffset, focusOffset: selection.focusOffset, undo: window.editor.canUndo() };
  }, { first: direction.first, last: direction.last, backward: !clipboard })).toEqual({ anchor: true, focus: true, anchorOffset: 1, focusOffset: 1, undo: false });
  await page.evaluate(() => window.editor.redo());
  expect(await html(page)).toBe(expected);
  expect(await page.evaluate(() => ({ caret: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Incoming"]')!.nextElementSibling, offset: document.getSelection()!.anchorOffset }))).toEqual({ caret: true, offset: 0 });
});

test('different quote-level offsets preserve both empty endpoint bodies and untouched raw formatting gaps', async ({ page }) => {
  const before = await initialize(page, '<ul><li><blockquote title="Left">\n<p title="Left keep">Keep</p>\n<h2 title="Left body">AB</h2>\n</blockquote><blockquote title="Middle">Covered</blockquote><blockquote title="Right">\n<p title="Right body">CD</p>\n<h3 title="Right keep">Keep</h3>\n</blockquote><ol title="Branch"><li>Branch</li></ol></li></ul>');
  const nodes = await Promise.all(['Left', 'Left body', 'Left keep', 'Right', 'Right body', 'Right keep', 'Branch'].map((title) => page.locator(`.mw-content [title="${title}"]`).elementHandle()));
  const gaps = await page.evaluateHandle(() => [window.editor.surface.querySelector('[title="Left"]')!.firstChild!, window.editor.surface.querySelector('[title="Right"]')!.lastChild!]);
  await page.evaluate(() => {
    const root = window.editor.surface;
    root.focus();
    document.getSelection()!.setBaseAndExtent(root.querySelector('[title="Right"]')!, 3, root.querySelector('[title="Left"]')!, 2);
    window.editor.insertHTML('<h4 title="Incoming">H</h4>');
  });
  for (const node of nodes) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
  expect(await gaps.evaluate((nodes) => nodes.every((node) => node.isConnected))).toBe(true);
  await expect(page.locator('.mw-content [title="Left"]')).toHaveJSProperty('innerHTML', '\n<p title="Left keep">Keep</p>\n<h2 title="Left body"><br></h2>');
  await expect(page.locator('.mw-content [title="Right"]')).toHaveJSProperty('innerHTML', '<p title="Right body"><br></p>\n<h3 title="Right keep">Keep</h3>\n');
  await expect(page.locator('.mw-content [title="Middle"]')).toHaveCount(0);
  await expect(page.locator('.mw-content [title="Incoming"] + p')).toHaveJSProperty('innerHTML', '<br>');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ anchor: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Right"]'), anchorOffset: document.getSelection()!.anchorOffset, focus: document.getSelection()!.focusNode === window.editor.surface.querySelector('[title="Left"]'), focusOffset: document.getSelection()!.focusOffset }))).toEqual({ anchor: true, anchorOffset: 3, focus: true, focusOffset: 2 });
});

test('two empty inline quote edges retain both actual wrappers with placeholders around a sibling quote payload', async ({ page }) => {
  const before = await initialize(page, '<ul><li><blockquote title="Left">AB</blockquote><p>Covered</p><blockquote title="Middle">Middle</blockquote><blockquote title="Right">CD</blockquote></li></ul>');
  const quotes = await Promise.all(['Left', 'Right'].map((title) => page.locator(`.mw-content [title="${title}"]`).elementHandle()));
  await select(page, '[title="Left"]', '[title="Right"]', false, 0, 2);
  await paste(page, '<blockquote title="Incoming"><br></blockquote>');
  expect(await html(page)).toBe('<ul><li><blockquote title="Left"><br></blockquote><blockquote title="Incoming"><br></blockquote><p><br></p><blockquote title="Right"><br></blockquote></li></ul>');
  for (const node of quotes) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

const semanticQuote: SchemaNodeSpec = { name: 'test:quote', kind: 'block', tag: 'blockquote', attributes: { 'data-id': { type: 'text', required: true } } };
const semanticBody: SchemaNodeSpec = { name: 'test:body', kind: 'block', tag: 'p', attributes: { 'data-id': { type: 'text', required: true } } };
for (const invalid of ['<blockquote title="Middle"><p>Image<img src="/logo.svg" alt="Source"></p></blockquote>', '<blockquote title="Middle" data-mw-node="test:quote" data-id="owned">Semantic</blockquote>', '<blockquote title="Middle"><p data-mw-node="test:body" data-id="owned">Semantic</p></blockquote>', '<blockquote title="Middle"><blockquote>Nested</blockquote></blockquote>']) test(`a fully covered unsupported middle quote rejects before any live mutation: ${invalid}`, async ({ page }) => {
  const before = await initialize(page, open + outsideStart + left + invalid + right + outsideEnd + close, [semanticQuote, semanticBody]);
  await select(page, '[title="Left body"]', '[title="Right body"]', true);
  const result = await page.evaluate(() => {
    const editor = window.editor;
    const selection = document.getSelection()!;
    const anchor = selection.anchorNode;
    const focus = selection.focusNode;
    const observer = new MutationObserver(() => {});
    observer.observe(editor.surface, { subtree: true, childList: true, attributes: true });
    let rejected = false;
    try { editor.insertHTML('<p>X</p><h4>Y</h4>'); } catch { rejected = true; }
    const mutations = observer.takeRecords().length;
    observer.disconnect();
    return { rejected, mutations, anchor: selection.anchorNode === anchor, focus: selection.focusNode === focus, anchorOffset: selection.anchorOffset, focusOffset: selection.focusOffset, changes: window.changes.length, undo: editor.canUndo() };
  });
  expect(result).toEqual({ rejected: true, mutations: 0, anchor: true, focus: true, anchorOffset: 1, focusOffset: 1, changes: 0, undo: false });
  await paste(page, '<blockquote>Payload</blockquote>');
  expect(await html(page)).toBe(before);
});

for (const guard of ['readonly', 'composition', 'canceled']) test(`${guard} preserves a multi-quote selection and document`, async ({ page }) => {
  const before = await initialize(page, source);
  await select(page, '[title="Left body"]', '[title="Right body"]', true);
  await page.evaluate((guard) => {
    const editor = window.editor;
    if (guard === 'readonly') editor.setReadOnly(true);
    if (guard === 'composition') editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const data = new DataTransfer();
    data.setData('text/html', '<p>X</p><h4>Y</h4>');
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: data });
    if (guard === 'canceled') event.preventDefault();
    editor.surface.dispatchEvent(event);
  }, guard);
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ changes: 0, undo: false });
});

test('multi-quote replacement preserves a merged cell, surrounding cells, outer list and trailing nested branch', async ({ page }) => {
  const before = await initialize(page, '<table><tbody><tr><td rowspan="2" colspan="2"><ol><li title="Outer">Outer' + source + '</li></ol></td><td>A</td></tr><tr><td>B</td></tr></tbody></table>');
  const nodes = await Promise.all(['.mw-content td', '.mw-content [title="Outer"]', '.mw-content [title="Branch"]', '.mw-content [title="Left"]', '.mw-content [title="Right"]'].map((selector) => page.locator(selector).first().elementHandle()));
  await select(page, '[title="Left body"]', '[title="Right body"]');
  await paste(page, '<h4 title="Incoming">H</h4>');
  for (const node of nodes) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
  await expect(page.locator('.mw-content td').first()).toHaveAttribute('rowspan', '2');
  await expect(page.locator('.mw-content td').first()).toHaveAttribute('colspan', '2');
  await expect(page.locator('.mw-content td').nth(1)).toHaveText('A');
  await expect(page.locator('.mw-content td').nth(2)).toHaveText('B');
  await expect(page.locator('.mw-content [title="Middle"]')).toHaveCount(0);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

test('a caught failed import across several quotes rolls back its outer transaction and restores exact selection', async ({ page }) => {
  const before = await initialize(page, source);
  await select(page, '[title="Left body"]', '[title="Right body"]', true);
  expect(await page.evaluate(() => {
    try {
      window.editor.transact((root) => {
        root.querySelector('[title="Keep after"]')!.append(document.createTextNode('!'));
        try { window.editor.insertHTML('<p>X</p><blockquote>Mixed</blockquote>'); } catch { /* The outer transaction must still roll back. */ }
      });
      return false;
    } catch { return true; }
  })).toBe(true);
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ anchor: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Right body"]')!.firstChild, anchorOffset: document.getSelection()!.anchorOffset, focusOffset: document.getSelection()!.focusOffset, changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ anchor: true, anchorOffset: 1, focusOffset: 1, changes: 0, undo: false });
});


test('unselected neighboring image quotes remain opaque actual nodes around a multi-quote replacement', async ({ page }) => {
  const beforeQuote = '<blockquote title="Opaque before"><p>Before<img src="/logo.svg" alt="Before"></p></blockquote>';
  const afterQuote = '<blockquote title="Opaque after"><p>After<img src="/logo.svg" alt="After"></p></blockquote>';
  const before = await initialize(page, open + beforeQuote + outsideStart + left + middle + right + outsideEnd + afterQuote + close);
  const quotes = await Promise.all(['Opaque before', 'Opaque after'].map((title) => page.locator(`.mw-content [title="${title}"]`).elementHandle()));
  await select(page, '[title="Left body"]', '[title="Right body"]', true);
  await page.evaluate(() => window.editor.insertHTML('<h4 title="Incoming">H</h4>'));
  for (const quote of quotes) expect(await quote!.evaluate((node) => node.isConnected)).toBe(true);
  await expect(page.locator('.mw-content [title="Opaque before"]')).toHaveJSProperty('outerHTML', beforeQuote);
  await expect(page.locator('.mw-content [title="Opaque after"]')).toHaveJSProperty('outerHTML', afterQuote);
  await expect(page.locator('.mw-content [title="Middle"]')).toHaveCount(0);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

test('multi-quote replacement clears stale caret formatting without reviving it after Undo restores a range', async ({ page }) => {
  const before = await initialize(page, source);
  expect(await page.evaluate(() => {
    const editor = window.editor;
    const root = editor.surface;
    const first = root.querySelector('[title="Left body"]')!.firstChild!;
    const last = root.querySelector('[title="Right body"]')!.firstChild!;
    const selection = document.getSelection()!;
    root.focus();
    selection.setBaseAndExtent(first, 1, first, 1);
    editor.format('bold', true);
    selection.setBaseAndExtent(last, 1, first, 1);
    editor.insertHTML('<h4 title="Incoming">H</h4>');
    const cleared = !editor.getFormats().bold;
    editor.undo();
    const exact = selection.anchorNode === root.querySelector('[title="Right body"]')!.firstChild && selection.anchorOffset === 1 && selection.focusNode === root.querySelector('[title="Left body"]')!.firstChild && selection.focusOffset === 1;
    const original = root.querySelector('[title="Left body"]')!.firstChild!;
    // Undo restored a range, not the old caret: moving back must not revive stale affinity.
    selection.setBaseAndExtent(original, 1, original, 1);
    return { cleared, exact, restored: Boolean(editor.getFormats().bold), undo: editor.canUndo() };
  })).toEqual({ cleared: true, exact: true, restored: false, undo: false });
  expect(await html(page)).toBe(before);
});
