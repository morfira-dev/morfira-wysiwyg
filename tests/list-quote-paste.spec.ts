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
  const node = element ? target : target.firstChild!;
  root.focus();
  document.getSelection()!.setBaseAndExtent(node, offset, node, offset);
}, { selector, offset, element });
const paste = (page: Page, payload: string) => page.evaluate((payload) => {
  const data = new DataTransfer();
  data.setData('text/html', payload);
  data.setData('text/plain', 'Wrong fallback');
  const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: data });
  window.editor.surface.dispatchEvent(event);
  return event.defaultPrevented;
}, payload);

for (const clipboard of [false, true]) test(`ordinary quote ${clipboard ? 'clipboard' : 'API'} insertion splits one body and retains actual neighbors`, async ({ page }) => {
  const before = await initialize(page, '<ul><li title="Owner"><p title="Before">Before</p><h3 title="Body" style="text-align: center">Alpha</h3><p title="After">After</p><ol title="Branch"><li><p><br></p></li></ol></li><li>Keep</li></ul>');
  const handles = await Promise.all(['Owner', 'Before', 'Body', 'After', 'Branch'].map((title) => page.locator(`.mw-content [title="${title}"]`).elementHandle()));
  const placeholder = await page.locator('.mw-content [title="Branch"] br').elementHandle();
  await caret(page, '[title="Body"]', 2);
  const payload = '\n<blockquote title="Quote" style="text-align: right">Quote <strong>rich</strong></blockquote>\n';
  if (clipboard) expect(await paste(page, payload)).toBe(true);
  else await page.evaluate((payload) => window.editor.insertHTML(payload), payload);
  const inserted = '<ul><li title="Owner"><p title="Before">Before</p><h3 title="Body" style="text-align: center">Al</h3><blockquote title="Quote" style="text-align: right">Quote <strong>rich</strong></blockquote><h3 title="Body" style="text-align: center">pha</h3><p title="After">After</p><ol title="Branch"><li><p><br></p></li></ol></li><li>Keep</li></ul>';
  expect(await html(page)).toBe(inserted);
  for (const handle of [...handles, placeholder]) expect(await handle!.evaluate((node) => node.isConnected)).toBe(true);
  expect(await page.evaluate(() => ({ suffix: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Quote"]')!.nextElementSibling, offset: document.getSelection()!.anchorOffset, changes: window.changes.length }))).toEqual({ suffix: true, offset: 0, changes: 1 });
  await page.keyboard.insertText('X');
  await expect(page.locator('.mw-content [title="Quote"] + h3')).toHaveText('Xpha');
  await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ node: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Body"]')!.firstChild, offset: document.getSelection()!.anchorOffset, undo: window.editor.canUndo() }))).toEqual({ node: true, offset: 2, undo: false });
  await page.evaluate(() => window.editor.redo());
  expect(await html(page)).toBe(inserted);
});

for (const backward of [false, true]) test(`quote replaces selected sibling items with ${backward ? 'backward' : 'forward'} exact history`, async ({ page }) => {
  const before = await initialize(page, '<ol><li title="Owner"><p>Before</p><p title="Start">Alpha <strong>one</strong></p><h4>Covered</h4></li><li><h3 title="End" style="text-align: right"><em>Beta</em> tail</h3><p title="After">After</p><ul title="Branch"><li>Branch</li></ul></li><li>Keep</li></ol>');
  const after = await page.locator('.mw-content [title="After"]').elementHandle();
  const branch = await page.locator('.mw-content [title="Branch"]').elementHandle();
  await page.evaluate((backward) => {
    const root = window.editor.surface;
    const start = root.querySelector('[title="Start"]')!.firstChild!;
    const end = root.querySelector('em')!.firstChild!;
    root.focus();
    document.getSelection()!.setBaseAndExtent(backward ? end : start, backward ? 2 : 6, backward ? start : end, backward ? 6 : 2);
  }, backward);
  expect(await paste(page, '<blockquote title="Quote"><p>First</p>\n<h2 title="Quoted heading">Second</h2></blockquote>')).toBe(true);
  const inserted = '<ol><li title="Owner"><p>Before</p><p title="Start">Alpha </p><blockquote title="Quote"><p>First</p><h2 title="Quoted heading">Second</h2></blockquote><h3 title="End" style="text-align: right"><em>ta</em> tail</h3><p title="After">After</p><ul title="Branch"><li>Branch</li></ul></li><li>Keep</li></ol>';
  expect(await html(page)).toBe(inserted);
  for (const handle of [after, branch]) expect(await handle!.evaluate((node) => node.isConnected && node.parentElement?.getAttribute('title') === 'Owner')).toBe(true);
  await expect(page.locator('.mw-content > ol > li')).toHaveCount(2);
  await expect(page.locator('.mw-content p blockquote, .mw-content blockquote ul')).toHaveCount(0);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => {
    const selection = document.getSelection()!;
    return { anchor: selection.anchorNode?.textContent, anchorOffset: selection.anchorOffset, focus: selection.focusNode?.textContent, focusOffset: selection.focusOffset };
  })).toEqual(backward ? { anchor: 'Beta', anchorOffset: 2, focus: 'Alpha ', focusOffset: 6 } : { anchor: 'Alpha ', anchorOffset: 6, focus: 'Beta', focusOffset: 2 });
  await page.evaluate(() => window.editor.redo());
  expect(await html(page)).toBe(inserted);
});

for (const direct of [false, true]) test(`quote over same-body selection ${direct ? 'promotes a direct item' : 'clones the paragraph attributes for its suffix'}`, async ({ page }) => {
  const body = direct ? 'ABCDE' : '<p title="Body" style="text-align: right">ABCDE</p>';
  const before = await initialize(page, `<ul><li title="Owner">${body}<ol><li>Branch</li></ol></li></ul>`);
  await page.evaluate((direct) => {
    const root = window.editor.surface;
    const point = root.querySelector(direct ? '[title="Owner"]' : '[title="Body"]')!.firstChild!;
    root.focus();
    document.getSelection()!.setBaseAndExtent(point, 4, point, 1);
    window.editor.insertHTML('<blockquote title="Quote">Quote</blockquote>');
  }, direct);
  const attrs = direct ? '' : ' title="Body" style="text-align: right"';
  expect(await html(page)).toBe(`<ul><li title="Owner"><p${attrs}>A</p><blockquote title="Quote">Quote</blockquote><p${attrs}>E</p><ol><li>Branch</li></ol></li></ul>`);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ anchor: document.getSelection()!.anchorOffset, focus: document.getSelection()!.focusOffset }))).toEqual({ anchor: 4, focus: 1 });
});

