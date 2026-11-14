import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const initialize = async (page: Page, value: string) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  return page.evaluate((value) => {
    window.dispose();
    const host = document.createElement('div');
    document.body.append(host);
    window.changes = [];
    window.editor = window.createEditor(host, { value, onChange: (change) => window.changes.push(change) });
    window.dispose = () => window.editor.destroy();
    return window.editor.getHTML();
  }, value);
};
const html = (page: Page) => page.evaluate(() => window.editor.getHTML());
const select = (page: Page, first: string, last: string, backward = false) => page.evaluate(({ first, last, backward }) => {
  const root = window.editor.surface;
  const start = root.querySelector(first)!.firstChild!;
  const end = root.querySelector(last)!.firstChild!;
  root.focus();
  document.getSelection()!.setBaseAndExtent(backward ? end : start, 1, backward ? start : end, 1);
}, { first, last, backward });
const paste = (page: Page, value: string) => page.evaluate((value) => {
  const data = new DataTransfer();
  data.setData('text/html', value);
  data.setData('text/plain', 'Wrong fallback');
  const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: data });
  window.editor.surface.dispatchEvent(event);
  return event.defaultPrevented;
}, value);
const prefix = '<ul title="List"><li title="Before item">Before item</li><li title="Owner"><p title="Before">Before</p><ul title="Prefix branch"><li>Prefix branch</li></ul>';
const start = '<h2 title="Start" style="text-align: center">AB</h2>';
const left = '<blockquote title="Left" style="text-align: right"><p title="Left keep">Left keep</p><h3 title="Left body">CD</h3><p title="Left cut">Cut</p></blockquote>';
const firstBranch = '<ol title="First interval" start="4"><li>First branch</li></ol>';
const middleBranches = '<ul title="Middle first"><li><blockquote title="Opaque branch quote">Deep<img src="/logo.svg" alt="Keep"></blockquote></li></ul><ol title="Middle last" start="7"><li><br></li></ol>';
const lastBranch = '<ul title="Last interval"><li>Last interval</li></ul>';
const right = '<blockquote title="Right" style="text-align: center"><p title="Right cut">Cut</p><h2 title="Right body">EF</h2><p title="Right keep">Right keep</p></blockquote>';
const end = '<h3 title="End">GH</h3>';
const following = '<ul title="Following branch"><li>Following</li></ul><p title="After">After</p><ol title="Tail branch" start="9"><li><br></li></ol>';
const close = '</li>\n<li title="After item">After item</li></ul>';
const source = prefix + start + left + firstBranch + '<p title="First cut">Cut</p></li>\n<li title="Middle item"><p title="Middle before">Cut</p>' + middleBranches.slice(0, middleBranches.indexOf('<ol')) + '<blockquote title="Middle">Middle</blockquote>' + middleBranches.slice(middleBranches.indexOf('<ol')) + '<h4 title="Middle after">Cut</h4></li>\n<li title="Last item"><p title="Last cut">Cut</p>' + lastBranch + right + end + following + close;
const protectedBranches = firstBranch + middleBranches + lastBranch;
const protectedTitles = ['First interval', 'Middle first', 'Middle last', 'Last interval'];
const payloads = [
  { name: 'multiple bodies', input: '\n<p title="Incoming first" style="text-align: right"><u>X</u></p>\n<h4 title="Incoming">Y</h4>\n', output: '<p title="Incoming first" style="text-align: right"><u>X</u></p><h4 title="Incoming">Y</h4>' },
  { name: 'heading', input: '<h4 title="Incoming"><em>H</em></h4>', output: '<h4 title="Incoming"><em>H</em></h4>' },
  { name: 'quote', input: '<blockquote title="Incoming"><p>Q</p></blockquote>', output: '<blockquote title="Incoming"><p>Q</p></blockquote>' },
];
const directions = [
  { name: 'quote to quote', first: '[title="Left body"]', last: '[title="Right body"]', left: true, right: true },
  { name: 'outside to quote', first: '[title="Start"]', last: '[title="Right body"]', left: false, right: true },
  { name: 'quote to outside', first: '[title="Left body"]', last: '[title="End"]', left: true, right: false },
  { name: 'outside to outside', first: '[title="Start"]', last: '[title="End"]', left: false, right: false },
];

