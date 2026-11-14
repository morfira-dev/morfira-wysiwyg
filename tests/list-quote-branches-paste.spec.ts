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
const reference: SchemaNodeSpec = { name: 'test:reference', kind: 'inline', tag: 'span', attributes: { 'data-id': { type: 'text', required: true } } };
const firstBranches = '<ul title="First UL"><li><span data-mw-node="test:reference" data-id="kept">First branch</span><ol title="Deep"><li><blockquote title="Deep quote">Deep<img src="/logo.svg" alt="Kept"></blockquote></li></ol></li></ul><ol title="First OL" start="4"><li>Second branch</li></ol>';
const middleBranches = '<ol title="Middle OL" start="7"><li>Middle branch</li></ol><ul title="Middle UL"><li><br></li></ul>';
const lastBranches = '<ul title="Last UL"><li><br></li></ul><ol title="Last OL" start="9"><li>Last branch</li></ol>';
const branchOrder = ['First UL', 'First OL', 'Middle OL', 'Middle UL', 'Last UL', 'Last OL'];
const open = '<ul title="List"><li title="Before item">Before item</li><li title="Owner"><p title="Keep before">Before</p>';
const outsideStart = '<h2 title="Start" style="text-align: center">AB</h2>';
const left = '<blockquote title="Left" style="text-align: right"><p title="Left keep">Keep left</p><h3 title="Left body">CD</h3><p title="Left cut">Cut left</p></blockquote>';
const middle = '<p title="Owner cut">Owner cut</p>' + firstBranches + '</li>\n<li title="Middle item"><p title="Covered body">Covered</p><blockquote title="Middle">Middle</blockquote>' + middleBranches + '</li>\n<li title="Last item"><p title="Right cut">Cut right</p>';
const right = '<blockquote title="Right" style="text-align: center"><p title="Right prefix">Cut right</p><h2 title="Right body">EF</h2><p title="Right keep">Keep right</p></blockquote>';
const outsideEnd = '<h3 title="End">GH</h3>';
const following = '<p title="Keep after">After</p><blockquote title="Opaque after">Opaque<img src="/logo.svg" alt="Keep"></blockquote>';
const close = '</li>\n<li title="After item">After item</li></ul>';
const source = open + outsideStart + left + middle + right + outsideEnd + following + lastBranches + close;
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