test('quote insertion over bodies of one item keeps unselected bodies and its trailing branch', async ({ page }) => {
  const before = await initialize(page, '<ul><li><p title="Before">Before</p><h2 title="Start">Alpha</h2><p>Covered</p><h3 title="End">Beta</h3><p title="After">After</p><ol title="Branch"><li>Branch</li></ol></li></ul>');
  const branch = await page.locator('.mw-content [title="Branch"]').elementHandle();
  await page.evaluate(() => {
    const root = window.editor.surface;
    root.focus();
    document.getSelection()!.setBaseAndExtent(root.querySelector('[title="End"]')!.firstChild!, 2, root.querySelector('[title="Start"]')!.firstChild!, 2);
    window.editor.insertHTML('<blockquote title="Quote"><p>Quote</p></blockquote>');
  });
  expect(await html(page)).toBe('<ul><li><p title="Before">Before</p><h2 title="Start">Al</h2><blockquote title="Quote"><p>Quote</p></blockquote><h3 title="End">ta</h3><p title="After">After</p><ol title="Branch"><li>Branch</li></ol></li></ul>');
  expect(await branch!.evaluate((node) => node.isConnected)).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

for (const offset of [0, 1, 2]) test(`quote at LI offset ${offset} uses a single normalized body edge`, async ({ page }) => {
  const before = await initialize(page, '<ul><li title="Owner"><p>AB</p><h3>CD</h3><ol><li>Branch</li></ol></li></ul>');
  await caret(page, '[title="Owner"]', offset, true);
  await page.evaluate(() => window.editor.insertHTML('<blockquote>Q</blockquote>'));
  const bodies = offset === 0 ? '<p><br></p><blockquote>Q</blockquote><p>AB</p><h3>CD</h3>' : offset === 1 ? '<p>AB</p><h3><br></h3><blockquote>Q</blockquote><h3>CD</h3>' : '<p>AB</p><h3>CD</h3><blockquote>Q</blockquote><h3><br></h3>';
  expect(await html(page)).toBe(`<ul><li title="Owner">${bodies}<ol><li>Branch</li></ol></li></ul>`);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ item: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Owner"]'), offset: document.getSelection()!.anchorOffset }))).toEqual({ item: true, offset });
});

for (const offset of [0, 1]) test(`empty quote and source placeholder at offset ${offset} preserve editable edges and pending formatting history`, async ({ page }) => {
  const before = await initialize(page, '<ul><li><p title="Body"><br></p></li></ul>');
  await caret(page, '[title="Body"]', offset, true);
  await page.evaluate(() => { window.editor.format('bold', true); window.editor.insertHTML('<blockquote title="Quote"></blockquote>'); });
  expect(await html(page)).toBe('<ul><li><p title="Body"><br></p><blockquote title="Quote"><br></blockquote><p title="Body"><br></p></li></ul>');
  expect(await page.evaluate(() => ({ suffix: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Quote"]')!.nextElementSibling, offset: document.getSelection()!.anchorOffset, bold: Boolean(window.editor.getFormats().bold), index: window.editor.getSelection()!.index }))).toEqual({ suffix: true, offset: 0, bold: false, index: 0 });
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ offset: document.getSelection()!.anchorOffset, bold: Boolean(window.editor.getFormats().bold) }))).toEqual({ offset, bold: true });
  await page.evaluate(() => window.editor.redo());
  expect(await page.evaluate(() => Boolean(window.editor.getFormats().bold))).toBe(false);
});

test('empty quoted paragraph and heading remain editable without adding loose quote children', async ({ page }) => {
  await initialize(page, '<ul><li><p title="Body">AB</p></li></ul>');
  await caret(page, '[title="Body"]', 1);
  await page.evaluate(() => window.editor.insertHTML('<blockquote title="Quote">\n<p></p>\n<h3></h3>\n</blockquote>'));
  await expect(page.locator('.mw-content [title="Quote"]')).toHaveJSProperty('innerHTML', '<p><br></p><h3><br></h3>');
  await expect(page.locator('.mw-content [title="Quote"] + p')).toHaveText('B');
});

test('quote insertion preserves rich Unicode context on each side without inheriting its marks', async ({ page }) => {
  const before = await initialize(page, '<ul><li><h3 title="Body">Alpha <strong>A😀B</strong> tail</h3></li></ul>');
  await caret(page, 'strong', 3);
  await page.evaluate(() => window.editor.insertHTML('<blockquote title="Quote"><em>Q</em></blockquote>'));
  await expect(page.locator('.mw-content [title="Body"]').first()).toHaveJSProperty('innerHTML', 'Alpha <strong>A😀</strong>');
  await expect(page.locator('.mw-content [title="Quote"] + h3')).toHaveJSProperty('innerHTML', '<strong>B</strong> tail');
  await expect(page.locator('.mw-content strong blockquote')).toHaveCount(0);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => document.getSelection()!.anchorOffset)).toBe(3);
});

