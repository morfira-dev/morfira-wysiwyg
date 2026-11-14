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
const start = '<p title="Start" style="text-align: center">AB</p>';
const quote = '<blockquote title="Quote" style="text-align: right"><p title="Head">CD</p><h2 title="Tail">EF</h2></blockquote>';
const end = '<h3 title="End">GH</h3>';
const close = '<p title="Keep after">After</p><ol title="Branch"><li>Nested</li></ol></li><li>Sibling</li></ul>';
const source = open + start + quote + end + close;
const payloads = [
  { name: 'multi-block', input: '\n<p title="Incoming first"><u>X</u></p>\n<h4 title="Incoming">Y</h4>\n', result: '<p title="Incoming first"><u>X</u></p><h4 title="Incoming">Y</h4>' },
  { name: 'heading', input: '\n<h4 title="Incoming" style="text-align: right"><em>H</em></h4>\n', result: '<h4 title="Incoming" style="text-align: right"><em>H</em></h4>' },
  { name: 'quote', input: '\n<blockquote title="Incoming"><p title="Incoming child">Q</p></blockquote>\n', result: '<blockquote title="Incoming"><p title="Incoming child">Q</p></blockquote>' },
];
const directions = [
  { name: 'outside to inside', first: '[title="Start"]', last: '[title="Tail"]', prefix: '<p title="Start" style="text-align: center">A</p>', suffix: '<p><br></p><blockquote title="Quote" style="text-align: right"><h2 title="Tail">F</h2></blockquote>' + end, preserved: ['Tail'], quote: true, typing: 'X' },
  { name: 'inside to outside', first: '[title="Head"]', last: '[title="End"]', prefix: start + '<blockquote title="Quote" style="text-align: right"><p title="Head">C</p></blockquote>', suffix: '<h3 title="End">H</h3>', preserved: ['Head'], quote: true, typing: 'XH' },
  { name: 'outside across the whole quote', first: '[title="Start"]', last: '[title="End"]', prefix: '<p title="Start" style="text-align: center">A</p>', suffix: '<h3 title="End">H</h3>', preserved: [], quote: false, typing: 'XH' },
];

