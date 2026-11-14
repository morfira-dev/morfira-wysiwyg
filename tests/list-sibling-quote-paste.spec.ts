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
const open = '<ul title="List"><li title="Before item">Before item</li><li title="Owner"><p title="Keep before">Before</p>';
const outsideStart = '<h2 title="Start" style="text-align: center">AB</h2>';
const left = '<blockquote title="Left" style="text-align: right"><p title="Left keep">Keep left</p><h3 title="Left body">CD</h3><p title="Left cut">Cut left</p></blockquote>';
const middle = '<p title="Owner cut">Owner cut</p></li>\n<li title="Middle item"><p title="Covered body">Covered</p><blockquote title="Middle"><p>Middle</p></blockquote></li>\n<li title="Last item"><p title="Right cut">Cut right</p>';
const right = '<blockquote title="Right" style="text-align: center"><p title="Right prefix">Cut right</p><h2 title="Right body">EF</h2><p title="Right keep">Keep right</p></blockquote>';
const outsideEnd = '<h3 title="End">GH</h3>';
const following = '<p title="Keep after">After</p><blockquote title="Opaque after"><p>Opaque<img src="/logo.svg" alt="Keep"></p></blockquote><ol title="Branch"><li>Nested</li></ol>';
const close = '</li>\n<li title="After item">After item</li></ul>';
const source = open + outsideStart + left + middle + right + outsideEnd + following + close;
const leftPrefix = outsideStart + '<blockquote title="Left" style="text-align: right"><p title="Left keep">Keep left</p><h3 title="Left body">C</h3></blockquote>';
const rightSuffix = '<p><br></p><blockquote title="Right" style="text-align: center"><h2 title="Right body">F</h2><p title="Right keep">Keep right</p></blockquote>' + outsideEnd;
const payloads = [
  { name: 'multiple bodies', input: '\n<p title="First" style="text-align: right"><u>X</u></p>\n<h4 title="Incoming">Y</h4>\n', result: '<p title="First" style="text-align: right"><u>X</u></p><h4 title="Incoming">Y</h4>' },
  { name: 'heading', input: '<h4 title="Incoming"><em>H</em></h4>', result: '<h4 title="Incoming"><em>H</em></h4>' },
  { name: 'quote', input: '<blockquote title="Incoming"><p title="Payload body">Q</p></blockquote>', result: '<blockquote title="Incoming"><p title="Payload body">Q</p></blockquote>' },
];
const directions = [
  { name: 'quote to quote', first: '[title="Left body"]', last: '[title="Right body"]', prefix: leftPrefix, suffix: rightSuffix, left: true, right: true },
  { name: 'outside to quote', first: '[title="Start"]', last: '[title="Right body"]', prefix: '<h2 title="Start" style="text-align: center">A</h2>', suffix: rightSuffix, left: false, right: true },
  { name: 'quote to outside', first: '[title="Left body"]', last: '[title="End"]', prefix: leftPrefix, suffix: '<h3 title="End">H</h3>', left: true, right: false },
  { name: 'outside to outside', first: '[title="Start"]', last: '[title="End"]', prefix: '<h2 title="Start" style="text-align: center">A</h2>', suffix: '<h3 title="End">H</h3>', left: false, right: false },
];