const reference: SchemaNodeSpec = { name: 'test:reference', kind: 'inline', tag: 'span', attributes: { 'data-id': { type: 'text', required: true } } };
const semanticQuote: SchemaNodeSpec = { name: 'test:quote', kind: 'block', tag: 'blockquote', attributes: { 'data-id': { type: 'text', required: true } } };
const semanticParagraph: SchemaNodeSpec = { name: 'test:paragraph', kind: 'block', tag: 'p', attributes: { 'data-id': { type: 'text', required: true } } };
test('ordinary quote preserves semantic inline content and sanitized links and images', async ({ page }) => {
  await initialize(page, '<ul><li><p title="Body">AB</p></li></ul>', [reference]);
  await caret(page, '[title="Body"]', 1);
  await page.evaluate(() => window.editor.insertHTML('<blockquote title="Quote" style="position:fixed;text-align:right"><p><span data-mw-node="test:reference" data-id="kept">Ref</span><a href="https://example.com" onclick="alert(1)">Link</a><img src="/logo.svg" alt="I" onerror="alert(1)"><script>alert(1)</script></p></blockquote>'));
  await expect(page.locator('.mw-content [title="Quote"]')).toHaveAttribute('style', 'text-align: right');
  await expect(page.locator('.mw-content [data-mw-node="test:reference"]')).toHaveAttribute('data-id', 'kept');
  await expect(page.locator('.mw-content [title="Quote"] img')).toHaveAttribute('src', '/logo.svg');
  await expect(page.locator('.mw-content script, .mw-content [onclick], .mw-content [onerror]')).toHaveCount(0);
});

