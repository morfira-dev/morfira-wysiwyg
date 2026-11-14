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
const caret = (page: Page, selector: string, offset = 0, element = false) => page.evaluate(({ selector, offset, element }) => {
  const root = window.editor.surface;
  const target = root.querySelector(selector)!;
  const node = element ? target : target.firstChild!;
  root.focus();
  document.getSelection()!.setBaseAndExtent(node, offset, node, offset);
}, { selector, offset, element });
const paste = (page: Page, value: string) => page.evaluate((value) => {
  const data = new DataTransfer();
  data.setData('text/html', value);
  data.setData('text/plain', 'Wrong fallback');
  const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: data });
  window.editor.surface.dispatchEvent(event);
  return event.defaultPrevented;
}, value);
const prefix = '<ul><li title="Owner"><p title="Before">Before</p><ul title="Prefix branch"><li>Prefix</li></ul><h2 title="After prefix branch">Outside body</h2>';
const suffix = '<ol title="Following branch" start="4"><li><br></li></ol><p title="After">After</p><blockquote title="Neighbor">Opaque<img src="/logo.svg" alt="Keep"></blockquote><ul title="Tail"><li>Tail</li></ul></li><li>Keep item</li></ul>';
const quoteOpen = '<blockquote title="Quote" style="text-align: right"><p title="Quoted before">Keep before</p>';
const quoteClose = '<p title="Quoted after">Keep after</p></blockquote>';
const start = '<h2 title="Start" style="text-align: center">AB</h2>';
const remaining = '<p title="Covered">Covered</p><h3 title="End">CD</h3>';
const source = prefix + quoteOpen + start + remaining + quoteClose + suffix;
const profiles = [
  { name: 'caret', firstOffset: 1, end: '[title="Start"]', endOffset: 1, backward: false, cross: false, prefix: 'A' },
  { name: 'same-body forward', firstOffset: 0, end: '[title="Start"]', endOffset: 1, backward: false, cross: false, prefix: '' },
  { name: 'same-body backward', firstOffset: 0, end: '[title="Start"]', endOffset: 1, backward: true, cross: false, prefix: '' },
  { name: 'cross-body forward', firstOffset: 1, end: '[title="End"]', endOffset: 1, backward: false, cross: true, prefix: 'A' },
  { name: 'cross-body backward', firstOffset: 1, end: '[title="End"]', endOffset: 1, backward: true, cross: true, prefix: 'A' },
];