for (const direction of directions) for (const payload of payloads) for (const clipboard of [false, true]) test(`${clipboard ? 'clipboard forward' : 'API backward'} ${payload.name} across sibling items ${direction.name} keeps actual edges and exact history`, async ({ page }) => {
  const before = await initialize(page, source);
  const kept = await Promise.all(['List', 'Owner', 'Before item', 'After item', 'Keep before', 'Keep after', 'Opaque after', 'Branch', ...(direction.left ? ['Left', 'Left keep', 'Left body'] : []), ...(direction.right ? ['Right', 'Right body', 'Right keep'] : [])].map((title) => page.locator(`.mw-content [title="${title}"]`).elementHandle()));
  const removed = await Promise.all(['Middle item', 'Last item', 'Middle', 'Covered body', 'Owner cut', 'Left cut', 'Right cut', 'Right prefix', ...(!direction.left ? ['Left'] : []), ...(!direction.right ? ['Right'] : [])].map((title) => page.locator(`.mw-content [title="${title}"]`).elementHandle()));
  const gaps = await page.evaluateHandle(() => [...window.editor.surface.querySelector('[title="List"]')!.childNodes].filter((node) => node.nodeType === 3));
  await select(page, direction.first, direction.last, !clipboard);
  if (clipboard) expect(await paste(page, payload.input)).toBe(true);
  else await page.evaluate((value) => window.editor.insertHTML(value), payload.input);
  const expected = open + direction.prefix + payload.result + direction.suffix + following + close;
  expect(await html(page)).toBe(expected);
  for (const node of kept) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
  for (const node of removed) expect(await node!.evaluate((node) => node.isConnected)).toBe(false);
  expect(await gaps.evaluate((nodes) => nodes.map((node) => node.isConnected))).toEqual([false, false, true]);
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    const incoming = root.querySelector('[title="Incoming"]')!;
    const owner = root.querySelector('[title="Owner"]')!;
    const selection = document.getSelection()!;
    return { parent: incoming.parentElement === owner, lastBranch: owner.lastElementChild?.getAttribute('title'), caret: selection.anchorNode === incoming.nextElementSibling, offset: selection.anchorOffset, collapsed: selection.isCollapsed, changes: window.changes.length, nestedQuote: root.querySelectorAll('blockquote blockquote').length };
  })).toEqual({ parent: true, lastBranch: 'Branch', caret: true, offset: 0, collapsed: true, changes: 1, nestedQuote: 0 });
  await page.keyboard.insertText('X');
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
});