for (const collapsed of [false, true]) {
  for (const payload of [
    '<blockquote data-mw-node="test:quote" data-id="owned">Semantic</blockquote>',
    '<blockquote><p data-mw-node="test:paragraph" data-id="owned">Semantic body</p></blockquote>',
    '<blockquote>Loose<p>Mixed</p></blockquote>',
    '<blockquote><blockquote>Nested</blockquote></blockquote>',
    '<blockquote><ul><li>List</li></ul></blockquote>',
    '<blockquote><pre>Code</pre></blockquote>',
    '<blockquote><table><tbody><tr><td>Cell</td></tr></tbody></table></blockquote>',
    '<blockquote><figure><img src="/logo.svg" alt="Image"></figure></blockquote>',
  ]) test(`unsupported quote rejects atomically at ${collapsed ? 'caret' : 'same-body selection'}: ${payload}`, async ({ page }) => {
    const before = await initialize(page, '<ul><li><p title="Body">ABCDE</p><h3>After</h3></li></ul>', [semanticQuote, semanticParagraph]);
    await page.evaluate((collapsed) => {
      const root = window.editor.surface;
      const text = root.querySelector('[title="Body"]')!.firstChild!;
      root.focus();
      document.getSelection()!.setBaseAndExtent(text, collapsed ? 1 : 4, text, 1);
    }, collapsed);
    const result = await page.evaluate(({ collapsed, payload }) => {
      const editor = window.editor;
      if (collapsed) editor.format('bold', true);
      const point = document.getSelection()!.anchorNode;
      const body = editor.surface.querySelector('[title="Body"]');
      const observer = new MutationObserver(() => {});
      observer.observe(editor.surface, { childList: true, subtree: true, attributes: true });
      let rejected = false;
      try { editor.insertHTML(payload); } catch { rejected = true; }
      const mutations = observer.takeRecords().length;
      observer.disconnect();
      return { rejected, mutations, samePoint: point === document.getSelection()!.anchorNode, sameBody: body === editor.surface.querySelector('[title="Body"]'), offset: document.getSelection()!.anchorOffset, bold: Boolean(editor.getFormats().bold), changes: window.changes.length, undo: editor.canUndo() };
    }, { collapsed, payload });
    expect(result).toEqual({ rejected: true, mutations: 0, samePoint: true, sameBody: true, offset: collapsed ? 1 : 4, bold: collapsed, changes: 0, undo: false });
    expect(await paste(page, payload)).toBe(true);
    expect(await html(page)).toBe(before);
  });
}

test('nested quote insertion inside an existing quote stays blocked while ordinary suffix typing remains available', async ({ page }) => {
  const before = await initialize(page, '<ul><li><p title="Body">AB</p></li></ul>');
  await caret(page, '[title="Body"]', 1);
  await page.evaluate(() => window.editor.insertHTML('<blockquote title="Quote">Q</blockquote>'));
  const inserted = await html(page);
  expect(await page.evaluate(() => {
    const editor = window.editor;
    const point = editor.surface.querySelector('[title="Quote"]')!.firstChild!;
    document.getSelection()!.setBaseAndExtent(point, 0, point, 0);
    const observer = new MutationObserver(() => {});
    observer.observe(editor.surface, { subtree: true, childList: true, attributes: true });
    let rejected = false;
    try { editor.insertHTML('<blockquote>Again</blockquote>'); } catch { rejected = true; }
    const mutations = observer.takeRecords().length;
    observer.disconnect();
    return { rejected, mutations, atQuote: document.getSelection()!.anchorNode === point, changes: window.changes.length };
  })).toEqual({ rejected: true, mutations: 0, atQuote: true, changes: 1 });
  expect(await html(page)).toBe(inserted);
  await page.evaluate(() => {
    const suffix = window.editor.surface.querySelector('[title="Quote"]')!.nextElementSibling!;
    document.getSelection()!.setBaseAndExtent(suffix, 0, suffix, 0);
  });
  await page.keyboard.insertText('X');
  await expect(page.locator('.mw-content [title="Quote"] + p')).toHaveText('XB');
  await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
  expect(await html(page)).toBe(before);
});