for (const profile of profiles) for (const heading of [false, true]) for (const clipboard of [false, true]) test(`interleaved inner quote ${profile.name} ${heading ? 'heading' : 'multiple blocks'} via ${clipboard ? 'clipboard' : 'API'} leaves every outside node in order`, async ({ page }) => {
  const before = await initialize(page, source);
  const names = ['Owner', 'Before', 'Prefix branch', 'After prefix branch', 'Quote', 'Quoted before', 'Quoted after', 'Following branch', 'After', 'Neighbor', 'Tail'];
  const nodes = await Promise.all(names.map((title) => page.locator(`.mw-content [title="${title}"]`).elementHandle()));
  const outside = await page.evaluate(() => [...window.editor.surface.querySelector('[title="Owner"]')!.children].filter((node) => node.getAttribute('title') !== 'Quote').map((node) => node.outerHTML));
  await page.evaluate((profile) => {
    const root = window.editor.surface;
    const first = root.querySelector('[title="Start"]')!.firstChild!;
    const last = root.querySelector(profile.end)!.firstChild!;
    root.focus();
    document.getSelection()!.setBaseAndExtent(profile.backward ? last : first, profile.backward ? profile.endOffset : profile.firstOffset, profile.backward ? first : last, profile.backward ? profile.firstOffset : profile.endOffset);
  }, profile);
  const payload = heading ? '<h4 title="Incoming" style="text-align: right"><em>H</em></h4>' : '<p title="Ignored first"><u>X</u></p>\n<h4 title="Incoming">Y</h4>';
  if (clipboard) expect(await paste(page, payload)).toBe(true);
  else await page.evaluate((value) => window.editor.insertHTML(value), payload);
  const tail = profile.cross ? 'D' : 'B';
  const prefixContent = heading ? profile.prefix || '<br>' : `${profile.prefix}<u>X</u>`;
  const leading = `<h2 title="Start" style="text-align: center">${prefixContent}</h2>`;
  const inserted = heading ? '<h4 title="Incoming" style="text-align: right"><em>H</em></h4>' + (profile.cross ? `<h3 title="End">${tail}</h3>` : `<h2 title="Start" style="text-align: center">${tail}</h2>`) : `<h4 title="Incoming">Y${tail}</h4>`;
  const expected = prefix + quoteOpen + leading + inserted + (profile.cross ? '' : remaining) + quoteClose + suffix;
  expect(await html(page)).toBe(expected);
  for (const node of nodes) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
  expect(await page.evaluate(() => {
    const owner = window.editor.surface.querySelector('[title="Owner"]')!;
    const incoming = owner.querySelector('[title="Incoming"]')!;
    return { order: [...owner.children].map((node) => node.getAttribute('title')), parent: incoming.parentElement?.getAttribute('title'), changes: window.changes.length };
  })).toEqual({ order: ['Before', 'Prefix branch', 'After prefix branch', 'Quote', 'Following branch', 'After', 'Neighbor', 'Tail'], parent: 'Quote', changes: 1 });
  expect(await page.evaluate(() => [...window.editor.surface.querySelector('[title="Owner"]')!.children].filter((node) => node.getAttribute('title') !== 'Quote').map((node) => node.outerHTML))).toEqual(outside);
  expect(await page.evaluate((heading) => {
    const incoming = window.editor.surface.querySelector('[title="Incoming"]')!;
    const selection = document.getSelection()!;
    return { point: selection.anchorNode === (heading ? incoming.nextElementSibling : incoming.firstChild), offset: selection.anchorOffset, collapsed: selection.isCollapsed };
  }, heading)).toEqual({ point: true, offset: heading ? 0 : 1, collapsed: true });
  await page.keyboard.type('Z');
  expect(await page.locator('.mw-content [title="Incoming"]').evaluate((node, heading) => (heading ? node.nextElementSibling : node)?.textContent, heading)).toBe(heading ? `Z${tail}` : `YZ${tail}`);
  await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
  expect(await html(page)).toBe(before);
  expect(await page.evaluate((profile) => {
    const root = window.editor.surface;
    const selection = document.getSelection()!;
    return { anchor: selection.anchorNode === root.querySelector(profile.backward ? profile.end : '[title="Start"]')!.firstChild, focus: selection.focusNode === root.querySelector(profile.backward ? '[title="Start"]' : profile.end)!.firstChild, anchorOffset: selection.anchorOffset, focusOffset: selection.focusOffset, undo: window.editor.canUndo() };
  }, profile)).toEqual({ anchor: true, focus: true, anchorOffset: profile.backward ? profile.endOffset : profile.firstOffset, focusOffset: profile.backward ? profile.firstOffset : profile.endOffset, undo: false });
  await page.evaluate(() => window.editor.redo());
  expect(await html(page)).toBe(expected);
});