for (const direction of directions) for (const payload of payloads) for (const clipboard of [false, true]) {
  test(`${clipboard ? 'clipboard' : 'API'} ${payload.name} crosses ${direction.name} with standalone roots and one exact history step`, async ({ page }) => {
    const before = await initialize(page, source);
    const kept = await Promise.all(['Owner', 'Keep before', 'Keep after', 'Branch', ...direction.preserved].map((title) => page.locator(`.mw-content [title="${title}"]`).elementHandle()));
    const originalQuote = await page.locator('.mw-content [title="Quote"]').elementHandle();
    await select(page, direction.first, direction.last, true);
    if (clipboard) expect(await paste(page, payload.input)).toBe(true);
    else await page.evaluate((value) => window.editor.insertHTML(value), payload.input);
    const expected = open + direction.prefix + payload.result + direction.suffix + close;
    expect(await html(page)).toBe(expected);
    for (const node of kept) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
    expect(await originalQuote!.evaluate((node) => node.isConnected)).toBe(direction.quote);
    expect(await page.evaluate(() => {
      const root = window.editor.surface;
      const incoming = root.querySelector('[title="Incoming"]')!;
      const selection = document.getSelection()!;
      return { atSuffix: selection.anchorNode === incoming.nextElementSibling, offset: selection.anchorOffset, collapsed: selection.isCollapsed, parent: incoming.parentElement?.getAttribute('title'), nestedQuotes: root.querySelectorAll('blockquote blockquote').length, changes: window.changes.length };
    })).toEqual({ atSuffix: true, offset: 0, collapsed: true, parent: 'Owner', nestedQuotes: 0, changes: 1 });
    await page.keyboard.insertText('X');
    await expect(page.locator('.mw-content [title="Incoming"] + *')).toHaveText(direction.typing);
    await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
    expect(await html(page)).toBe(before);
    expect(await page.evaluate(({ first, last }) => {
      const selection = document.getSelection()!;
      return { anchor: selection.anchorNode === window.editor.surface.querySelector(last)!.firstChild, focus: selection.focusNode === window.editor.surface.querySelector(first)!.firstChild, anchorOffset: selection.anchorOffset, focusOffset: selection.focusOffset, undo: window.editor.canUndo() };
    }, direction)).toEqual({ anchor: true, focus: true, anchorOffset: 1, focusOffset: 1, undo: false });
    await page.evaluate(() => window.editor.redo());
    expect(await html(page)).toBe(expected);
    expect(await page.evaluate(() => ({ node: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Incoming"]')!.nextElementSibling, offset: document.getSelection()!.anchorOffset }))).toEqual({ node: true, offset: 0 });
  });
}

for (const outsideFirst of [false, true]) test(`quote childNodes boundaries retain actual formatting gaps and exact ${outsideFirst ? 'end' : 'start'} offset`, async ({ page }) => {
  const before = await initialize(page, '<ul><li><p title="Start">AB</p><blockquote title="Quote">\n<p title="Head">CD</p>\n<h2 title="Tail">EF</h2>\n</blockquote><h3 title="End">GH</h3></li></ul>');
  const quoteNode = await page.locator('.mw-content [title="Quote"]').elementHandle();
  const bodies = await Promise.all(['Head', 'Tail'].map((title) => page.locator(`.mw-content [title="${title}"]`).elementHandle()));
  const gap = await page.evaluateHandle((outsideFirst) => window.editor.surface.querySelector('[title="Quote"]')!.childNodes[outsideFirst ? 4 : 0], outsideFirst);
  await page.evaluate((outsideFirst) => {
    const root = window.editor.surface;
    const quote = root.querySelector('[title="Quote"]')!;
    const outside = root.querySelector(outsideFirst ? '[title="Start"]' : '[title="End"]')!.firstChild!;
    root.focus();
    if (outsideFirst) document.getSelection()!.setBaseAndExtent(quote, 3, outside, 1);
    else document.getSelection()!.setBaseAndExtent(outside, 1, quote, 2);
    window.editor.insertHTML('<h4 title="Incoming">H</h4>');
  }, outsideFirst);
  expect(await quoteNode!.evaluate((node) => node.isConnected)).toBe(true);
  for (const body of bodies) expect(await body!.evaluate((node) => node.isConnected)).toBe(true);
  expect(await gap.evaluate((node) => node.isConnected)).toBe(true);
  await expect(page.locator('.mw-content [title="Quote"]')).toHaveJSProperty('innerHTML', outsideFirst ? '<p title="Head"><br></p>\n<h2 title="Tail">EF</h2>\n' : '\n<p title="Head">CD</p>\n<h2 title="Tail"><br></h2>');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate((outsideFirst) => {
    const selection = document.getSelection()!;
    return { quote: (outsideFirst ? selection.anchorNode : selection.focusNode) === window.editor.surface.querySelector('[title="Quote"]'), offset: outsideFirst ? selection.anchorOffset : selection.focusOffset };
  }, outsideFirst)).toEqual({ quote: true, offset: outsideFirst ? 3 : 2 });
});

for (const outsideFirst of [false, true]) test(`inline source quote preserves its ${outsideFirst ? 'suffix' : 'prefix'} without nesting the incoming quote`, async ({ page }) => {
  const before = await initialize(page, '<ul><li><p title="Start">AB</p><blockquote title="Quote" style="text-align: right">C<strong>DE</strong>F</blockquote><h2 title="End">GH</h2></li></ul>');
  const actual = await page.locator('.mw-content [title="Quote"]').elementHandle();
  await select(page, outsideFirst ? '[title="Start"]' : '[title="Quote"] strong', outsideFirst ? '[title="Quote"] strong' : '[title="End"]');
  await paste(page, '<blockquote title="Incoming">Q</blockquote>');
  await expect(page.locator('.mw-content [title="Quote"]')).toHaveJSProperty('innerHTML', outsideFirst ? '<strong>E</strong>F' : 'C<strong>D</strong>');
  expect(await actual!.evaluate((node) => node.isConnected)).toBe(true);
  await expect(page.locator('.mw-content blockquote blockquote')).toHaveCount(0);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

test('empty outside prefix and suffix keep original headings and editable placeholders', async ({ page }) => {
  await initialize(page, '<ul><li><h2 title="Start">AB</h2><blockquote>Q</blockquote><h3 title="End" style="text-align: center">CD</h3></li></ul>');
  await select(page, '[title="Start"]', '[title="End"]', false, 0, 2);
  await page.evaluate(() => window.editor.insertHTML('<p title="Incoming first">X</p><h4 title="Incoming">Y</h4>'));
  expect(await html(page)).toBe('<ul><li><h2 title="Start"><br></h2><p title="Incoming first">X</p><h4 title="Incoming">Y</h4><h3 title="End" style="text-align: center"><br></h3></li></ul>');
});

for (const entering of [false, true]) test(`forward ${entering ? 'entering' : 'exiting'} replacement retains an empty actual quote edge and restores exact history`, async ({ page }) => {
  const before = await initialize(page, '<ul><li><p title="Start">AB</p><blockquote title="Quote" style="text-align: right"><h2 title="Body">CD</h2></blockquote><h3 title="End">EF</h3></li></ul>');
  const nodes = await Promise.all(['Quote', 'Body'].map((title) => page.locator(`.mw-content [title="${title}"]`).elementHandle()));
  await select(page, entering ? '[title="Start"]' : '[title="Body"]', entering ? '[title="Body"]' : '[title="End"]', false, entering ? 1 : 0, entering ? 2 : 1);
  await page.evaluate(() => window.editor.insertHTML('<h4 title="Incoming">H</h4>'));
  const inserted = await html(page);
  for (const node of nodes) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
  await expect(page.locator('.mw-content [title="Quote"]')).toHaveJSProperty('innerHTML', '<h2 title="Body"><br></h2>');
  await expect(page.locator('.mw-content [title="Quote"]')).toHaveAttribute('style', 'text-align: right');
  expect(await page.evaluate(() => ({ node: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Incoming"]')!.nextElementSibling, offset: document.getSelection()!.anchorOffset, changes: window.changes.length }))).toEqual({ node: true, offset: 0, changes: 1 });
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate((entering) => {
    const root = window.editor.surface;
    const selection = document.getSelection()!;
    return { anchor: selection.anchorNode === root.querySelector(entering ? '[title="Start"]' : '[title="Body"]')!.firstChild, anchorOffset: selection.anchorOffset, focus: selection.focusNode === root.querySelector(entering ? '[title="Body"]' : '[title="End"]')!.firstChild, focusOffset: selection.focusOffset, undo: window.editor.canUndo() };
  }, entering)).toEqual({ anchor: true, anchorOffset: entering ? 1 : 0, focus: true, focusOffset: entering ? 2 : 1, undo: false });
  await page.evaluate(() => window.editor.redo());
  expect(await html(page)).toBe(inserted);
});

const semanticQuote: SchemaNodeSpec = { name: 'test:quote', kind: 'block', tag: 'blockquote', attributes: { 'data-id': { type: 'text', required: true } } };
const semanticBody: SchemaNodeSpec = { name: 'test:body', kind: 'block', tag: 'p', attributes: { 'data-id': { type: 'text', required: true } } };
test('refused crossing keeps pending formatting for the original caret without modifying selected source content', async ({ page }) => {
  const before = await initialize(page, source);
  expect(await page.evaluate(() => {
    const editor = window.editor;
    const root = editor.surface;
    const start = root.querySelector('[title="Start"]')!.firstChild!;
    const end = root.querySelector('[title="Tail"]')!.firstChild!;
    const selection = document.getSelection()!;
    root.focus();
    selection.setBaseAndExtent(start, 1, start, 1);
    editor.format('bold', true);
    selection.setBaseAndExtent(end, 1, start, 1);
    let rejected = false;
    try { editor.insertHTML('<p>X</p><blockquote>Mixed</blockquote>'); } catch { rejected = true; }
    const exact = selection.anchorNode === end && selection.anchorOffset === 1 && selection.focusNode === start && selection.focusOffset === 1;
    selection.setBaseAndExtent(start, 1, start, 1);
    return { rejected, exact, bold: Boolean(editor.getFormats().bold), undo: editor.canUndo(), changes: window.changes.length };
  })).toEqual({ rejected: true, exact: true, bold: true, undo: false, changes: 0 });
  expect(await html(page)).toBe(before);
});

for (const invalid of ['<p>A</p><blockquote>B</blockquote>', 'Loose<h3>B</h3>', '<blockquote><blockquote>Nested</blockquote></blockquote>', '<h2 data-mw-node="test:quote" data-id="x">Wrong tag</h2>', '<p>A</p><p data-mw-node="test:body" data-id="x">Semantic</p>']) test(`cross-quote invalid payload leaves live DOM, selection, history and pending formats unchanged: ${invalid}`, async ({ page }) => {
  const before = await initialize(page, source, [semanticQuote, semanticBody]);
  await select(page, '[title="Start"]', '[title="Tail"]', true);
  const result = await page.evaluate((invalid) => {
    const editor = window.editor;
    const selection = document.getSelection()!;
    const anchor = selection.anchorNode;
    const focus = selection.focusNode;
    const formats = JSON.stringify(editor.getFormats());
    const observer = new MutationObserver(() => {});
    observer.observe(editor.surface, { subtree: true, childList: true, attributes: true });
    let rejected = false;
    try { editor.insertHTML(invalid); } catch { rejected = true; }
    const mutations = observer.takeRecords().length;
    observer.disconnect();
    return { rejected, mutations, anchor: selection.anchorNode === anchor, focus: selection.focusNode === focus, anchorOffset: selection.anchorOffset, focusOffset: selection.focusOffset, formats: JSON.stringify(editor.getFormats()) === formats, changes: window.changes.length, undo: editor.canUndo() };
  }, invalid);
  expect(result).toEqual({ rejected: true, mutations: 0, anchor: true, focus: true, anchorOffset: 1, focusOffset: 1, formats: true, changes: 0, undo: false });
  await paste(page, invalid);
  expect(await html(page)).toBe(before);
});

for (const cover of [false, true]) for (const invalid of ['<blockquote title="Quote" data-mw-node="test:quote" data-id="x"><p title="Head">CD</p></blockquote>', '<blockquote title="Quote"><p title="Head" data-mw-node="test:body" data-id="x">CD</p></blockquote>', '<blockquote title="Quote"><p title="Head">CD<img src="/logo.svg" alt="Original"></p></blockquote>', '<blockquote title="Quote"><p title="Head">CD</p><blockquote>Nested</blockquote></blockquote>']) test(`cross-quote invalid source refuses ${cover ? 'full coverage' : 'entering'}: ${invalid}`, async ({ page }) => {
  const before = await initialize(page, open + start + invalid + end + close, [semanticQuote, semanticBody]);
  await select(page, '[title="Start"]', cover ? '[title="End"]' : '[title="Head"]');
  expect(await page.evaluate(() => {
    try { window.editor.insertHTML('<h4>H</h4>'); return false; } catch { return true; }
  })).toBe(true);
  await paste(page, '<p>X</p><h4>Y</h4>');
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ changes: 0, undo: false });
});

for (const boundary of ['multiple', 'different-quotes', 'other-item', 'branch']) test(`cross-quote ${boundary} remains an atomic structural barrier`, async ({ page }) => {
  const before = await initialize(page, '<ul><li><p title="Start">AB</p><blockquote><p title="Head">CD</p></blockquote><blockquote><p title="Other quote">EF</p></blockquote><p title="End">GH</p><ol><li><p title="Branch end">IJ</p></li></ol></li><li><p title="Other item">KL</p></li></ul>');
  await select(page, boundary === 'different-quotes' ? '[title="Head"]' : '[title="Start"]', boundary === 'multiple' ? '[title="End"]' : boundary === 'different-quotes' ? '[title="Other quote"]' : boundary === 'other-item' ? '[title="Other item"]' : '[title="Branch end"]', true);
  expect(await page.evaluate(() => {
    try { window.editor.insertHTML('<blockquote>Q</blockquote>'); return false; } catch { return true; }
  })).toBe(true);
  await paste(page, '<h4>H</h4>');
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo(), anchor: document.getSelection()!.anchorOffset, focus: document.getSelection()!.focusOffset }))).toEqual({ changes: 0, undo: false, anchor: 1, focus: 1 });
});

for (const guard of ['readonly', 'composition', 'canceled', 'stripped']) test(`${guard} prevents cross-quote clipboard replacement`, async ({ page }) => {
  const before = await initialize(page, source);
  await select(page, '[title="Start"]', '[title="Tail"]', true);
  await page.evaluate((guard) => {
    const editor = window.editor;
    if (guard === 'readonly') editor.setReadOnly(true);
    if (guard === 'composition') editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const data = new DataTransfer();
    data.setData('text/html', guard === 'stripped' ? '<script>alert(1)</script>' : '<p>X</p><h4>Y</h4>');
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: data });
    if (guard === 'canceled') event.preventDefault();
    editor.surface.dispatchEvent(event);
    if (guard === 'readonly' || guard === 'composition') editor.insertHTML('<h4>H</h4>');
  }, guard);
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ changes: 0, undo: false });
});