for (const shape of ['image', 'interleaved', 'branch-offset']) test(`quote insertion refuses unsupported source ${shape} without history`, async ({ page }) => {
  const value = shape === 'image' ? '<ul><li title="Owner"><p title="Body">AB<img src="/logo.svg" alt="Original"></p></li></ul>'
    : shape === 'interleaved' ? '<ul><li title="Owner"><p title="Body">AB</p><ol><li>Branch</li></ol><h3>After</h3></li></ul>'
      : '<ul><li title="Owner"><p title="Body">AB</p><ol><li>Branch</li></ol></li></ul>';
  const before = await initialize(page, value);
  await caret(page, shape === 'branch-offset' ? '[title="Owner"]' : '[title="Body"]', shape === 'branch-offset' ? 2 : 1, shape === 'branch-offset');
  expect(await page.evaluate(() => {
    try { window.editor.insertHTML('<blockquote>Q</blockquote>'); return false; }
    catch { return true; }
  })).toBe(true);
  expect(await paste(page, '<blockquote>Q</blockquote>')).toBe(true);
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo(), offset: document.getSelection()!.anchorOffset }))).toEqual({ changes: 0, undo: false, offset: shape === 'branch-offset' ? 2 : 1 });
});

test('quote insertion in a nested list inside a merged cell preserves geometry and ancestors', async ({ page }) => {
  const before = await initialize(page, '<table><tbody><tr><td rowspan="2" colspan="2"><ul><li title="Outer">Outer<ol><li><p title="Body">AB</p><h3>After</h3><ul><li>Branch</li></ul></li></ol></li></ul></td><td><p>A</p></td></tr><tr><td><p>B</p></td></tr></tbody></table>');
  const cell = await page.locator('.mw-content td').first().elementHandle();
  const outer = await page.locator('.mw-content [title="Outer"]').elementHandle();
  await caret(page, '[title="Body"]', 1);
  await paste(page, '<blockquote title="Quote"><p>Q</p></blockquote>');
  await expect(page.locator('.mw-content [title="Quote"] + p')).toHaveText('B');
  await expect(page.locator('.mw-content td').first()).toHaveAttribute('rowspan', '2');
  await expect(page.locator('.mw-content td').first()).toHaveAttribute('colspan', '2');
  await expect(page.locator('.mw-content td').nth(1)).toHaveText('A');
  await expect(page.locator('.mw-content td').nth(2)).toHaveText('B');
  for (const node of [cell, outer]) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

for (const guard of ['readonly', 'composition', 'canceled', 'stripped']) test(`${guard} keeps quote paste content and history unchanged`, async ({ page }) => {
  const before = await initialize(page, '<ul><li><p title="Body">AB</p></li></ul>');
  await caret(page, '[title="Body"]', 1);
  await page.evaluate((guard) => {
    const root = window.editor.surface;
    if (guard === 'readonly') window.editor.setReadOnly(true);
    if (guard === 'composition') root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const data = new DataTransfer();
    data.setData('text/html', guard === 'stripped' ? '<script>alert(1)</script>' : '<blockquote>Q</blockquote>');
    data.setData('text/plain', 'Wrong fallback');
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: data });
    if (guard === 'canceled') event.preventDefault();
    root.dispatchEvent(event);
  }, guard);
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo(), offset: document.getSelection()!.anchorOffset }))).toEqual({ changes: 0, undo: false, offset: 1 });
});

test('caught semantic quote failure poisons the preceding outer transaction', async ({ page }) => {
  const before = await initialize(page, '<ul><li><p title="Body">AB</p></li></ul>', [semanticQuote]);
  await caret(page, '[title="Body"]', 1);
  expect(await page.evaluate(() => {
    try {
      window.editor.transact((root) => {
        root.lastElementChild!.append(document.createTextNode('!'));
        try { window.editor.insertHTML('<blockquote data-mw-node="test:quote" data-id="owned">Q</blockquote>'); }
        catch { /* Catching a failed import must not retain the outer mutation. */ }
      });
      return false;
    } catch { return true; }
  })).toBe(true);
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo(), offset: document.getSelection()!.anchorOffset }))).toEqual({ changes: 0, undo: false, offset: 1 });
});
