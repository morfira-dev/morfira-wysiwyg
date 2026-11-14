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
const source = '<ul><li title="Owner"><p title="Before">Before</p><blockquote title="Quote" style="text-align: right"><p title="Quoted before">Keep before</p><h2 title="Start" style="text-align: center">Alpha <strong>one</strong></h2><p>Covered</p><h3 title="End"><em>Beta</em> tail</h3><p title="Quoted after">Keep after</p></blockquote><p title="After">After</p><ol title="Branch"><li>Branch</li></ol></li><li>Keep</li></ul>';
const payload = '<p><u>First</u></p>\n<h4 title="Middle">Middle</h4>\n<p title="Last">Last</p>';
const result = '<ul><li title="Owner"><p title="Before">Before</p><blockquote title="Quote" style="text-align: right"><p title="Quoted before">Keep before</p><h2 title="Start" style="text-align: center">Alpha <u>First</u></h2><h4 title="Middle">Middle</h4><p title="Last">Last<em>ta</em> tail</p><p title="Quoted after">Keep after</p></blockquote><p title="After">After</p><ol title="Branch"><li>Branch</li></ol></li><li>Keep</li></ul>';

for (const backward of [false, true]) {
  for (const clipboard of [false, true]) test(`inside-quote ${clipboard ? 'clipboard' : 'API'} block replacement preserves its actual container and ${backward ? 'backward' : 'forward'} history`, async ({ page }) => {
    const before = await initialize(page, source);
    const nodes = await Promise.all(['Owner', 'Quote', 'Before', 'After', 'Quoted before', 'Quoted after', 'Branch'].map((title) => page.locator(`.mw-content [title="${title}"]`).elementHandle()));
    await page.evaluate((backward) => {
      const root = window.editor.surface;
      const start = root.querySelector('[title="Start"]')!.firstChild!;
      const end = root.querySelector('[title="End"] em')!.firstChild!;
      root.focus();
      document.getSelection()!.setBaseAndExtent(backward ? end : start, backward ? 2 : 6, backward ? start : end, backward ? 6 : 2);
    }, backward);
    if (clipboard) expect(await paste(page, payload)).toBe(true);
    else await page.evaluate((value) => window.editor.insertHTML(value), payload);
    expect(await html(page)).toBe(result);
    for (const node of nodes) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
    expect(await page.evaluate(() => ({ quoteCount: window.editor.surface.querySelectorAll('blockquote').length, changes: window.changes.length, parent: window.editor.surface.querySelector('[title="Last"]')!.parentElement?.getAttribute('title') }))).toEqual({ quoteCount: 1, changes: 1, parent: 'Quote' });
    await page.keyboard.insertText('X');
    await expect(page.locator('.mw-content [title="Last"]')).toHaveText('LastXta tail');
    await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
    expect(await html(page)).toBe(before);
    expect(await page.evaluate(() => {
      const selection = document.getSelection()!;
      return { anchor: selection.anchorNode?.textContent, anchorOffset: selection.anchorOffset, focus: selection.focusNode?.textContent, focusOffset: selection.focusOffset, undo: window.editor.canUndo() };
    })).toEqual(backward ? { anchor: 'Beta', anchorOffset: 2, focus: 'Alpha ', focusOffset: 6, undo: false } : { anchor: 'Alpha ', anchorOffset: 6, focus: 'Beta', focusOffset: 2, undo: false });
    await page.evaluate(() => window.editor.redo());
    expect(await html(page)).toBe(result);
  });
}

