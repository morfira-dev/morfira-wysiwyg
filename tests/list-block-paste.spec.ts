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
const select = (page: Page, backward = false) => page.evaluate((backward) => {
  const root = window.editor.surface;
  const start = root.querySelector('[title="Start"]')!.firstChild!;
  const end = root.querySelector('[title="End"] em')!.firstChild!;
  root.focus();
  document.getSelection()!.setBaseAndExtent(backward ? end : start, backward ? 2 : 6, backward ? start : end, backward ? 6 : 2);
}, backward);
const paste = (page: Page, value: string) => page.evaluate((value) => {
  const data = new DataTransfer();
  data.setData('text/html', value);
  data.setData('text/plain', 'Wrong fallback');
  const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: data });
  window.editor.surface.dispatchEvent(event);
  return event.defaultPrevented;
}, value);
const payload = '<p style="text-align: right"><u>First</u></p>\n<h4 title="Middle">Middle</h4>\n<p title="Last" style="text-align: center">Last</p>';
const source = '<ul title="List"><li title="Owner"><p title="Before">Before</p><h2 title="Start" style="text-align: center">Alpha <strong>one</strong></h2><p>Covered</p><h3 title="End"><em>Beta</em> tail</h3><p title="After">After</p><ol title="Branch"><li><p><br></p></li></ol></li><li>Keep</li></ul>';
const replaced = '<ul title="List"><li title="Owner"><p title="Before">Before</p><h2 title="Start" style="text-align: center">Alpha <u>First</u></h2><h4 title="Middle">Middle</h4><p title="Last" style="text-align: center">Last<em>ta</em> tail</p><p title="After">After</p><ol title="Branch"><li><p><br></p></li></ol></li><li>Keep</li></ul>';

test('empty final payload with an empty source suffix places the typing caret before its placeholder', async ({ page }) => {
  const before = await initialize(page, '<ul><li><p title="Start">A</p></li><li><h2 title="End">B</h2></li></ul>');
  await page.evaluate(() => {
    const root = window.editor.surface;
    root.focus();
    document.getSelection()!.setBaseAndExtent(root.querySelector('[title="Start"]')!.firstChild!, 0, root.querySelector('[title="End"]')!.firstChild!, 1);
    window.editor.insertHTML('<p><br></p><h3 title="Last"><br></h3>');
  });
  expect(await html(page)).toBe('<ul><li><p title="Start"><br></p><h3 title="Last"><br></h3></li></ul>');
  expect(await page.evaluate(() => {
    const selection = document.getSelection()!;
    return { onLast: selection.anchorNode === window.editor.surface.querySelector('[title="Last"]'), offset: selection.anchorOffset, collapsed: selection.isCollapsed, changes: window.changes.length };
  })).toEqual({ onLast: true, offset: 0, collapsed: true, changes: 1 });
  await page.keyboard.type('X');
  await expect(page.locator('.mw-content [title="Last"]')).toHaveText('X');
  await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ anchor: document.getSelection()!.anchorNode?.textContent, anchorOffset: document.getSelection()!.anchorOffset, focus: document.getSelection()!.focusNode?.textContent, focusOffset: document.getSelection()!.focusOffset }))).toEqual({ anchor: 'A', anchorOffset: 0, focus: 'B', focusOffset: 1 });
});

