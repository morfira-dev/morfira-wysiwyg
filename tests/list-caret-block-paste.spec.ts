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
const caret = (page: Page, selector: string, offset: number, element = false) => page.evaluate(({ selector, offset, element }) => {
  const root = window.editor.surface;
  const target = root.querySelector(selector)!;
  const point = element ? target : target.firstChild!;
  root.focus();
  document.getSelection()!.setBaseAndExtent(point, offset, point, offset);
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
const payload = '\n<p style="text-align: right"><u>First</u></p>\n<h3 title="Middle">Middle</h3>\n<p title="Last" style="text-align: right">Last</p>\n';
const source = '<ul><li title="Owner"><p title="Before">Before</p><h2 title="Body" style="text-align: center">Alpha Beta</h2><p title="After">After</p><ol title="Branch"><li><p><br></p></li></ol></li><li>Keep</li></ul>';
const inserted = '<ul><li title="Owner"><p title="Before">Before</p><h2 title="Body" style="text-align: center">Alpha <u>First</u></h2><h3 title="Middle">Middle</h3><p title="Last" style="text-align: right">LastBeta</p><p title="After">After</p><ol title="Branch"><li><p><br></p></li></ol></li><li>Keep</li></ul>';

for (const value of ['<u>X</u>', '<p><u>X</u></p>']) test(`collapsed inline/single-paragraph payload keeps its previous composition: ${value}`, async ({ page }) => {
  const before = await initialize(page, '<ul><li><p title="Body">AB</p><h2>After</h2></li></ul>');
  await caret(page, '[title="Body"]', 1);
  await page.evaluate((value) => window.editor.insertHTML(value), value);
  expect(await html(page)).toBe('<ul><li><p title="Body">A<u>X</u>B</p><h2>After</h2></li></ul>');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => document.getSelection()!.anchorOffset)).toBe(1);
});

for (const clipboard of [false, true]) test(`collapsed list ${clipboard ? 'clipboard' : 'API'} block insertion keeps actual neighboring bodies and branch`, async ({ page }) => {
  const before = await initialize(page, source);
  const nodes = await Promise.all(['Owner', 'Before', 'Body', 'After', 'Branch'].map((title) => page.locator(`.mw-content [title="${title}"]`).elementHandle()));
  const placeholder = await page.locator('.mw-content [title="Branch"] br').elementHandle();
  await caret(page, '[title="Body"]', 6);
  if (clipboard) expect(await paste(page, payload)).toBe(true);
  else await page.evaluate((value) => window.editor.insertHTML(value), payload);
  expect(await html(page)).toBe(inserted);
  for (const node of [...nodes, placeholder]) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
  await expect(page.locator('.mw-content > ul > li')).toHaveCount(2);
  await expect(page.locator('.mw-content p p, .mw-content p h3, .mw-content h2 h3, .mw-content p ol')).toHaveCount(0);
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
  await page.keyboard.insertText('X');
  await expect(page.locator('.mw-content [title="Last"]')).toHaveText('LastXBeta');
  await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ node: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Body"]')!.firstChild, offset: document.getSelection()!.anchorOffset, collapsed: document.getSelection()!.isCollapsed, undo: window.editor.canUndo() }))).toEqual({ node: true, offset: 6, collapsed: true, undo: false });
  await page.evaluate(() => window.editor.redo());
  expect(await html(page)).toBe(inserted);
});

for (const offset of [0, 1, 3]) test(`direct inline item insertion at text offset ${offset} promotes only its own body`, async ({ page }) => {
  const before = await initialize(page, '<ol><li title="Owner">ABC<ul title="Branch"><li>Branch</li></ul></li><li>Keep</li></ol>');
  await caret(page, '[title="Owner"]', offset);
  await page.evaluate(() => window.editor.insertHTML('<p>X</p><h3 title="Last">Y</h3>'));
  expect(await html(page)).toBe(`<ol><li title="Owner"><p>${'ABC'.slice(0, offset)}X</p><h3 title="Last">Y${'ABC'.slice(offset)}</h3><ul title="Branch"><li>Branch</li></ul></li><li>Keep</li></ol>`);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => document.getSelection()!.anchorOffset)).toBe(offset);
});