for (const direction of directions) for (const payload of payloads) for (const clipboard of [false, true]) test(`${clipboard ? 'clipboard forward' : 'API backward'} ${payload.name} ${direction.name} preserves interleaved retained-node order`, async ({ page }) => {
  const before = await initialize(page, source);
  const titles = ['List', 'Owner', 'Before item', 'After item', 'Before', 'Prefix branch', ...protectedTitles, 'Opaque branch quote', 'Following branch', 'After', 'Tail branch', ...(direction.left ? ['Left', 'Left body', 'Left keep'] : []), ...(direction.right ? ['Right', 'Right body', 'Right keep'] : [])];
  const nodes = await Promise.all(titles.map((title) => page.locator(`.mw-content [title="${title}"]`).elementHandle()));
  const branchesBefore = await page.evaluate((titles) => titles.map((title) => window.editor.surface.querySelector(`[title="${title}"]`)!.outerHTML), protectedTitles);
  const removed = await Promise.all(['Middle item', 'Last item', 'Middle', 'First cut', 'Middle before', 'Middle after', 'Last cut', 'Left cut', 'Right cut'].map((title) => page.locator(`.mw-content [title="${title}"]`).elementHandle()));
  await select(page, direction.first, direction.last, !clipboard);
  if (clipboard) expect(await paste(page, payload.input)).toBe(true);
  else await page.evaluate((value) => window.editor.insertHTML(value), payload.input);
  const leftResult = direction.left ? start + '<blockquote title="Left" style="text-align: right"><p title="Left keep">Left keep</p><h3 title="Left body">C</h3></blockquote>' : '<h2 title="Start" style="text-align: center">A</h2>';
  const rightResult = direction.right ? '<p><br></p><blockquote title="Right" style="text-align: center"><h2 title="Right body">F</h2><p title="Right keep">Right keep</p></blockquote>' + end : '<h3 title="End">H</h3>';
  const expected = prefix + leftResult + payload.output + protectedBranches + rightResult + following + close;
  expect(await html(page)).toBe(expected);
  for (const node of nodes) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
  for (const node of removed) expect(await node!.evaluate((node) => node.isConnected)).toBe(false);
  expect(await page.evaluate((titles) => titles.map((title) => window.editor.surface.querySelector(`[title="${title}"]`)!.outerHTML), protectedTitles)).toEqual(branchesBefore);
  expect(await page.evaluate((rightQuoted) => {
    const root = window.editor.surface;
    const selection = document.getSelection()!;
    const right = root.querySelector(rightQuoted ? '[title="Right"]' : '[title="End"]')!;
    const body = rightQuoted ? right.previousElementSibling : right;
    return { caret: selection.anchorNode === body, offset: selection.anchorOffset, collapsed: selection.isCollapsed, changes: window.changes.length, payloadBeforeBranches: root.querySelector('[title="Incoming"]')!.nextElementSibling?.getAttribute('title') === 'First interval', lastBranchBeforeSuffix: (rightQuoted ? body : right)?.previousElementSibling?.getAttribute('title') === 'Last interval' };
  }, direction.right)).toEqual({ caret: true, offset: 0, collapsed: true, changes: 1, payloadBeforeBranches: true, lastBranchBeforeSuffix: true });
  await page.keyboard.insertText('X');
  expect(await page.locator(direction.right ? '.mw-content [title="Right"]' : '.mw-content [title="End"]').evaluate((node, quoted) => (quoted ? node.previousElementSibling : node)?.textContent, direction.right)).toBe(direction.right ? 'X' : 'XH');
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

test('same-item interleaved quote replacement leaves prefix branches and following body/branch alternation in place', async ({ page }) => {
  const before = await initialize(page, '<ul><li title="Owner"><p>Before</p><ul title="Prefix"><li>Prefix</li></ul><blockquote title="Left">AB</blockquote><ol title="Protected" start="3"><li><br></li></ol><h2>Cut</h2><blockquote title="Right">CD</blockquote><ul title="Following"><li>Following</li></ul><p title="After">After</p></li></ul>');
  const nodes = await Promise.all(['Owner', 'Prefix', 'Left', 'Protected', 'Right', 'Following', 'After'].map((title) => page.locator(`.mw-content [title="${title}"]`).elementHandle()));
  await select(page, '[title="Left"]', '[title="Right"]', true);
  await paste(page, '<blockquote title="Incoming">Q</blockquote>');
  expect(await html(page)).toBe('<ul><li title="Owner"><p>Before</p><ul title="Prefix"><li>Prefix</li></ul><blockquote title="Left">A</blockquote><blockquote title="Incoming">Q</blockquote><ol title="Protected" start="3"><li><br></li></ol><p><br></p><blockquote title="Right">D</blockquote><ul title="Following"><li>Following</li></ul><p title="After">After</p></li></ul>');
  for (const node of nodes) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

for (const profile of ['same-body', 'same-quote', 'no-affected-quote', 'inline', 'native']) test(`${profile} stays outside the interleaved structural quote-crossing profile`, async ({ page }) => {
  const before = await initialize(page, '<ul><li><p title="Start">AB</p><ul><li>Branch</li></ul><p title="End">CD</p><blockquote title="Quote"><p title="Body">EF</p><h2 title="Other">GH</h2></blockquote></li></ul>');
  await select(page, profile === 'same-quote' ? '[title="Body"]' : '[title="Start"]', profile === 'same-quote' ? '[title="Other"]' : profile === 'same-body' ? '[title="Start"]' : profile === 'no-affected-quote' ? '[title="End"]' : '[title="Other"]', true);
  if (profile === 'same-body') await page.evaluate(() => {
    const text = window.editor.surface.querySelector('[title="Start"]')!.firstChild!;
    document.getSelection()!.setBaseAndExtent(text, 1, text, 0);
  });
  if (profile === 'native') expect(await page.evaluate(() => {
    const event = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: 'X' });
    window.editor.surface.dispatchEvent(event);
    return event.defaultPrevented;
  })).toBe(true);
  else {
    const value = profile === 'inline' ? '<strong>X</strong>' : '<h3>H</h3>';
    expect(await page.evaluate((value) => { try { window.editor.insertHTML(value); return false; } catch { return true; } }, value)).toBe(true);
    await paste(page, value);
  }
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ changes: 0, undo: false });
});