for (const backward of [false, true]) {
  for (const clipboard of [false, true]) test(`multi-block ${clipboard ? 'clipboard' : 'API'} list paste keeps surrounding bodies and ${backward ? 'backward' : 'forward'} history`, async ({ page }) => {
    const before = await initialize(page, source);
    const nodes = await Promise.all(['Owner', 'Before', 'Start', 'After', 'Branch'].map((title) => page.locator(`.mw-content [title="${title}"]`).elementHandle()));
    const placeholder = await page.locator('.mw-content [title="Branch"] br').elementHandle();
    await select(page, backward);
    if (clipboard) expect(await paste(page, payload)).toBe(true);
    else await page.evaluate((value) => window.editor.insertHTML(value), payload);
    expect(await html(page)).toBe(replaced);
    for (const node of [...nodes, placeholder]) expect(await node!.evaluate((element) => element.isConnected)).toBe(true);
    expect(await page.evaluate(() => {
      const root = window.editor.surface;
      const range = document.getSelection()!.getRangeAt(0);
      const last = root.querySelector('[title="Last"]')!;
      const before = document.createRange();
      before.selectNodeContents(last);
      before.setEnd(range.startContainer, range.startOffset);
      return { prefix: before.toString(), collapsed: range.collapsed, changes: window.changes.length };
    })).toEqual({ prefix: 'Last', collapsed: true, changes: 1 });
    await page.keyboard.type('X');
    await expect(page.locator('.mw-content [title="Last"]')).toHaveText('LastXta tail');
    await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
    expect(await html(page)).toBe(before);
    expect(await page.evaluate(() => {
      const selection = document.getSelection()!;
      return { anchor: selection.anchorNode?.textContent, anchorOffset: selection.anchorOffset, focus: selection.focusNode?.textContent, focusOffset: selection.focusOffset, undo: window.editor.canUndo() };
    })).toEqual(backward ? { anchor: 'Beta', anchorOffset: 2, focus: 'Alpha ', focusOffset: 6, undo: false } : { anchor: 'Alpha ', anchorOffset: 6, focus: 'Beta', focusOffset: 2, undo: false });
    await page.evaluate(() => window.editor.redo());
    expect(await html(page)).toBe(replaced);
  });
}

for (const tag of ['ul', 'ol']) test(`multi-block paste across ${tag} items retains one item and promotes a direct inline prefix`, async ({ page }) => {
  const before = await initialize(page, `<${tag}><li title="Start">Alpha <strong>one</strong></li><li><p title="End"><em>Beta</em> tail</p><ul title="Branch"><li>Branch</li></ul></li><li>Keep</li></${tag}>`);
  const branch = await page.locator('.mw-content [title="Branch"]').elementHandle();
  await select(page, true);
  await page.evaluate(() => window.editor.insertHTML('<h2>First</h2><p>Last</p>'));
  expect(await html(page)).toBe(`<${tag}><li title="Start"><p>Alpha First</p><p>Last<em>ta</em> tail</p><ul title="Branch"><li>Branch</li></ul></li><li>Keep</li></${tag}>`);
  await expect(page.locator(`.mw-content > ${tag} > li`)).toHaveCount(2);
  expect(await branch!.evaluate((node) => node.isConnected)).toBe(true);
  await expect(page.locator('.mw-content p p, .mw-content p ul')).toHaveCount(0);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

for (const direct of [false, true]) test(`multi-block paste replaces a selection inside one ${direct ? 'direct item' : 'paragraph'} without nesting blocks`, async ({ page }) => {
  const body = direct ? 'ABCDE' : '<p title="Body" style="text-align: right">ABCDE</p>';
  const before = await initialize(page, `<ul><li title="Owner">${body}<ol title="Branch"><li>Branch</li></ol></li></ul>`);
  await page.evaluate((direct) => {
    const root = window.editor.surface;
    const body = root.querySelector(direct ? '[title="Owner"]' : '[title="Body"]')!;
    root.focus();
    document.getSelection()!.setBaseAndExtent(body.firstChild!, 4, body.firstChild!, 1);
    window.editor.insertHTML('<p>X</p><h3 title="Last">Y</h3>');
  }, direct);
  expect(await html(page)).toBe(`<ul><li title="Owner">${direct ? '<p>AX</p>' : '<p title="Body" style="text-align: right">AX</p>'}<h3 title="Last">YE</h3><ol title="Branch"><li>Branch</li></ol></li></ul>`);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ anchor: document.getSelection()!.anchorOffset, focus: document.getSelection()!.focusOffset }))).toEqual({ anchor: 4, focus: 1 });
});

test('empty first and final payload placeholders do not add lines to joined edges while a middle empty heading remains editable', async ({ page }) => {
  await initialize(page, source);
  await select(page);
  await page.evaluate(() => window.editor.insertHTML('<p><br></p><h4 title="Empty"><br></h4><p title="Last"><br></p>'));
  await expect(page.locator('.mw-content [title="Start"]')).toHaveJSProperty('innerHTML', 'Alpha ');
  await expect(page.locator('.mw-content [title="Empty"]')).toHaveJSProperty('innerHTML', '<br>');
  await expect(page.locator('.mw-content [title="Last"]')).toHaveJSProperty('innerHTML', '<em>ta</em> tail');
  await expect(page.locator('.mw-content [title="Branch"] p > br')).toHaveCount(1);
  await page.keyboard.type('X');
  await expect(page.locator('.mw-content [title="Last"]')).toHaveText('Xta tail');
});