for (const offset of [0, 1, 2]) test(`collapsed LI boundary ${offset} resolves a single following-body start or the final body end`, async ({ page }) => {
  const before = await initialize(page, '<ul><li title="Owner"><p>AB</p><h2>CD</h2><ol><li>Branch</li></ol></li></ul>');
  await caret(page, '[title="Owner"]', offset, true);
  await page.evaluate(() => window.editor.insertHTML('<p>X</p><h3>Y</h3>'));
  const body = offset === 0 ? '<p>X</p><h3>YAB</h3><h2>CD</h2>' : offset === 1 ? '<p>AB</p><h2>X</h2><h3>YCD</h3>' : '<p>AB</p><h2>CDX</h2><h3>Y</h3>';
  expect(await html(page)).toBe(`<ul><li title="Owner">${body}<ol><li>Branch</li></ol></li></ul>`);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ item: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Owner"]'), offset: document.getSelection()!.anchorOffset }))).toEqual({ item: true, offset });
});

for (const offset of [0, 1]) test(`an empty source placeholder at body offset ${offset} does not become an extra line`, async ({ page }) => {
  const before = await initialize(page, '<ul><li><p title="Body"><br></p><h2>After</h2></li></ul>');
  await caret(page, '[title="Body"]', offset, true);
  await page.evaluate(() => window.editor.insertHTML('<p><br></p><h3 title="Last"><br></h3>'));
  expect(await html(page)).toBe('<ul><li><p title="Body"><br></p><h3 title="Last"><br></h3><h2>After</h2></li></ul>');
  expect(await page.evaluate(() => ({ node: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Last"]'), offset: document.getSelection()!.anchorOffset }))).toEqual({ node: true, offset: 0 });
  await page.keyboard.insertText('X');
  await expect(page.locator('.mw-content [title="Last"]')).toHaveText('X');
  await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => document.getSelection()!.anchorOffset)).toBe(offset);
});

test('collapsed rich Unicode input keeps starting affinity and the exact undo point', async ({ page }) => {
  const before = await initialize(page, '<ul><li><h2 title="Body">Alpha <strong>A😀B</strong> tail</h2><p>After</p></li></ul>');
  await caret(page, 'strong', 3);
  await page.evaluate(() => window.editor.insertHTML('<p><u>X</u></p><h3 title="Last">Y</h3>'));
  await expect(page.locator('.mw-content [title="Body"]')).toHaveJSProperty('innerHTML', 'Alpha <strong>A😀<u>X</u></strong>');
  await expect(page.locator('.mw-content [title="Last"]')).toHaveJSProperty('innerHTML', 'Y<strong>B</strong> tail');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ strong: document.getSelection()!.anchorNode === window.editor.surface.querySelector('strong')!.firstChild, offset: document.getSelection()!.anchorOffset }))).toEqual({ strong: true, offset: 3 });
});

test('incoming links leave the starting anchor and unsafe payload attributes are stripped', async ({ page }) => {
  await initialize(page, '<ul><li><p title="Body"><a href="https://old.example">AB</a></p></li></ul>');
  await caret(page, 'a', 1);
  await page.evaluate(() => window.editor.insertHTML('<p><a href="https://new.example" onclick="alert(1)">X</a><img src="/logo.svg" alt="I" onerror="alert(1)"></p><h3 title="Last" style="position:fixed;text-align:right">Y<script>alert(1)</script></h3>'));
  await expect(page.locator('.mw-content a a, .mw-content script, .mw-content [onclick], .mw-content [onerror]')).toHaveCount(0);
  await expect(page.locator('.mw-content [title="Body"] > a')).toHaveText(['A', 'X']);
  await expect(page.locator('.mw-content [title="Body"] > img')).toHaveAttribute('src', '/logo.svg');
  await expect(page.locator('.mw-content [title="Last"]')).toHaveText('YB');
  await expect(page.locator('.mw-content [title="Last"]')).toHaveAttribute('style', 'text-align: right');
});