for (const directStart of [false, true]) test(`direct-inline ${directStart ? 'start' : 'end'} item promotes its actual descendants while keeping the final branch`, async ({ page }) => {
  const before = await initialize(page, directStart
    ? '<ol start="4"><li title="Owner"><strong title="Direct">AB</strong></li><li><blockquote title="Right"><p title="Body">CD</p></blockquote><p title="After">After</p><ul title="Branch"><li>Branch</li></ul></li></ol>'
    : '<ol start="4"><li title="Owner"><blockquote title="Left"><p title="Body">AB</p></blockquote></li><li title="Last"><em title="Direct">CD</em><ul title="Branch"><li><br></li></ul></li></ol>');
  const actual = await Promise.all(['Direct', 'Branch'].map((title) => page.locator(`.mw-content [title="${title}"]`).elementHandle()));
  await select(page, directStart ? '[title="Direct"]' : '[title="Body"]', directStart ? '[title="Body"]' : '[title="Direct"]', true);
  await page.evaluate(() => window.editor.insertHTML('<h2 title="Incoming">H</h2>'));
  expect(await html(page)).toBe(directStart
    ? '<ol start="4"><li title="Owner"><p><strong title="Direct">A</strong></p><h2 title="Incoming">H</h2><p><br></p><blockquote title="Right"><p title="Body">D</p></blockquote><p title="After">After</p><ul title="Branch"><li>Branch</li></ul></li></ol>'
    : '<ol start="4"><li title="Owner"><blockquote title="Left"><p title="Body">A</p></blockquote><h2 title="Incoming">H</h2><p><em title="Direct">D</em></p><ul title="Branch"><li><br></li></ul></li></ol>');
  for (const node of actual) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

test('quote-root offsets across adjacent items retain actual empty endpoint bodies and raw quote gaps', async ({ page }) => {
  const before = await initialize(page, '<ul><li title="Owner"><blockquote title="Left">\n<p title="Left keep">Keep</p>\n<h2 title="Left body">AB</h2>\n</blockquote></li><li><blockquote title="Right">\n<p title="Right body">CD</p>\n<h3 title="Right keep">Keep</h3>\n</blockquote><ol title="Branch"><li>Branch</li></ol></li></ul>');
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
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ anchor: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Right"]'), anchorOffset: document.getSelection()!.anchorOffset, focus: document.getSelection()!.focusNode === window.editor.surface.querySelector('[title="Left"]'), focusOffset: document.getSelection()!.focusOffset }))).toEqual({ anchor: true, anchorOffset: 3, focus: true, focusOffset: 2 });
});

test('ordinary LI-edge endpoints can cover a quote only in a middle item and preserve both outside wrappers', async ({ page }) => {
  const before = await initialize(page, '<ul><li title="Owner"><h2 title="Start">AB</h2></li><li><blockquote title="Middle">Middle</blockquote></li><li title="Last"><h3 title="End">CD</h3><p title="Keep">Keep</p></li></ul>');
  const nodes = await Promise.all(['Start', 'End', 'Keep'].map((title) => page.locator(`.mw-content [title="${title}"]`).elementHandle()));
  await page.evaluate(() => {
    const root = window.editor.surface;
    root.focus();
    document.getSelection()!.setBaseAndExtent(root.querySelector('[title="Last"]')!, 1, root.querySelector('[title="Owner"]')!, 0);
    window.editor.insertHTML('<p title="First">X</p><h4 title="Incoming">Y</h4>');
  });
  expect(await html(page)).toBe('<ul><li title="Owner"><h2 title="Start"><br></h2><p title="First">X</p><h4 title="Incoming">Y</h4><h3 title="End"><br></h3><p title="Keep">Keep</p></li></ul>');
  for (const node of nodes) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ anchor: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Last"]'), anchorOffset: document.getSelection()!.anchorOffset, focus: document.getSelection()!.focusNode === window.editor.surface.querySelector('[title="Owner"]'), focusOffset: document.getSelection()!.focusOffset }))).toEqual({ anchor: true, anchorOffset: 1, focus: true, focusOffset: 0 });
});

const semanticQuote: SchemaNodeSpec = { name: 'test:quote', kind: 'block', tag: 'blockquote', attributes: { 'data-id': { type: 'text', required: true } } };
for (const invalid of ['<blockquote title="Middle">Image<img src="/logo.svg" alt="Source"></blockquote>', '<blockquote title="Middle" data-mw-node="test:quote" data-id="owned">Semantic</blockquote>', '<blockquote title="Middle"><blockquote>Nested</blockquote></blockquote>']) test(`a fully covered unsupported middle-item quote blocks all mutation: ${invalid}`, async ({ page }) => {
  const before = await initialize(page, '<ul><li><p title="Start">AB</p></li><li>' + invalid + '</li><li><p title="End">CD</p></li></ul>', [semanticQuote]);
  await select(page, '[title="Start"]', '[title="End"]', true);
  const result = await page.evaluate(() => {
    const editor = window.editor;
    const selection = document.getSelection()!;
    const anchor = selection.anchorNode;
    const observer = new MutationObserver(() => {});
    observer.observe(editor.surface, { subtree: true, childList: true, attributes: true });
    let rejected = false;
    try { editor.insertHTML('<p>X</p><h4>Y</h4>'); } catch { rejected = true; }
    const mutations = observer.takeRecords().length;
    observer.disconnect();
    return { rejected, mutations, anchor: selection.anchorNode === anchor, anchorOffset: selection.anchorOffset, focusOffset: selection.focusOffset, changes: window.changes.length, undo: editor.canUndo() };
  });
  expect(result).toEqual({ rejected: true, mutations: 0, anchor: true, anchorOffset: 1, focusOffset: 1, changes: 0, undo: false });
  await paste(page, '<blockquote>Payload</blockquote>');
  expect(await html(page)).toBe(before);
});

for (const boundary of ['first-interleaved', 'middle-interleaved', 'different-list', 'nested-end', 'quote-li-edge']) test(`${boundary} remains an atomic barrier for sibling quote insertion`, async ({ page }) => {
  const value = boundary === 'different-list'
    ? '<ul><li><blockquote title="Left">AB</blockquote></li></ul><ul><li><blockquote title="Right">CD</blockquote></li></ul>'
    : `<ul><li title="Owner"><blockquote title="Left">AB</blockquote>${boundary === 'first-interleaved' ? '<ol><li>Branch</li></ol><p>After branch</p>' : ''}</li><li><blockquote>Middle</blockquote>${boundary === 'middle-interleaved' ? '<ol><li>Branch</li></ol><p>After branch</p>' : ''}</li><li title="Last"><blockquote title="Right">CD</blockquote><ol><li><p title="Nested">Nested</p></li></ol></li></ul>`;
  const before = await initialize(page, value);
  await page.evaluate((boundary) => {
    const root = window.editor.surface;
    root.focus();
    const first = boundary === 'quote-li-edge' ? root.querySelector('[title="Owner"]')! : root.querySelector('[title="Left"]')!.firstChild!;
    const last = root.querySelector(boundary === 'nested-end' ? '[title="Nested"]' : '[title="Right"]')!.firstChild!;
    document.getSelection()!.setBaseAndExtent(last, 1, first, boundary === 'quote-li-edge' ? 0 : 1);
  }, boundary);
  expect(await page.evaluate(() => { try { window.editor.insertHTML('<h4>H</h4>'); return false; } catch { return true; } })).toBe(true);
  await paste(page, '<p>X</p><h4>Y</h4>');
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ changes: 0, undo: false });
});