for (const kind of ['image', 'nested']) test(`unsupported covered quote ${kind} rejects without moving interleaved branches`, async ({ page }) => {
  const before = await initialize(page, source.replace('<blockquote title="Middle">Middle</blockquote>', kind === 'image' ? '<blockquote title="Middle">Middle<img src="/logo.svg" alt="Source"></blockquote>' : '<blockquote title="Middle"><blockquote>Nested</blockquote></blockquote>'));
  await select(page, '[title="Left body"]', '[title="Right body"]', true);
  const result = await page.evaluate(() => {
    const root = window.editor.surface;
    const observer = new MutationObserver(() => {});
    observer.observe(root, { subtree: true, childList: true, attributes: true });
    let rejected = false;
    try { window.editor.insertHTML('<h3>H</h3>'); } catch { rejected = true; }
    const mutations = observer.takeRecords().length;
    observer.disconnect();
    return { rejected, mutations, changes: window.changes.length, undo: window.editor.canUndo() };
  });
  expect(result).toEqual({ rejected: true, mutations: 0, changes: 0, undo: false });
  expect(await html(page)).toBe(before);
});

for (const guard of ['readonly', 'composition', 'canceled']) test(`${guard} blocks interleaved quote clipboard mutation`, async ({ page }) => {
  const before = await initialize(page, source);
  await select(page, '[title="Left body"]', '[title="Right body"]', true);
  await page.evaluate((guard) => {
    const editor = window.editor;
    if (guard === 'readonly') editor.setReadOnly(true);
    if (guard === 'composition') editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const data = new DataTransfer();
    data.setData('text/html', '<h3>H</h3>');
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: data });
    if (guard === 'canceled') event.preventDefault();
    editor.surface.dispatchEvent(event);
  }, guard);
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ changes: 0, undo: false });
});