for (const inline of [false, true]) test(`${inline ? 'inline' : 'wrapped'} empty quote in an interleaved item clears pending caret formatting and restores it on Undo`, async ({ page }) => {
  const quote = inline ? '<blockquote title="Quote"><br></blockquote>' : '<blockquote title="Quote"><p title="Empty"><br></p></blockquote>';
  const before = await initialize(page, prefix + quote + suffix);
  const point = inline ? '[title="Quote"]' : '[title="Empty"]';
  await caret(page, point, 0, true);
  await page.evaluate(() => { window.editor.format('bold', true); window.editor.insertHTML('<p><br></p><h3 title="Incoming"><br></h3>'); });
  expect(await html(page)).toBe(prefix + '<blockquote title="Quote">' + (inline ? '<p><br></p>' : '<p title="Empty"><br></p>') + '<h3 title="Incoming"><br></h3></blockquote>' + suffix);
  expect(await page.evaluate(() => ({ bold: Boolean(window.editor.getFormats().bold), point: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Incoming"]'), offset: document.getSelection()!.anchorOffset, changes: window.changes.length }))).toEqual({ bold: false, point: true, offset: 0, changes: 1 });
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate((point) => ({
    bold: Boolean(window.editor.getFormats().bold),
    point: document.getSelection()!.anchorNode === window.editor.surface.querySelector(point),
    offset: document.getSelection()!.anchorOffset,
  }), point)).toEqual({ bold: true, point: true, offset: 0 });
});

for (const offset of [0, 2, 3, 5]) test(`quote childNodes offset ${offset} with raw gaps retains interleaved outer branches and exact original point`, async ({ page }) => {
  const before = await initialize(page, prefix + '<blockquote title="Quote">\n<p>AB</p>\n<h2>CD</h2>\n</blockquote>' + suffix);
  const branches = await Promise.all(['Prefix branch', 'Following branch', 'Tail'].map((title) => page.locator(`.mw-content [title="${title}"]`).elementHandle()));
  await caret(page, '[title="Quote"]', offset, true);
  await paste(page, '<h3 title="Incoming">H</h3>');
  const expected = offset === 0 ? ['', 'H', 'AB', 'CD'] : offset === 5 ? ['AB', 'CD', 'H', ''] : ['AB', '', 'H', 'CD'];
  await expect(page.locator('.mw-content [title="Quote"] > p, .mw-content [title="Quote"] > h2, .mw-content [title="Quote"] > h3')).toHaveText(expected);
  for (const node of branches) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ point: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Quote"]'), offset: document.getSelection()!.anchorOffset }))).toEqual({ point: true, offset });
});

for (const invalid of ['<blockquote>Nested</blockquote>', '<p>A</p><blockquote>Mixed</blockquote>', 'Loose<h3>B</h3>']) test(`invalid interleaved inner-quote payload is atomic: ${invalid}`, async ({ page }) => {
  const before = await initialize(page, source);
  await caret(page, '[title="Start"]', 1);
  expect(await page.evaluate((invalid) => {
    const editor = window.editor;
    editor.format('bold', true);
    const anchor = document.getSelection()!.anchorNode;
    const observer = new MutationObserver(() => {});
    observer.observe(editor.surface, { subtree: true, childList: true, attributes: true });
    let rejected = false;
    try { editor.insertHTML(invalid); } catch { rejected = true; }
    const mutations = observer.takeRecords().length;
    observer.disconnect();
    return { rejected, mutations, point: document.getSelection()!.anchorNode === anchor, offset: document.getSelection()!.anchorOffset, bold: Boolean(editor.getFormats().bold), changes: window.changes.length, undo: editor.canUndo() };
  }, invalid)).toEqual({ rejected: true, mutations: 0, point: true, offset: 1, bold: true, changes: 0, undo: false });
  await paste(page, invalid);
  expect(await html(page)).toBe(before);
});

for (const title of ['Prefix branch', 'Following branch', 'Tail']) test(`an owned ${title} root blocks inner insertion before mutation`, async ({ page }) => {
  await initialize(page, source);
  await caret(page, '[title="Start"]', 1);
  expect(await page.evaluate((title) => {
    const root = window.editor.surface;
    root.querySelector(`[title="${title}"]`)!.setAttribute('data-mw-node', 'test:owned-list');
    const baseline = root.innerHTML;
    const observer = new MutationObserver(() => {});
    observer.observe(root, { subtree: true, childList: true, attributes: true });
    let rejected = false;
    try { window.editor.insertHTML('<h3>H</h3>'); } catch { rejected = true; }
    const mutations = observer.takeRecords().length;
    observer.disconnect();
    return { rejected, mutations, unchanged: root.innerHTML === baseline, changes: window.changes.length, undo: window.editor.canUndo() };
  }, title)).toEqual({ rejected: true, mutations: 0, unchanged: true, changes: 0, undo: false });
});

const semanticQuote: SchemaNodeSpec = { name: 'test:quote', kind: 'block', tag: 'blockquote', attributes: { 'data-id': { type: 'text', required: true } } };
const semanticBody: SchemaNodeSpec = { name: 'test:body', kind: 'block', tag: 'p', attributes: { 'data-id': { type: 'text', required: true } } };
for (const shape of ['quote', 'body', 'image', 'nested']) test(`unsupported ${shape} source inside an interleaved item rejects before mutation`, async ({ page }) => {
  const quoteAttrs = shape === 'quote' ? ' data-mw-node="test:quote" data-id="owned"' : '';
  const bodyAttrs = shape === 'body' ? ' data-mw-node="test:body" data-id="owned"' : '';
  const extra = shape === 'image' ? '<img src="/logo.svg" alt="Original">' : shape === 'nested' ? '<blockquote>Nested</blockquote>' : '';
  const before = await initialize(page, prefix + `<blockquote title="Quote"${quoteAttrs}><p title="Body"${bodyAttrs}>AB${extra}</p></blockquote>` + suffix, [semanticQuote, semanticBody]);
  await caret(page, '[title="Body"]', 1);
  expect(await page.evaluate(() => { try { window.editor.insertHTML('<p>X</p><h3>Y</h3>'); return false; } catch { return true; } })).toBe(true);
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ changes: 0, undo: false });
});

for (const guard of ['readonly', 'composition', 'canceled', 'stripped']) test(`${guard} prevents inner-quote clipboard editing without touching interleaved neighbors`, async ({ page }) => {
  const before = await initialize(page, source);
  await caret(page, '[title="Start"]', 1);
  await page.evaluate((guard) => {
    const editor = window.editor;
    if (guard === 'readonly') editor.setReadOnly(true);
    if (guard === 'composition') editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const data = new DataTransfer();
    data.setData('text/html', guard === 'stripped' ? '<script>alert(1)</script>' : '<p>X</p><h3>Y</h3>');
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: data });
    if (guard === 'canceled') event.preventDefault();
    editor.surface.dispatchEvent(event);
  }, guard);
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ changes: 0, undo: false });
});