test('a heading at a caret stays inside its actual quote between source prefix and suffix bodies', async ({ page }) => {
  const before = await initialize(page, '<ul><li><p>Outside before</p><blockquote title="Quote"><h2 title="Body" style="text-align: center">Alpha Beta</h2><p title="Keep">Keep</p></blockquote><p>Outside after</p><ol><li>Branch</li></ol></li></ul>');
  const quote = await page.locator('.mw-content [title="Quote"]').elementHandle();
  const keep = await page.locator('.mw-content [title="Keep"]').elementHandle();
  await caret(page, '[title="Body"]', 6);
  await page.evaluate(() => window.editor.insertHTML('<h3 title="Incoming" style="text-align: right"><em>Title</em></h3>'));
  expect(await html(page)).toBe('<ul><li><p>Outside before</p><blockquote title="Quote"><h2 title="Body" style="text-align: center">Alpha </h2><h3 title="Incoming" style="text-align: right"><em>Title</em></h3><h2 title="Body" style="text-align: center">Beta</h2><p title="Keep">Keep</p></blockquote><p>Outside after</p><ol><li>Branch</li></ol></li></ul>');
  for (const node of [quote, keep]) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
  expect(await page.evaluate(() => ({ suffix: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Incoming"]')!.nextElementSibling, offset: document.getSelection()!.anchorOffset }))).toEqual({ suffix: true, offset: 0 });
  await page.keyboard.insertText('X');
  await expect(page.locator('.mw-content [title="Incoming"] + h2')).toHaveText('XBeta');
  await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ node: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Body"]')!.firstChild, offset: document.getSelection()!.anchorOffset }))).toEqual({ node: true, offset: 6 });
});

test('block then heading insertion can continue inside the same quote with separate Undo steps', async ({ page }) => {
  const before = await initialize(page, '<ul><li><blockquote title="Quote"><p title="Body">AB</p></blockquote><p>Outside</p></li></ul>');
  const quote = await page.locator('.mw-content [title="Quote"]').elementHandle();
  await caret(page, '[title="Body"]', 1);
  await page.evaluate(() => window.editor.insertHTML('<p>X</p><h3 title="Last">Y</h3>'));
  const first = await html(page);
  await page.evaluate(() => window.editor.insertHTML('<h2 title="Incoming">H</h2>'));
  const final = '<ul><li><blockquote title="Quote"><p title="Body">AX</p><h3 title="Last">Y</h3><h2 title="Incoming">H</h2><h3 title="Last">B</h3></blockquote><p>Outside</p></li></ul>';
  expect(await html(page)).toBe(final);
  expect(await quote!.evaluate((node) => node.isConnected)).toBe(true);
  expect(await page.evaluate(() => window.changes.length)).toBe(2);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(first);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ node: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Body"]')!.firstChild, offset: document.getSelection()!.anchorOffset }))).toEqual({ node: true, offset: 1 });
  await page.evaluate(() => { window.editor.redo(); window.editor.redo(); });
  expect(await html(page)).toBe(final);
});

for (const offset of [0, 2, 5]) test(`inline quote block insertion at text offset ${offset} promotes only the quote's content`, async ({ page }) => {
  const before = await initialize(page, '<ol><li><p>Outside</p><blockquote title="Quote" style="text-align: right">ABCDE</blockquote><p>After</p></li></ol>');
  const quote = await page.locator('.mw-content [title="Quote"]').elementHandle();
  await caret(page, '[title="Quote"]', offset);
  await page.evaluate(() => window.editor.insertHTML('<p>X</p><h3 title="Last">Y</h3>'));
  expect(await html(page)).toBe(`<ol><li><p>Outside</p><blockquote title="Quote" style="text-align: right"><p>${'ABCDE'.slice(0, offset)}X</p><h3 title="Last">Y${'ABCDE'.slice(offset)}</h3></blockquote><p>After</p></li></ol>`);
  expect(await quote!.evaluate((node) => node.isConnected)).toBe(true);
  await expect(page.locator('.mw-content > ol > li')).toHaveCount(1);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => document.getSelection()!.anchorOffset)).toBe(offset);
});

for (const offset of [0, 2, 3, 5]) test(`quote childNodes offset ${offset} skips formatting gaps without losing its exact undo position`, async ({ page }) => {
  const before = await initialize(page, '<ul><li><blockquote title="Quote">\n<p>AB</p>\n<h2>CD</h2>\n</blockquote><p>Outside</p></li></ul>');
  await caret(page, '[title="Quote"]', offset, true);
  await page.evaluate(() => window.editor.insertHTML('<h3 title="Incoming">H</h3>'));
  const expected = offset === 0 ? ['', 'H', 'AB', 'CD'] : offset === 5 ? ['AB', 'CD', 'H', ''] : ['AB', '', 'H', 'CD'];
  await expect(page.locator('.mw-content [title="Quote"] > p, .mw-content [title="Quote"] > h2, .mw-content [title="Quote"] > h3')).toHaveText(expected);
  await expect(page.locator('.mw-content > ul > li > p')).toHaveText('Outside');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ node: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Quote"]'), offset: document.getSelection()!.anchorOffset }))).toEqual({ node: true, offset });
});

for (const offset of [0, 1]) test(`inside an empty inline quote at BR edge ${offset}, pending formatting clears and Undo restores the original point`, async ({ page }) => {
  const before = await initialize(page, '<ul><li><blockquote title="Quote"><br></blockquote></li></ul>');
  await caret(page, '[title="Quote"]', offset, true);
  await page.evaluate(() => { window.editor.format('bold', true); window.editor.insertHTML('<p><br></p><h3 title="Last"><br></h3>'); });
  expect(await html(page)).toBe('<ul><li><blockquote title="Quote"><p><br></p><h3 title="Last"><br></h3></blockquote></li></ul>');
  expect(await page.evaluate(() => ({ bold: Boolean(window.editor.getFormats().bold), index: window.editor.getSelection()!.index, node: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Last"]'), offset: document.getSelection()!.anchorOffset, changes: window.changes.length }))).toEqual({ bold: false, index: 0, node: true, offset: 0, changes: 1 });
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ bold: Boolean(window.editor.getFormats().bold), node: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Quote"]'), offset: document.getSelection()!.anchorOffset, undo: window.editor.canUndo() }))).toEqual({ bold: true, node: true, offset, undo: false });
  await page.evaluate(() => window.editor.redo());
  expect(await page.evaluate(() => Boolean(window.editor.getFormats().bold))).toBe(false);
});

test('same-body rich Unicode replacement preserves inline affinity and validates incoming links and images', async ({ page }) => {
  await initialize(page, '<ul><li><blockquote title="Quote"><p title="Body">Alpha <strong>A😀BC</strong> tail</p><h2>Keep</h2></blockquote></li></ul>');
  await page.evaluate(() => {
    const root = window.editor.surface;
    const point = root.querySelector('strong')!.firstChild!;
    root.focus();
    document.getSelection()!.setBaseAndExtent(point, 4, point, 3);
    window.editor.insertHTML('<p><u>X</u></p><h3 title="Last"><a href="https://example.com" onclick="alert(1)">Y</a><img src="/logo.svg" alt="I" onerror="alert(1)"></h3>');
  });
  await expect(page.locator('.mw-content [title="Body"]').first()).toHaveJSProperty('innerHTML', 'Alpha <strong>A😀<u>X</u></strong>');
  await expect(page.locator('.mw-content [title="Last"]')).toHaveText('YC tail');
  await expect(page.locator('.mw-content [onclick], .mw-content [onerror], .mw-content a a')).toHaveCount(0);
  await expect(page.locator('.mw-content [title="Last"] > img')).toHaveAttribute('src', '/logo.svg');
});

const semanticQuote: SchemaNodeSpec = { name: 'test:quote', kind: 'block', tag: 'blockquote', attributes: { 'data-id': { type: 'text', required: true } } };
const semanticParagraph: SchemaNodeSpec = { name: 'test:body', kind: 'block', tag: 'p', attributes: { 'data-id': { type: 'text', required: true } } };
test('inside-quote insertion keeps validated inline semantic metadata and avoids nesting incoming links', async ({ page }) => {
  const reference: SchemaNodeSpec = { name: 'test:reference', kind: 'inline', tag: 'span', attributes: { 'data-id': { type: 'text', required: true } } };
  const before = await initialize(page, '<ul><li><blockquote title="Quote"><p title="Body"><span data-mw-node="test:reference" data-id="kept">Keep</span><a href="https://old.example">AB</a></p></blockquote></li></ul>', [reference]);
  const kept = await page.locator('.mw-content [data-id="kept"]').elementHandle();
  await caret(page, 'a', 1);
  await page.evaluate(() => window.editor.insertHTML('<p><a href="https://new.example">X</a><span data-mw-node="test:reference" data-id="incoming">C</span></p><h3 title="Last">Y</h3>'));
  expect(await kept!.evaluate((node) => node.isConnected)).toBe(true);
  await expect(page.locator('.mw-content [data-id="incoming"]')).toHaveText('C');
  await expect(page.locator('.mw-content a a')).toHaveCount(0);
  await expect(page.locator('.mw-content [title="Body"] > a')).toHaveText(['A', 'X']);
  await expect(page.locator('.mw-content [title="Last"]')).toHaveText('YB');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

for (const payload of ['<blockquote>Nested</blockquote>', '<p>A</p><blockquote>B</blockquote>', '<p>A</p><p data-mw-node="test:body" data-id="owned">Semantic</p>', 'loose<h3>B</h3>']) test(`inside-quote invalid block payload rejects atomically: ${payload}`, async ({ page }) => {
  const before = await initialize(page, '<ul><li><blockquote title="Quote"><p title="Body">ABCDE</p><h2>Keep</h2></blockquote><p>Outside</p></li></ul>', [semanticQuote, semanticParagraph]);
  await caret(page, '[title="Body"]', 1);
  const state = await page.evaluate((payload) => {
    const editor = window.editor;
    editor.format('bold', true);
    const point = document.getSelection()!.anchorNode;
    const observer = new MutationObserver(() => {});
    observer.observe(editor.surface, { subtree: true, childList: true, attributes: true });
    let rejected = false;
    try { editor.insertHTML(payload); } catch { rejected = true; }
    const mutations = observer.takeRecords().length;
    observer.disconnect();
    return { rejected, mutations, point: point === document.getSelection()!.anchorNode, offset: document.getSelection()!.anchorOffset, bold: Boolean(editor.getFormats().bold), changes: window.changes.length, undo: editor.canUndo() };
  }, payload);
  expect(state).toEqual({ rejected: true, mutations: 0, point: true, offset: 1, bold: true, changes: 0, undo: false });
  expect(await paste(page, payload)).toBe(true);
  expect(await html(page)).toBe(before);
});

for (const kind of ['other-item', 'other-quote']) test(`an inside-quote range crossing to ${kind} remains an atomic barrier`, async ({ page }) => {
  const before = await initialize(page, '<ul><li><blockquote title="Quote"><p title="Body">Alpha</p></blockquote><blockquote title="Other"><h2>Beta</h2></blockquote></li><li><p title="Outside">Outside</p></li></ul>');
  await page.evaluate((kind) => {
    const root = window.editor.surface;
    root.focus();
    const start = root.querySelector('[title="Body"]')!.firstChild!;
    const end = root.querySelector(kind === 'other-item' ? '[title="Outside"]' : '[title="Other"] h2')!.firstChild!;
    document.getSelection()!.setBaseAndExtent(end, 2, start, 1);
  }, kind);
  expect(await page.evaluate(() => {
    try { window.editor.insertHTML('<p>X</p><h3>Y</h3>'); return false; } catch { return true; }
  })).toBe(true);
  await paste(page, '<h3>H</h3>');
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo(), anchor: document.getSelection()!.anchorOffset, focus: document.getSelection()!.focusOffset }))).toEqual({ changes: 0, undo: false, anchor: 2, focus: 1 });
});

test('a nested quote payload over a backward selection inside one quote rejects without cutting the selected text', async ({ page }) => {
  const before = await initialize(page, '<ul><li><blockquote title="Quote"><p title="Body">ABCDE</p></blockquote></li></ul>');
  await page.evaluate(() => {
    const root = window.editor.surface;
    const point = root.querySelector('[title="Body"]')!.firstChild!;
    root.focus();
    document.getSelection()!.setBaseAndExtent(point, 4, point, 1);
  });
  expect(await page.evaluate(() => {
    try { window.editor.insertHTML('<blockquote>Nested</blockquote>'); return false; } catch { return true; }
  })).toBe(true);
  await paste(page, '<blockquote>Nested</blockquote>');
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ anchor: document.getSelection()!.anchorOffset, focus: document.getSelection()!.focusOffset, changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ anchor: 4, focus: 1, changes: 0, undo: false });
});

for (const kind of ['quote', 'child', 'image', 'nested']) test(`inside-quote unsupported source ${kind} blocks before DOM mutation`, async ({ page }) => {
  const quoteAttrs = kind === 'quote' ? ' data-mw-node="test:quote" data-id="owned"' : '';
  const childAttrs = kind === 'child' ? ' data-mw-node="test:body" data-id="owned"' : '';
  const extra = kind === 'image' ? '<img src="/logo.svg" alt="Original">' : kind === 'nested' ? '<blockquote>Nested</blockquote>' : '';
  const before = await initialize(page, `<ul><li><blockquote title="Quote"${quoteAttrs}><p title="Body"${childAttrs}>AB${extra}</p></blockquote></li></ul>`, [semanticQuote, semanticParagraph]);
  await caret(page, '[title="Body"]', 1);
  expect(await page.evaluate(() => {
    try { window.editor.insertHTML('<p>X</p><h3>Y</h3>'); return false; } catch { return true; }
  })).toBe(true);
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ changes: 0, undo: false });
});