test('interleaved quote replacement within a nested list preserves merged cells and outer ancestors', async ({ page }) => {
  const before = await initialize(page, '<table><tbody><tr><td rowspan="2" colspan="2"><ol><li title="Outer">Outer' + source + '</li></ol></td><td>A</td></tr><tr><td>B</td></tr></tbody></table>');
  const nodes = await Promise.all(['.mw-content td', '.mw-content [title="Outer"]', '.mw-content [title="Prefix branch"]', '.mw-content [title="Following branch"]'].map((selector) => page.locator(selector).first().elementHandle()));
  await select(page, '[title="Left body"]', '[title="Right body"]');
  await paste(page, '<h3>H</h3>');
  for (const node of nodes) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
  await expect(page.locator('.mw-content td').first()).toHaveAttribute('rowspan', '2');
  await expect(page.locator('.mw-content td').first()).toHaveAttribute('colspan', '2');
  await expect(page.locator('.mw-content td').nth(1)).toHaveText('A');
  await expect(page.locator('.mw-content td').nth(2)).toHaveText('B');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

test('LI-level coordinates use actual child positions across branches and Undo restores the original offsets', async ({ page }) => {
  const before = await initialize(page, source);
  await page.evaluate(() => {
    const root = window.editor.surface;
    root.focus();
    document.getSelection()!.setBaseAndExtent(root.querySelector('[title="Last item"]')!, 4, root.querySelector('[title="Owner"]')!, 2);
    window.editor.insertHTML('<h4 title="Incoming">H</h4>');
  });
  expect(await html(page)).toBe(prefix + '<h2 title="Start" style="text-align: center"><br></h2><h4 title="Incoming">H</h4>' + protectedBranches + '<h3 title="End"><br></h3>' + following + close);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ anchor: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Last item"]'), anchorOffset: document.getSelection()!.anchorOffset, focus: document.getSelection()!.focusNode === window.editor.surface.querySelector('[title="Owner"]'), focusOffset: document.getSelection()!.focusOffset }))).toEqual({ anchor: true, anchorOffset: 4, focus: true, focusOffset: 2 });
});

for (const edge of ['start-facing-branch', 'end-after-branch']) test(`a ${edge} LI boundary is not silently clamped to a body`, async ({ page }) => {
  const before = await initialize(page, source);
  await page.evaluate((edge) => {
    const root = window.editor.surface;
    const first = edge === 'start-facing-branch' ? root.querySelector('[title="Owner"]')! : root.querySelector('[title="Left body"]')!.firstChild!;
    const last = edge === 'end-after-branch' ? root.querySelector('[title="Last item"]')! : root.querySelector('[title="Right body"]')!.firstChild!;
    root.focus();
    document.getSelection()!.setBaseAndExtent(last, edge === 'end-after-branch' ? 2 : 1, first, 1);
  }, edge);
  expect(await page.evaluate(() => { try { window.editor.insertHTML('<h4>H</h4>'); return false; } catch { return true; } })).toBe(true);
  await paste(page, '<p>X</p><h4>Y</h4>');
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ changes: 0, undo: false });
});

test('a semantic interleaved branch root refuses before any retained node moves', async ({ page }) => {
  await initialize(page, source);
  await select(page, '[title="Left body"]', '[title="Right body"]', true);
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    root.querySelector('[title="Following branch"]')!.setAttribute('data-mw-node', 'test:owned-list');
    const baseline = root.innerHTML;
    const observer = new MutationObserver(() => {});
    observer.observe(root, { subtree: true, childList: true, attributes: true });
    let rejected = false;
    try { window.editor.insertHTML('<h4>H</h4>'); } catch { rejected = true; }
    const mutations = observer.takeRecords().length;
    observer.disconnect();
    return { rejected, mutations, unchanged: root.innerHTML === baseline, changes: window.changes.length, undo: window.editor.canUndo() };
  })).toEqual({ rejected: true, mutations: 0, unchanged: true, changes: 0, undo: false });
});