test('a valid zero-text insertion clears pending caret formatting at the same text index and undo restores it', async ({ page }) => {
  const before = await initialize(page, '<ul><li><p title="Body">AB</p></li></ul>');
  await caret(page, '[title="Body"]', 0);
  await page.evaluate(() => {
    window.editor.format('bold', true);
    window.editor.insertHTML('<p><br></p><h3 title="Last"><br></h3>');
  });
  expect(await html(page)).toBe('<ul><li><p title="Body"><br></p><h3 title="Last">AB</h3></li></ul>');
  expect(await page.evaluate(() => ({ index: window.editor.getSelection()!.index, bold: Boolean(window.editor.getFormats().bold), changes: window.changes.length }))).toEqual({ index: 0, bold: false, changes: 1 });
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ node: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Body"]')!.firstChild, offset: document.getSelection()!.anchorOffset, bold: Boolean(window.editor.getFormats().bold), undo: window.editor.canUndo() }))).toEqual({ node: true, offset: 0, bold: true, undo: false });
  await page.evaluate(() => window.editor.redo());
  expect(await page.evaluate(() => Boolean(window.editor.getFormats().bold))).toBe(false);
});

const semantic: SchemaNodeSpec = { name: 'test:body', kind: 'block', tag: 'p', attributes: { 'data-id': { type: 'text', required: true } } };
for (const invalid of ['<p>A</p><p data-mw-node="test:body" data-id="owned">Semantic</p>', 'loose<p>B</p>', '<p>A</p><ul><li>B</li></ul>']) test(`collapsed invalid multi-root candidate rejects atomically: ${invalid}`, async ({ page }) => {
  const before = await initialize(page, '<ul><li><p title="Body">AB</p><h2>After</h2></li></ul>', [semantic]);
  await caret(page, '[title="Body"]', 0);
  const result = await page.evaluate((invalid) => {
    const editor = window.editor;
    editor.format('bold', true);
    const original = editor.surface.querySelector('[title="Body"]');
    const point = document.getSelection()!.anchorNode;
    const observer = new MutationObserver(() => {});
    observer.observe(editor.surface, { subtree: true, childList: true, attributes: true });
    let rejected = false;
    try { editor.insertHTML(invalid); } catch { rejected = true; }
    const mutations = observer.takeRecords().length;
    observer.disconnect();
    return { rejected, mutations, body: original === editor.surface.querySelector('[title="Body"]'), point: point === document.getSelection()!.anchorNode, offset: document.getSelection()!.anchorOffset, bold: Boolean(editor.getFormats().bold), undo: editor.canUndo(), changes: window.changes.length };
  }, invalid);
  expect(result).toEqual({ rejected: true, mutations: 0, body: true, point: true, offset: 0, bold: true, undo: false, changes: 0 });
  expect(await paste(page, invalid)).toBe(true);
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => Boolean(window.editor.getFormats().bold))).toBe(true);
});