test('first payload links leave an existing starting anchor and executable attributes are stripped before a list cut', async ({ page }) => {
  await initialize(page, '<ul><li><h2 title="Start"><a href="https://old.example">Alpha</a></h2></li><li><p title="End"><em>Beta</em> tail</p></li></ul>');
  await page.evaluate(() => {
    const root = window.editor.surface;
    root.focus();
    document.getSelection()!.setBaseAndExtent(root.querySelector('a')!.firstChild!, 2, root.querySelector('em')!.firstChild!, 2);
    window.editor.insertHTML('<p><a href="https://new.example" onclick="alert(1)">X</a><img src="/logo.svg" alt="Image" onerror="alert(1)"></p><h3 title="Last" style="position:fixed;text-align:right">Y<script>alert(1)</script></h3>');
  });
  await expect(page.locator('.mw-content a a, .mw-content script, .mw-content [onclick], .mw-content [onerror]')).toHaveCount(0);
  await expect(page.locator('.mw-content [title="Start"] > a')).toHaveText(['Al', 'X']);
  await expect(page.locator('.mw-content [title="Start"] > img')).toHaveAttribute('src', '/logo.svg');
  await expect(page.locator('.mw-content [title="Last"]')).toHaveAttribute('style', 'text-align: right');
  await expect(page.locator('.mw-content [title="Last"]')).toHaveText('Yta tail');
});

test('list multi-block paste inside a nested list in a merged cell preserves outer ancestors and geometry', async ({ page }) => {
  const nested = `<ul><li title="Outer">Outer${source}</li></ul>`;
  const before = await initialize(page, `<table><tbody><tr><td rowspan="2" colspan="2">${nested}</td><td><p>A</p></td></tr><tr><td><p>B</p></td></tr></tbody></table>`);
  const cell = await page.locator('.mw-content td').first().elementHandle();
  const outer = await page.locator('.mw-content [title="Outer"]').elementHandle();
  await select(page, true);
  await paste(page, payload);
  await expect(page.locator('.mw-content td').first()).toHaveJSProperty('innerHTML', `<ul><li title="Outer">Outer${replaced}</li></ul>`);
  await expect(page.locator('.mw-content td').first()).toHaveAttribute('rowspan', '2');
  await expect(page.locator('.mw-content td').first()).toHaveAttribute('colspan', '2');
  for (const node of [cell, outer]) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
  await expect(page.locator('.mw-content td').nth(1)).toHaveText('A');
  await expect(page.locator('.mw-content td').nth(2)).toHaveText('B');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

const semantic: SchemaNodeSpec = { name: 'test:body', kind: 'block', tag: 'p', attributes: { 'data-id': { type: 'text', required: true } } };
for (const invalid of ['<p>A</p><p data-mw-node="test:body" data-id="owned">Semantic</p>', 'loose<p>B</p>', '<p>A</p><ul><li>B</li></ul>']) test(`same-body block candidate validates before falling back to generic insertion: ${invalid}`, async ({ page }) => {
  const before = await initialize(page, '<ul><li><p title="Body">ABCDE</p><h2>After</h2><ol><li>Branch</li></ol></li></ul>', [semantic]);
  await page.evaluate(() => {
    const root = window.editor.surface;
    const text = root.querySelector('[title="Body"]')!.firstChild!;
    root.focus();
    document.getSelection()!.setBaseAndExtent(text, 4, text, 1);
  });
  const result = await page.evaluate((invalid) => {
    const root = window.editor.surface;
    const original = root.querySelector('[title="Body"]');
    const selection = document.getSelection()!;
    const node = selection.anchorNode;
    const observer = new MutationObserver(() => {});
    observer.observe(root, { childList: true, subtree: true, attributes: true });
    let rejected = false;
    try { window.editor.insertHTML(invalid); }
    catch { rejected = true; }
    const mutations = observer.takeRecords().length;
    observer.disconnect();
    return { rejected, mutations, sameBody: original === root.querySelector('[title="Body"]'), samePoint: selection.anchorNode === node, anchor: selection.anchorOffset, focus: selection.focusOffset, changes: window.changes.length, undo: window.editor.canUndo() };
  }, invalid);
  expect(result).toEqual({ rejected: true, mutations: 0, sameBody: true, samePoint: true, anchor: 4, focus: 1, changes: 0, undo: false });
  expect(await paste(page, invalid)).toBe(true);
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => window.changes.length)).toBe(0);
});