for (const directStart of [false, true]) test(`a noninterleaved direct-inline ${directStart ? 'first' : 'last'} neighbor composes with an interleaved quote item without moving following branches into its paragraph`, async ({ page }) => {
  const before = await initialize(page, directStart
    ? '<ol start="4"><li title="Owner"><strong title="Direct">AB</strong><ul title="First branch"><li><br></li></ul></li><li><p>Cut</p><ol title="Interval" start="3"><li>Interval</li></ol><blockquote title="Right"><p title="Body">CD</p></blockquote><ul title="Following"><li>Following</li></ul><p title="After">After</p></li></ol>'
    : '<ol start="4"><li title="Owner"><p>Before</p><ul title="Prefix"><li>Prefix</li></ul><blockquote title="Left"><p title="Body">AB</p></blockquote><ol title="Interval" start="3"><li>Interval</li></ol><p>Cut</p></li><li><em title="Direct">CD</em><ul title="Following"><li><br></li></ul></li></ol>');
  const titles = directStart ? ['Direct', 'First branch', 'Interval', 'Right', 'Following', 'After'] : ['Prefix', 'Left', 'Interval', 'Direct', 'Following'];
  const nodes = await Promise.all(titles.map((title) => page.locator(`.mw-content [title="${title}"]`).elementHandle()));
  await select(page, directStart ? '[title="Direct"]' : '[title="Body"]', directStart ? '[title="Body"]' : '[title="Direct"]', true);
  await page.evaluate(() => window.editor.insertHTML('<h2 title="Incoming">H</h2>'));
  expect(await html(page)).toBe(directStart
    ? '<ol start="4"><li title="Owner"><p><strong title="Direct">A</strong></p><h2 title="Incoming">H</h2><ul title="First branch"><li><br></li></ul><ol title="Interval" start="3"><li>Interval</li></ol><p><br></p><blockquote title="Right"><p title="Body">D</p></blockquote><ul title="Following"><li>Following</li></ul><p title="After">After</p></li></ol>'
    : '<ol start="4"><li title="Owner"><p>Before</p><ul title="Prefix"><li>Prefix</li></ul><blockquote title="Left"><p title="Body">A</p></blockquote><h2 title="Incoming">H</h2><ol title="Interval" start="3"><li>Interval</li></ol><p><em title="Direct">D</em></p><ul title="Following"><li><br></li></ul></li></ol>');
  for (const node of nodes) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
  expect(await page.evaluate((directStart) => {
    const root = window.editor.surface;
    const caretBody = directStart ? root.querySelector('[title="Right"]')!.previousElementSibling : root.querySelector('[title="Direct"]')!.parentElement;
    const selection = document.getSelection()!;
    return { caret: selection.anchorNode === caretBody, offset: selection.anchorOffset, branchOutsideParagraph: root.querySelector('[title="Following"]')!.parentElement?.getAttribute('title') === 'Owner', changes: window.changes.length };
  }, directStart)).toEqual({ caret: true, offset: 0, branchOutsideParagraph: true, changes: 1 });
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate((directStart) => {
    const root = window.editor.surface;
    const selection = document.getSelection()!;
    return { anchor: selection.anchorNode === root.querySelector(directStart ? '[title="Body"]' : '[title="Direct"]')!.firstChild, focus: selection.focusNode === root.querySelector(directStart ? '[title="Direct"]' : '[title="Body"]')!.firstChild, anchorOffset: selection.anchorOffset, focusOffset: selection.focusOffset, undo: window.editor.canUndo() };
  }, directStart)).toEqual({ anchor: true, focus: true, anchorOffset: 1, focusOffset: 1, undo: false });
});

test('interleaved quote-level offsets keep empty endpoint wrappers, raw quote gaps and protected branch order', async ({ page }) => {
  const before = await initialize(page, '<ul><li title="Owner"><p>Before</p><ul title="Prefix"><li>Prefix</li></ul><blockquote title="Left">\n<p title="Left keep">Keep</p>\n<h2 title="Left body">AB</h2>\n</blockquote><ol title="Protected"><li><br></li></ol><p>Cut</p></li><li><p>Cut</p><ul title="Interval"><li>Interval</li></ul><blockquote title="Right">\n<p title="Right body">CD</p>\n<h3 title="Right keep">Keep</h3>\n</blockquote><ol title="Following"><li>Following</li></ol><p title="After">After</p></li></ul>');
  const nodes = await Promise.all(['Prefix', 'Left', 'Left body', 'Left keep', 'Protected', 'Interval', 'Right', 'Right body', 'Right keep', 'Following', 'After'].map((title) => page.locator(`.mw-content [title="${title}"]`).elementHandle()));
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
  expect(await page.evaluate(() => [...window.editor.surface.querySelector('[title="Owner"]')!.children].map((node) => node.getAttribute('title')))).toEqual([null, 'Prefix', 'Left', 'Incoming', 'Protected', 'Interval', null, 'Right', 'Following', 'After']);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ anchor: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Right"]'), anchorOffset: document.getSelection()!.anchorOffset, focus: document.getSelection()!.focusNode === window.editor.surface.querySelector('[title="Left"]'), focusOffset: document.getSelection()!.focusOffset }))).toEqual({ anchor: true, anchorOffset: 3, focus: true, focusOffset: 2 });
});