test('cross-quote paste stays inside a nested list in a merged cell and preserves other cells and branches', async ({ page }) => {
  const before = await initialize(page, '<table><tbody><tr><td rowspan="2" colspan="2"><ul><li title="Outer">Outer<ol><li><p title="Start">AB</p><blockquote title="Quote"><p title="Head">CD</p></blockquote><p title="End">EF</p><ul title="Branch"><li>Nested</li></ul></li></ol></li></ul></td><td>A</td></tr><tr><td>B</td></tr></tbody></table>');
  const actual = await Promise.all(['.mw-content td', '.mw-content [title="Outer"]', '.mw-content [title="Branch"]', '.mw-content [title="Quote"]'].map((selector) => page.locator(selector).first().elementHandle()));
  await select(page, '[title="Head"]', '[title="End"]');
  await paste(page, '<h4 title="Incoming">H</h4>');
  await expect(page.locator('.mw-content [title="Quote"]')).toHaveJSProperty('innerHTML', '<p title="Head">C</p>');
  await expect(page.locator('.mw-content [title="Incoming"] + p')).toHaveText('F');
  for (const node of actual) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
  await expect(page.locator('.mw-content td').first()).toHaveAttribute('rowspan', '2');
  await expect(page.locator('.mw-content td').first()).toHaveAttribute('colspan', '2');
  await expect(page.locator('.mw-content td').nth(1)).toHaveText('A');
  await expect(page.locator('.mw-content td').nth(2)).toHaveText('B');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

test('a caught invalid cross-quote import poisons an earlier outer mutation and restores backward selection', async ({ page }) => {
  const before = await initialize(page, source);
  await select(page, '[title="Start"]', '[title="Tail"]', true);
  expect(await page.evaluate(() => {
    try {
      window.editor.transact((root) => {
        root.querySelector('[title="Keep after"]')!.append(document.createTextNode('!'));
        try { window.editor.insertHTML('<p>X</p><blockquote>Mixed</blockquote>'); } catch { /* The containing transaction must still roll back. */ }
      });
      return false;
    } catch { return true; }
  })).toBe(true);
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo(), anchor: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Tail"]')!.firstChild, anchorOffset: document.getSelection()!.anchorOffset, focusOffset: document.getSelection()!.focusOffset }))).toEqual({ changes: 0, undo: false, anchor: true, anchorOffset: 1, focusOffset: 1 });
});