test('source images remain a barrier for a same-body multi-block replacement even when the payload is supported', async ({ page }) => {
  const before = await initialize(page, '<ul><li><p title="Body">ABCDE<img src="/logo.svg" alt="Original"></p><h2>After</h2></li></ul>');
  await page.evaluate(() => {
    const root = window.editor.surface;
    const text = root.querySelector('[title="Body"]')!.firstChild!;
    root.focus();
    document.getSelection()!.setBaseAndExtent(text, 4, text, 1);
  });
  expect(await page.evaluate(() => {
    try { window.editor.insertHTML('<p>First</p><h3>Last</h3>'); return false; }
    catch { return true; }
  })).toBe(true);
  await paste(page, '<p>First</p><h3>Last</h3>');
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo(), anchor: document.getSelection()!.anchorOffset, focus: document.getSelection()!.focusOffset }))).toEqual({ changes: 0, undo: false, anchor: 4, focus: 1 });
});

for (const invalid of ['<p>A</p><ul><li>B</li></ul>', '<pre>Unsupported</pre>', '<p>A</p><p data-mw-node="test:body" data-id="owned">Semantic</p>', '<p>A</p>loose<h2>B</h2>']) test(`unsupported list payload rejects before mutation: ${invalid}`, async ({ page }) => {
  const before = await initialize(page, source, [semantic]);
  await select(page, true);
  const result = await page.evaluate((invalid) => {
    const root = window.editor.surface;
    const before = document.getSelection()!.anchorNode;
    const observer = new MutationObserver(() => {});
    observer.observe(root, { subtree: true, attributes: true, childList: true });
    let rejected = false;
    try { window.editor.insertHTML(invalid); }
    catch { rejected = true; }
    const mutations = observer.takeRecords().length;
    observer.disconnect();
    return { rejected, mutations, samePoint: document.getSelection()!.anchorNode === before, changes: window.changes.length, undo: window.editor.canUndo() };
  }, invalid);
  expect(result).toEqual({ rejected: true, mutations: 0, samePoint: true, changes: 0, undo: false });
  expect(await paste(page, invalid)).toBe(true);
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => window.changes.length)).toBe(0);
});

test('a caught invalid nested list block import rolls back an earlier outer mutation', async ({ page }) => {
  const before = await initialize(page, source, [semantic]);
  await select(page, true);
  expect(await page.evaluate(() => {
    try {
      window.editor.transact((root) => {
        root.lastElementChild!.append(document.createTextNode('!'));
        try { window.editor.insertHTML('<p>A</p><p data-mw-node="test:body">Missing id</p>'); }
        catch { /* The nested import failure must still poison the outer edit. */ }
      });
      return false;
    } catch { return true; }
  })).toBe(true);
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo(), anchor: document.getSelection()!.anchorNode?.textContent, offset: document.getSelection()!.anchorOffset }))).toEqual({ changes: 0, undo: false, anchor: 'Beta', offset: 2 });
});

for (const guard of ['readonly', 'composition', 'canceled']) test(`${guard} prevents list block paste through API and clipboard`, async ({ page }) => {
  const before = await initialize(page, source);
  await select(page, true);
  await page.evaluate(({ guard, payload }) => {
    const editor = window.editor;
    if (guard === 'readonly') editor.setReadOnly(true);
    if (guard === 'composition') editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    if (guard === 'canceled') editor.surface.addEventListener('paste', (event) => event.preventDefault(), { capture: true, once: true });
    else editor.insertHTML(payload);
  }, { guard, payload });
  expect(await paste(page, payload)).toBe(true);
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ changes: 0, undo: false });
});

test('fully stripped HTML preserves the list selection and never falls back to clipboard text', async ({ page }) => {
  const before = await initialize(page, source);
  await select(page, true);
  await paste(page, '<script>alert(1)</script>');
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ anchor: document.getSelection()!.anchorNode?.textContent, offset: document.getSelection()!.anchorOffset, changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ anchor: 'Beta', offset: 2, changes: 0, undo: false });
});