for (const guard of ['readonly', 'composition', 'canceled']) test(`${guard} prevents sibling quote clipboard replacement`, async ({ page }) => {
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

test('sibling quote replacement inside a nested list preserves merged geometry and outer ancestors', async ({ page }) => {
  const before = await initialize(page, '<table><tbody><tr><td rowspan="2" colspan="2"><ol><li title="Outer">Outer' + source + '</li></ol></td><td>A</td></tr><tr><td>B</td></tr></tbody></table>');
  const nodes = await Promise.all(['.mw-content td', '.mw-content [title="Outer"]', '.mw-content [title="Branch"]'].map((selector) => page.locator(selector).first().elementHandle()));
  await select(page, '[title="Left body"]', '[title="Right body"]');
  await paste(page, '<h4 title="Incoming">H</h4>');
  for (const node of nodes) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
  await expect(page.locator('.mw-content td').first()).toHaveAttribute('rowspan', '2');
  await expect(page.locator('.mw-content td').first()).toHaveAttribute('colspan', '2');
  await expect(page.locator('.mw-content td').nth(1)).toHaveText('A');
  await expect(page.locator('.mw-content td').nth(2)).toHaveText('B');
  await expect(page.locator('.mw-content [title="Middle item"]')).toHaveCount(0);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

test('successful sibling quote replacement clears pending formatting and Undo restores its original caret override', async ({ page }) => {
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
    selection.setBaseAndExtent(original, 1, original, 1);
    return { cleared, exact, restored: Boolean(editor.getFormats().bold), undo: editor.canUndo() };
  })).toEqual({ cleared: true, exact: true, restored: true, undo: false });
  expect(await html(page)).toBe(before);
});

test('ordinary sibling replacement with quotes only outside the interval keeps the previous multi-block composition', async ({ page }) => {
  const before = await initialize(page, '<ul><li title="Owner"><blockquote title="Before"><img src="/logo.svg" alt="Before"></blockquote><p title="Start">AB</p></li><li><p title="End">CD</p><blockquote title="After"><img src="/logo.svg" alt="After"></blockquote><ol title="Branch"><li>Branch</li></ol></li></ul>');
  const nodes = await Promise.all(['Before', 'After', 'Branch'].map((title) => page.locator(`.mw-content [title="${title}"]`).elementHandle()));
  await select(page, '[title="Start"]', '[title="End"]', true);
  await page.evaluate(() => window.editor.insertHTML('<p title="First">X</p><h3 title="Incoming">Y</h3>'));
  expect(await html(page)).toBe('<ul><li title="Owner"><blockquote title="Before"><img src="/logo.svg" alt="Before"></blockquote><p title="Start">AX</p><h3 title="Incoming">YD</h3><blockquote title="After"><img src="/logo.svg" alt="After"></blockquote><ol title="Branch"><li>Branch</li></ol></li></ul>');
  for (const node of nodes) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
  await expect(page.locator('.mw-content [title="First"]')).toHaveCount(0);
  expect(await page.evaluate(() => ({ caret: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Incoming"]')!.firstChild, offset: document.getSelection()!.anchorOffset }))).toEqual({ caret: true, offset: 1 });
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

test('caught sibling-quote import failure rolls back an earlier outer mutation and restores backward selection', async ({ page }) => {
  const before = await initialize(page, source);
  await select(page, '[title="Left body"]', '[title="Right body"]', true);
  expect(await page.evaluate(() => {
    try {
      window.editor.transact((root) => {
        root.querySelector('[title="Before item"]')!.append(document.createTextNode('!'));
        try { window.editor.insertHTML('<p>X</p><blockquote>Mixed</blockquote>'); } catch { /* The containing transaction must still roll back. */ }
      });
      return false;
    } catch { return true; }
  })).toBe(true);
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ anchor: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Right body"]')!.firstChild, anchorOffset: document.getSelection()!.anchorOffset, focus: document.getSelection()!.focusNode === window.editor.surface.querySelector('[title="Left body"]')!.firstChild, focusOffset: document.getSelection()!.focusOffset, changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ anchor: true, anchorOffset: 1, focus: true, focusOffset: 1, changes: 0, undo: false });
});