for (const direction of directions) for (const payload of payloads) for (const clipboard of [false, true]) test(`${clipboard ? 'clipboard forward' : 'API backward'} ${payload.name} ${direction.name} retains every branch after result bodies in source order`, async ({ page }) => {
  const before = await initialize(page, source, [reference]);
  const kept = await Promise.all(['List', 'Owner', 'Before item', 'After item', 'Keep before', 'Keep after', 'Opaque after', 'Deep', 'Deep quote', ...branchOrder, ...(direction.left ? ['Left', 'Left body', 'Left keep'] : []), ...(direction.right ? ['Right', 'Right body', 'Right keep'] : [])].map((title) => page.locator(`.mw-content [title="${title}"]`).elementHandle()));
  const branchHTML = await page.evaluate((titles) => titles.map((title) => window.editor.surface.querySelector(`[title="${title}"]`)!.outerHTML), branchOrder);
  const removed = await Promise.all(['Middle item', 'Last item', 'Middle', 'Owner cut', 'Covered body', 'Left cut', 'Right cut', 'Right prefix', ...(!direction.left ? ['Left'] : []), ...(!direction.right ? ['Right'] : [])].map((title) => page.locator(`.mw-content [title="${title}"]`).elementHandle()));
  const gaps = await page.evaluateHandle(() => [...window.editor.surface.querySelector('[title="List"]')!.childNodes].filter((node) => node.nodeType === 3));
  await select(page, direction.first, direction.last, !clipboard);
  if (clipboard) expect(await paste(page, payload.input)).toBe(true);
  else await page.evaluate((value) => window.editor.insertHTML(value), payload.input);
  const expected = open + direction.prefix + payload.result + direction.suffix + following + firstBranches + middleBranches + lastBranches + close;
  expect(await html(page)).toBe(expected);
  for (const node of kept) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
  for (const node of removed) expect(await node!.evaluate((node) => node.isConnected)).toBe(false);
  expect(await gaps.evaluate((nodes) => nodes.map((node) => node.isConnected))).toEqual([false, false, true]);
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    const owner = root.querySelector('[title="Owner"]')!;
    const incoming = root.querySelector('[title="Incoming"]')!;
    const selection = document.getSelection()!;
    const children = [...owner.children];
    const branches = children.filter((node) => ['ul', 'ol'].includes(node.localName));
    return { branches: branches.map((node) => node.getAttribute('title')), bodiesBeforeBranches: children.slice(children.indexOf(branches[0])).every((node) => ['ul', 'ol'].includes(node.localName)), caret: selection.anchorNode === incoming.nextElementSibling, offset: selection.anchorOffset, collapsed: selection.isCollapsed, changes: window.changes.length };
  })).toEqual({ branches: branchOrder, bodiesBeforeBranches: true, caret: true, offset: 0, collapsed: true, changes: 1 });
  expect(await page.evaluate((titles) => titles.map((title) => window.editor.surface.querySelector(`[title="${title}"]`)!.outerHTML), branchOrder)).toEqual(branchHTML);
  await page.keyboard.type('X');
  await expect(page.locator('.mw-content [title="Incoming"] + *')).toHaveText(direction.right ? 'X' : 'XH');
  await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(({ first, last, backward }) => {
    const root = window.editor.surface;
    const selection = document.getSelection()!;
    return { anchor: selection.anchorNode === root.querySelector(backward ? last : first)!.firstChild, focus: selection.focusNode === root.querySelector(backward ? first : last)!.firstChild, anchorOffset: selection.anchorOffset, focusOffset: selection.focusOffset, undo: window.editor.canUndo() };
  }, { first: direction.first, last: direction.last, backward: !clipboard })).toEqual({ anchor: true, focus: true, anchorOffset: 1, focusOffset: 1, undo: false });
  await page.evaluate(() => window.editor.redo());
  expect(await html(page)).toBe(expected);
});

for (const directStart of [false, true]) test(`direct-inline ${directStart ? 'first' : 'last'} bodies preserve first and middle branch placeholders before promotion`, async ({ page }) => {
  const first = directStart ? '<strong title="Direct">AB</strong>' : '<blockquote title="Left"><p title="Body">AB</p></blockquote>';
  const last = directStart ? '<blockquote title="Right"><p title="Body">CD</p></blockquote>' : '<em title="Direct">CD</em>';
  const before = await initialize(page, '<ol start="4"><li title="Owner">' + first + '<ul title="First branch"><li><br></li></ul></li><li title="Middle"><br><ol title="Middle branch"><li><br></li></ol></li><li>' + last + '<ul title="Last branch"><li><br></li></ul></li></ol>');
  const nodes = await Promise.all(['Direct', 'First branch', 'Middle branch', 'Last branch'].map((title) => page.locator(`.mw-content [title="${title}"]`).elementHandle()));
  await select(page, directStart ? '[title="Direct"]' : '[title="Body"]', directStart ? '[title="Body"]' : '[title="Direct"]', true);
  await page.evaluate(() => window.editor.insertHTML('<h2 title="Incoming">H</h2>'));
  const branches = '<ul title="First branch"><li><br></li></ul><ol title="Middle branch"><li><br></li></ol><ul title="Last branch"><li><br></li></ul>';
  expect(await html(page)).toBe('<ol start="4"><li title="Owner">' + (directStart ? '<p><strong title="Direct">A</strong></p><h2 title="Incoming">H</h2><p><br></p><blockquote title="Right"><p title="Body">D</p></blockquote>' : '<blockquote title="Left"><p title="Body">A</p></blockquote><h2 title="Incoming">H</h2><p><em title="Direct">D</em></p>') + branches + '</li></ol>');
  for (const node of nodes) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
  await expect(page.locator('.mw-content [title="Middle"]')).toHaveCount(0);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

for (const mode of ['no-quote', 'native']) test(`${mode} keeps its earlier first-branch barrier`, async ({ page }) => {
  const before = await initialize(page, '<ul><li><p title="Start">AB</p>' + (mode === 'native' ? '<blockquote>Quote</blockquote>' : '') + '<ul><li>First branch</li></ul></li><li><p title="End">CD</p></li></ul>');
  await select(page, '[title="Start"]', '[title="End"]', true);
  if (mode === 'no-quote') {
    expect(await page.evaluate(() => { try { window.editor.insertHTML('<p>X</p><h2>Y</h2>'); return false; } catch { return true; } })).toBe(true);
    await paste(page, '<h2>H</h2>');
  } else expect(await page.evaluate(() => {
    const event = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: 'X' });
    window.editor.surface.dispatchEvent(event);
    return event.defaultPrevented;
  })).toBe(true);
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ changes: 0, undo: false });
});