for (const shape of ['image', 'interleaved', 'branch-offset']) test(`collapsed source ${shape} is a barrier before a list block insertion`, async ({ page }) => {
  const source = shape === 'image' ? '<ul><li><p title="Body">AB<img src="/logo.svg" alt="I"></p></li></ul>' : shape === 'interleaved' ? '<ul><li><p title="Body">AB</p><ol><li>Branch</li></ol><h2>After</h2></li></ul>' : '<ul><li title="Owner"><p title="Body">AB</p><ol><li>Branch</li></ol></li></ul>';
  const before = await initialize(page, source);
  await caret(page, shape === 'branch-offset' ? '[title="Owner"]' : '[title="Body"]', shape === 'branch-offset' ? 2 : 0, shape === 'branch-offset');
  expect(await page.evaluate(() => {
    try { window.editor.insertHTML('<p>X</p><h3>Y</h3>'); return false; } catch { return true; }
  })).toBe(true);
  expect(await paste(page, '<p>X</p><h3>Y</h3>')).toBe(true);
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo(), offset: document.getSelection()!.anchorOffset }))).toEqual({ changes: 0, undo: false, offset: shape === 'branch-offset' ? 2 : 0 });
});

test('caret block paste in a nested list within a merged cell preserves ancestor and cell geometry', async ({ page }) => {
  const before = await initialize(page, `<table><tbody><tr><td rowspan="2" colspan="2"><ul><li title="Outer">Outer${source}</li></ul></td><td><p>A</p></td></tr><tr><td><p>B</p></td></tr></tbody></table>`);
  const cell = await page.locator('.mw-content td').first().elementHandle();
  const outer = await page.locator('.mw-content [title="Outer"]').elementHandle();
  await caret(page, '[title="Body"]', 6);
  await paste(page, payload);
  await expect(page.locator('.mw-content td').first()).toHaveJSProperty('innerHTML', `<ul><li title="Outer">Outer${inserted}</li></ul>`);
  await expect(page.locator('.mw-content td').first()).toHaveAttribute('rowspan', '2');
  await expect(page.locator('.mw-content td').first()).toHaveAttribute('colspan', '2');
  for (const node of [cell, outer]) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
  await expect(page.locator('.mw-content td').nth(1)).toHaveText('A');
  await expect(page.locator('.mw-content td').nth(2)).toHaveText('B');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

for (const guard of ['readonly', 'composition', 'canceled', 'stripped']) test(`${guard} prevents a clipboard caret block edit`, async ({ page }) => {
  const before = await initialize(page, '<ul><li><p title="Body">AB</p></li></ul>');
  await caret(page, '[title="Body"]', 1);
  const result = await page.evaluate((guard) => {
    const editor = window.editor;
    const root = editor.surface;
    if (guard === 'readonly') editor.setReadOnly(true);
    if (guard === 'composition') root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const data = new DataTransfer();
    data.setData('text/html', guard === 'stripped' ? '<script>bad()</script>' : '<p>X</p><h3>Y</h3>');
    data.setData('text/plain', 'Wrong fallback');
    const event = new ClipboardEvent('paste', { cancelable: true, bubbles: true });
    Object.defineProperty(event, 'clipboardData', { value: data });
    if (guard === 'canceled') event.preventDefault();
    root.dispatchEvent(event);
    return { changes: window.changes.length, undo: editor.canUndo(), offset: document.getSelection()!.anchorOffset };
  }, guard);
  expect(await html(page)).toBe(before);
  expect(result).toEqual({ changes: 0, undo: false, offset: 1 });
});

test('caught invalid nested caret block import poisons the preceding outer edit', async ({ page }) => {
  const before = await initialize(page, '<ul><li><p title="Body">AB</p><h2>After</h2></li></ul>', [semantic]);
  await caret(page, '[title="Body"]', 1);
  expect(await page.evaluate(() => {
    try {
      window.editor.transact((root) => {
        root.querySelector('h2')!.append(document.createTextNode('!'));
        try { window.editor.insertHTML('<p>A</p><p data-mw-node="test:body">Missing id</p>'); } catch { /* Outer edit must still roll back. */ }
      });
      return false;
    } catch { return true; }
  })).toBe(true);
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ undo: window.editor.canUndo(), changes: window.changes.length, body: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Body"]')!.firstChild, offset: document.getSelection()!.anchorOffset }))).toEqual({ undo: false, changes: 0, body: true, offset: 1 });
});