for (const guard of ['readonly', 'composition', 'canceled', 'stripped']) test(`${guard} prevents manual inside-quote block insertion`, async ({ page }) => {
  const before = await initialize(page, '<ul><li><blockquote title="Quote"><p title="Body">AB</p></blockquote></li></ul>');
  await caret(page, '[title="Body"]', 1);
  await page.evaluate((guard) => {
    const editor = window.editor;
    const root = editor.surface;
    if (guard === 'readonly') editor.setReadOnly(true);
    if (guard === 'composition') root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const data = new DataTransfer();
    data.setData('text/html', guard === 'stripped' ? '<script>alert(1)</script>' : '<p>X</p><h3>Y</h3>');
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: data });
    if (guard === 'canceled') event.preventDefault();
    root.dispatchEvent(event);
  }, guard);
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ changes: 0, undo: false });
});

test('inside-quote block insertion stays within a nested list in a merged cell', async ({ page }) => {
  const value = '<table><tbody><tr><td rowspan="2" colspan="2"><ul><li title="Outer">Outer<ol><li><blockquote title="Quote"><p title="Body">AB</p><h2>Keep</h2></blockquote><p>Outside</p></li></ol></li></ul></td><td><p>A</p></td></tr><tr><td><p>B</p></td></tr></tbody></table>';
  const before = await initialize(page, value);
  const nodes = await Promise.all(['.mw-content td', '.mw-content [title="Outer"]', '.mw-content [title="Quote"]'].map((selector) => page.locator(selector).first().elementHandle()));
  await caret(page, '[title="Body"]', 1);
  await paste(page, '<h3 title="Incoming">H</h3>');
  await expect(page.locator('.mw-content [title="Quote"]')).toHaveJSProperty('innerHTML', '<p title="Body">A</p><h3 title="Incoming">H</h3><p title="Body">B</p><h2>Keep</h2>');
  for (const node of nodes) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
  await expect(page.locator('.mw-content td').first()).toHaveAttribute('rowspan', '2');
  await expect(page.locator('.mw-content td').first()).toHaveAttribute('colspan', '2');
  await expect(page.locator('.mw-content td').nth(1)).toHaveText('A');
  await expect(page.locator('.mw-content td').nth(2)).toHaveText('B');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

test('a caught invalid inside-quote import poisons an earlier outer mutation', async ({ page }) => {
  const before = await initialize(page, '<ul><li><blockquote title="Quote"><p title="Body">AB</p></blockquote><p title="Outside">Keep</p></li></ul>');
  await caret(page, '[title="Body"]', 1);
  expect(await page.evaluate(() => {
    try {
      window.editor.transact((root) => {
        root.querySelector('[title="Outside"]')!.append(document.createTextNode('!'));
        try { window.editor.insertHTML('<blockquote>Nested</blockquote>'); } catch { /* Preserve outer rollback semantics. */ }
      });
      return false;
    } catch { return true; }
  })).toBe(true);
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo(), offset: document.getSelection()!.anchorOffset }))).toEqual({ changes: 0, undo: false, offset: 1 });
});