for (const invalidMiddle of ['<blockquote>Bad<img src="/logo.svg" alt="Source"></blockquote>', '<blockquote><blockquote>Nested</blockquote></blockquote>']) test(`unsupported affected source still rejects before touching any retained branch: ${invalidMiddle}`, async ({ page }) => {
  const before = await initialize(page, '<ul><li><p title="Start">AB</p><ul title="First"><li>First</li></ul></li><li>' + invalidMiddle + '<ol title="Middle"><li>Middle</li></ol></li><li><p title="End">CD</p><ul title="Last"><li>Last</li></ul></li></ul>');
  const branches = await Promise.all(['First', 'Middle', 'Last'].map((title) => page.locator(`.mw-content [title="${title}"]`).elementHandle()));
  await select(page, '[title="Start"]', '[title="End"]', true);
  expect(await page.evaluate(() => {
    const observer = new MutationObserver(() => {});
    observer.observe(window.editor.surface, { subtree: true, childList: true, attributes: true });
    let rejected = false;
    try { window.editor.insertHTML('<h2>H</h2>'); } catch { rejected = true; }
    const mutations = observer.takeRecords().length;
    observer.disconnect();
    return { rejected, mutations, changes: window.changes.length, undo: window.editor.canUndo() };
  })).toEqual({ rejected: true, mutations: 0, changes: 0, undo: false });
  await paste(page, '<p>X</p><h2>Y</h2>');
  expect(await html(page)).toBe(before);
  for (const node of branches) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
});

for (const guard of ['readonly', 'composition', 'canceled']) test(`${guard} prevents quote-crossing branch relocation`, async ({ page }) => {
  const before = await initialize(page, source, [reference]);
  await select(page, '[title="Left body"]', '[title="Right body"]', true);
  await page.evaluate((guard) => {
    const editor = window.editor;
    if (guard === 'readonly') editor.setReadOnly(true);
    if (guard === 'composition') editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const data = new DataTransfer();
    data.setData('text/html', '<p>X</p><h2>Y</h2>');
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: data });
    if (guard === 'canceled') event.preventDefault();
    editor.surface.dispatchEvent(event);
  }, guard);
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ changes: 0, undo: false });
});