test('inner quote editing inside an interleaved nested list preserves merged geometry and all outer ancestors', async ({ page }) => {
  const before = await initialize(page, '<table><tbody><tr><td rowspan="2" colspan="2"><ol><li title="Outer">Outer' + source + '</li></ol></td><td>A</td></tr><tr><td>B</td></tr></tbody></table>');
  const nodes = await Promise.all(['.mw-content td', '.mw-content [title="Outer"]', '.mw-content [title="Prefix branch"]', '.mw-content [title="Following branch"]', '.mw-content [title="Quote"]'].map((selector) => page.locator(selector).first().elementHandle()));
  await caret(page, '[title="Start"]', 1);
  await paste(page, '<h3 title="Incoming">H</h3>');
  for (const node of nodes) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
  await expect(page.locator('.mw-content td').first()).toHaveAttribute('rowspan', '2');
  await expect(page.locator('.mw-content td').first()).toHaveAttribute('colspan', '2');
  await expect(page.locator('.mw-content td').nth(1)).toHaveText('A');
  await expect(page.locator('.mw-content td').nth(2)).toHaveText('B');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

test('a caught invalid inner-quote import rolls back an earlier outer branch mutation', async ({ page }) => {
  const before = await initialize(page, source);
  await caret(page, '[title="Start"]', 1);
  expect(await page.evaluate(() => {
    try {
      window.editor.transact((root) => {
        root.querySelector('[title="Tail"] li')!.append(document.createTextNode('!'));
        try { window.editor.insertHTML('<blockquote>Nested</blockquote>'); } catch { /* Preserve outer transaction failure. */ }
      });
      return false;
    } catch { return true; }
  })).toBe(true);
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo(), offset: document.getSelection()!.anchorOffset }))).toEqual({ changes: 0, undo: false, offset: 1 });
});