test('branch relocation inside a nested list preserves merged cell geometry and outer ancestors', async ({ page }) => {
  const before = await initialize(page, '<table><tbody><tr><td rowspan="2" colspan="2"><ol><li title="Outer">Outer' + source + '</li></ol></td><td>A</td></tr><tr><td>B</td></tr></tbody></table>', [reference]);
  const nodes = await Promise.all(['.mw-content td', '.mw-content [title="Outer"]', ...branchOrder.map((title) => `.mw-content [title="${title}"]`)].map((selector) => page.locator(selector).first().elementHandle()));
  await select(page, '[title="Left body"]', '[title="Right body"]');
  await paste(page, '<h2 title="Incoming">H</h2>');
  for (const node of nodes) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
  await expect(page.locator('.mw-content td').first()).toHaveAttribute('rowspan', '2');
  await expect(page.locator('.mw-content td').first()).toHaveAttribute('colspan', '2');
  await expect(page.locator('.mw-content td').nth(1)).toHaveText('A');
  await expect(page.locator('.mw-content td').nth(2)).toHaveText('B');
  expect(await page.evaluate(() => [...window.editor.surface.querySelector('[title="Owner"]')!.children].filter((node) => ['ul', 'ol'].includes(node.localName)).map((node) => node.getAttribute('title')))).toEqual(branchOrder);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

for (const title of ['First branch', 'Middle branch']) test(`a semantic ${title} root refuses branch relocation before any live mutation`, async ({ page }) => {
  await initialize(page, '<ul><li><blockquote title="Start">AB</blockquote><ul title="First branch"><li>First</li></ul></li><li><blockquote>Middle</blockquote><ol title="Middle branch"><li>Middle</li></ol></li><li><blockquote title="End">CD</blockquote></li></ul>');
  await select(page, '[title="Start"]', '[title="End"]', true);
  expect(await page.evaluate((title) => {
    const editor = window.editor;
    const root = editor.surface;
    const branch = root.querySelector(`[title="${title}"]`)!;
    branch.setAttribute('data-mw-node', 'test:owned-list');
    const baseline = root.innerHTML;
    const selection = document.getSelection()!;
    const anchor = selection.anchorNode;
    const focus = selection.focusNode;
    const observer = new MutationObserver(() => {});
    observer.observe(root, { subtree: true, childList: true, attributes: true });
    let rejected = false;
    try { editor.insertHTML('<h2>H</h2>'); } catch { rejected = true; }
    const mutations = observer.takeRecords().length;
    observer.disconnect();
    return { rejected, mutations, unchanged: root.innerHTML === baseline, connected: branch.isConnected, anchor: selection.anchorNode === anchor, focus: selection.focusNode === focus, anchorOffset: selection.anchorOffset, focusOffset: selection.focusOffset, changes: window.changes.length, undo: editor.canUndo() };
  }, title)).toEqual({ rejected: true, mutations: 0, unchanged: true, connected: true, anchor: true, focus: true, anchorOffset: 1, focusOffset: 1, changes: 0, undo: false });
});

test('branch-preserving quote paste clears stale caret formatting without reviving it after Undo restores a range', async ({ page }) => {
  const before = await initialize(page, source, [reference]);
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
    editor.insertHTML('<h2 title="Incoming">H</h2>');
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

test('quote child offsets retain empty actual endpoints and raw gaps before relocating all branch groups', async ({ page }) => {
  const before = await initialize(page, '<ul><li title="Owner"><blockquote title="Left">\n<p title="Left keep">Keep</p>\n<h2 title="Left body">AB</h2>\n</blockquote><ul title="First branch"><li><br></li></ul></li><li><blockquote>Middle</blockquote><ol title="Middle branch"><li>Middle</li></ol></li><li><blockquote title="Right">\n<p title="Right body">CD</p>\n<h3 title="Right keep">Keep</h3>\n</blockquote><ul title="Last branch"><li><br></li></ul></li></ul>');
  const nodes = await Promise.all(['Left', 'Left keep', 'Left body', 'Right', 'Right body', 'Right keep', 'First branch', 'Middle branch', 'Last branch'].map((title) => page.locator(`.mw-content [title="${title}"]`).elementHandle()));
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
  expect(await page.evaluate(() => [...window.editor.surface.querySelector('[title="Owner"]')!.children].filter((node) => ['ul', 'ol'].includes(node.localName)).map((node) => node.getAttribute('title')))).toEqual(['First branch', 'Middle branch', 'Last branch']);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ anchor: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Right"]'), anchorOffset: document.getSelection()!.anchorOffset, focus: document.getSelection()!.focusNode === window.editor.surface.querySelector('[title="Left"]'), focusOffset: document.getSelection()!.focusOffset }))).toEqual({ anchor: true, anchorOffset: 3, focus: true, focusOffset: 2 });
});
