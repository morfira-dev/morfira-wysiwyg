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
const paste = (page: Page, value: string) => page.evaluate((value) => {
  const data = new DataTransfer();
  data.setData('text/html', value);
  data.setData('text/plain', 'Wrong fallback');
  const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: data });
  window.editor.surface.dispatchEvent(event);
  return event.defaultPrevented;
}, value);

for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
  for (const clipboard of [false, true]) test(`single ${tag} ${clipboard ? 'clipboard' : 'API'} insertion at a list caret keeps its own wrapper and splits the original body`, async ({ page }) => {
    const before = await initialize(page, '<ul><li title="Owner"><p title="Body" style="text-align: center">Alpha</p><h3 title="After">After</h3><ol title="Branch"><li><p><br></p></li></ol></li><li>Keep</li></ul>');
    const prefix = await page.locator('.mw-content [title="Body"]').elementHandle();
    const after = await page.locator('.mw-content [title="After"]').elementHandle();
    const placeholder = await page.locator('.mw-content [title="Branch"] br').elementHandle();
    await caret(page, '[title="Body"]', 2);
    const payload = `\n<${tag} title="Incoming" style="text-align: right"><u>Title</u></${tag}>\n`;
    if (clipboard) expect(await paste(page, payload)).toBe(true);
    else await page.evaluate((value) => window.editor.insertHTML(value), payload);
    expect(await html(page)).toBe(`<ul><li title="Owner"><p title="Body" style="text-align: center">Al</p><${tag} title="Incoming" style="text-align: right"><u>Title</u></${tag}><p title="Body" style="text-align: center">pha</p><h3 title="After">After</h3><ol title="Branch"><li><p><br></p></li></ol></li><li>Keep</li></ul>`);
    for (const node of [prefix, after, placeholder]) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
    expect(await page.evaluate(() => {
      const heading = window.editor.surface.querySelector('[title="Incoming"]')!;
      const selection = document.getSelection()!;
      return { suffix: selection.anchorNode === heading.nextElementSibling, offset: selection.anchorOffset, collapsed: selection.isCollapsed, changes: window.changes.length };
    })).toEqual({ suffix: true, offset: 0, collapsed: true, changes: 1 });
    await page.keyboard.type('X');
    await expect(page.locator('.mw-content [title="Incoming"] + p')).toHaveText('Xpha');
    await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
    expect(await html(page)).toBe(before);
    expect(await page.evaluate(() => ({ body: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Body"]')!.firstChild, offset: document.getSelection()!.anchorOffset, undo: window.editor.canUndo() }))).toEqual({ body: true, offset: 2, undo: false });
    await page.evaluate(() => window.editor.redo());
    await expect(page.locator('.mw-content [title="Incoming"]')).toHaveText('Title');
  });
}

for (const backward of [false, true]) {
  for (const clipboard of [false, true]) test(`single heading replaces sibling items and restores ${backward ? 'backward' : 'forward'} exact history via ${clipboard ? 'clipboard' : 'API'}`, async ({ page }) => {
    const before = await initialize(page, '<ol><li title="Owner"><p>Before</p><p title="Start">Alpha <strong>one</strong></p><h4>Covered</h4></li><li><p>Covered too</p><h3 title="End" style="text-align: right"><em>Beta</em> tail</h3><p title="After">After</p><ul title="Branch"><li>Branch</li></ul></li><li>Keep</li></ol>');
    const after = await page.locator('.mw-content [title="After"]').elementHandle();
    const branch = await page.locator('.mw-content [title="Branch"]').elementHandle();
    await page.evaluate((backward) => {
      const root = window.editor.surface;
      const start = root.querySelector('[title="Start"]')!.firstChild!;
      const end = root.querySelector('em')!.firstChild!;
      root.focus();
      document.getSelection()!.setBaseAndExtent(backward ? end : start, backward ? 2 : 6, backward ? start : end, backward ? 6 : 2);
    }, backward);
    if (clipboard) await paste(page, '<h2 title="Incoming">Title</h2>');
    else await page.evaluate(() => window.editor.insertHTML('<h2 title="Incoming">Title</h2>'));
    const inserted = '<ol><li title="Owner"><p>Before</p><p title="Start">Alpha </p><h2 title="Incoming">Title</h2><h3 title="End" style="text-align: right"><em>ta</em> tail</h3><p title="After">After</p><ul title="Branch"><li>Branch</li></ul></li><li>Keep</li></ol>';
    expect(await html(page)).toBe(inserted);
    for (const node of [after, branch]) expect(await node!.evaluate((node) => node.isConnected && node.parentElement?.getAttribute('title') === 'Owner')).toBe(true);
    expect(await page.evaluate(() => ({ suffix: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="End"]'), offset: document.getSelection()!.anchorOffset, changes: window.changes.length }))).toEqual({ suffix: true, offset: 0, changes: 1 });
    await page.evaluate(() => window.editor.undo());
    expect(await html(page)).toBe(before);
    expect(await page.evaluate(() => {
      const selection = document.getSelection()!;
      return { anchor: selection.anchorNode?.textContent, anchorOffset: selection.anchorOffset, focus: selection.focusNode?.textContent, focusOffset: selection.focusOffset };
    })).toEqual(backward ? { anchor: 'Beta', anchorOffset: 2, focus: 'Alpha ', focusOffset: 6 } : { anchor: 'Alpha ', anchorOffset: 6, focus: 'Beta', focusOffset: 2 });
    await page.evaluate(() => window.editor.redo());
    expect(await html(page)).toBe(inserted);
  });
}

for (const direct of [false, true]) test(`single heading over same-body selection ${direct ? 'promotes the direct body' : 'retains the paragraph attributes'}`, async ({ page }) => {
  const body = direct ? 'ABCDE' : '<p title="Body" style="text-align: right">ABCDE</p>';
  const before = await initialize(page, `<ul><li title="Owner">${body}<ol><li>Branch</li></ol></li></ul>`);
  await page.evaluate((direct) => {
    const root = window.editor.surface;
    const point = root.querySelector(direct ? '[title="Owner"]' : '[title="Body"]')!.firstChild!;
    root.focus();
    document.getSelection()!.setBaseAndExtent(point, 4, point, 1);
    window.editor.insertHTML('<h2 title="Incoming">Title</h2>');
  }, direct);
  const attrs = direct ? '' : ' title="Body" style="text-align: right"';
  expect(await html(page)).toBe(`<ul><li title="Owner"><p${attrs}>A</p><h2 title="Incoming">Title</h2><p${attrs}>E</p><ol><li>Branch</li></ol></li></ul>`);
  await expect(page.locator('.mw-content li')).toHaveCount(2);
  await expect(page.locator('.mw-content p h2, .mw-content p p')).toHaveCount(0);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ anchor: document.getSelection()!.anchorOffset, focus: document.getSelection()!.focusOffset }))).toEqual({ anchor: 4, focus: 1 });
});

test('single heading replaces bodies of one item without disturbing the surrounding bodies or branch', async ({ page }) => {
  const before = await initialize(page, '<ul><li><p>Before</p><p title="Start">Alpha <strong>one</strong></p><h3 title="End"><em>Beta</em> tail</h3><p title="After">After</p><ol title="Branch"><li>Branch</li></ol></li></ul>');
  const after = await page.locator('.mw-content [title="After"]').elementHandle();
  const branch = await page.locator('.mw-content [title="Branch"]').elementHandle();
  await page.evaluate(() => {
    const root = window.editor.surface;
    root.focus();
    document.getSelection()!.setBaseAndExtent(root.querySelector('em')!.firstChild!, 2, root.querySelector('[title="Start"]')!.firstChild!, 6);
  });
  await paste(page, '<h2 title="Incoming">Title</h2>');
  expect(await html(page)).toBe('<ul><li><p>Before</p><p title="Start">Alpha </p><h2 title="Incoming">Title</h2><h3 title="End"><em>ta</em> tail</h3><p title="After">After</p><ol title="Branch"><li>Branch</li></ol></li></ul>');
  for (const node of [after, branch]) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ anchor: document.getSelection()!.anchorNode?.textContent, anchorOffset: document.getSelection()!.anchorOffset, focusOffset: document.getSelection()!.focusOffset }))).toEqual({ anchor: 'Beta', anchorOffset: 2, focusOffset: 6 });
});

test('whole-body replacement retains empty source heading edges with the suffix typing caret before its placeholder', async ({ page }) => {
  const before = await initialize(page, '<ul><li><h3 title="Body">AB</h3></li></ul>');
  await page.evaluate(() => {
    const root = window.editor.surface;
    const text = root.querySelector('h3')!.firstChild!;
    root.focus();
    document.getSelection()!.setBaseAndExtent(text, 0, text, 2);
    window.editor.insertHTML('<h2 title="Incoming">Title</h2>');
  });
  expect(await html(page)).toBe('<ul><li><h3 title="Body"><br></h3><h2 title="Incoming">Title</h2><h3 title="Body"><br></h3></li></ul>');
  expect(await page.evaluate(() => ({ suffix: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Incoming"]')!.nextElementSibling, offset: document.getSelection()!.anchorOffset }))).toEqual({ suffix: true, offset: 0 });
  await page.keyboard.type('X');
  await expect(page.locator('.mw-content [title="Incoming"] + h3')).toHaveText('X');
  await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ anchor: document.getSelection()!.anchorOffset, focus: document.getSelection()!.focusOffset }))).toEqual({ anchor: 0, focus: 2 });
});

for (const offset of [0, 1, 2]) test(`single heading at LI offset ${offset} uses one normalized body edge`, async ({ page }) => {
  const before = await initialize(page, '<ul><li title="Owner"><p>AB</p><h3>CD</h3><ol><li>Branch</li></ol></li></ul>');
  await caret(page, '[title="Owner"]', offset, true);
  await page.evaluate(() => window.editor.insertHTML('<h2>Title</h2>'));
  const bodies = offset === 0 ? '<p><br></p><h2>Title</h2><p>AB</p><h3>CD</h3>'
    : offset === 1 ? '<p>AB</p><h3><br></h3><h2>Title</h2><h3>CD</h3>' : '<p>AB</p><h3>CD</h3><h2>Title</h2><h3><br></h3>';
  expect(await html(page)).toBe(`<ul><li title="Owner">${bodies}<ol><li>Branch</li></ol></li></ul>`);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ item: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Owner"]'), offset: document.getSelection()!.anchorOffset }))).toEqual({ item: true, offset });
});

for (const offset of [0, 1]) test(`single empty heading keeps one placeholder in each edge from source BR offset ${offset}`, async ({ page }) => {
  const before = await initialize(page, '<ul><li><p title="Body"><br></p></li></ul>');
  await caret(page, '[title="Body"]', offset, true);
  await page.evaluate(() => {
    window.editor.format('bold', true);
    window.editor.insertHTML('<h2 title="Incoming"><br></h2>');
  });
  expect(await html(page)).toBe('<ul><li><p title="Body"><br></p><h2 title="Incoming"><br></h2><p title="Body"><br></p></li></ul>');
  expect(await page.evaluate(() => {
    const selection = document.getSelection()!;
    return { suffix: selection.anchorNode === window.editor.surface.querySelector('[title="Incoming"]')!.nextElementSibling, offset: selection.anchorOffset, bold: Boolean(window.editor.getFormats().bold), index: window.editor.getSelection()!.index, changes: window.changes.length };
  })).toEqual({ suffix: true, offset: 0, bold: false, index: 0, changes: 1 });
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ offset: document.getSelection()!.anchorOffset, bold: Boolean(window.editor.getFormats().bold) }))).toEqual({ offset, bold: true });
  await page.evaluate(() => window.editor.redo());
  expect(await page.evaluate(() => Boolean(window.editor.getFormats().bold))).toBe(false);
});

test('single heading preserves Unicode mark affinity on both sides without nesting the incoming block', async ({ page }) => {
  const before = await initialize(page, '<ul><li><h3 title="Body">Alpha <strong>A😀B</strong> tail</h3></li></ul>');
  await caret(page, 'strong', 3);
  await page.evaluate(() => window.editor.insertHTML('<h2 title="Incoming"><u>Title</u></h2>'));
  await expect(page.locator('.mw-content [title="Body"]').first()).toHaveJSProperty('innerHTML', 'Alpha <strong>A😀</strong>');
  await expect(page.locator('.mw-content [title="Incoming"] + h3')).toHaveJSProperty('innerHTML', '<strong>B</strong> tail');
  await expect(page.locator('.mw-content strong h2')).toHaveCount(0);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ strong: document.getSelection()!.anchorNode === window.editor.surface.querySelector('strong')!.firstChild, offset: document.getSelection()!.anchorOffset }))).toEqual({ strong: true, offset: 3 });
});

const semanticHeading: SchemaNodeSpec = { name: 'test:heading', kind: 'block', tag: 'h2', attributes: { 'data-id': { type: 'text', required: true } } };
const reference: SchemaNodeSpec = { name: 'test:reference', kind: 'inline', tag: 'span', attributes: { 'data-id': { type: 'text', required: true } } };
test('ordinary incoming heading retains semantic inline data and sanitized links/images', async ({ page }) => {
  await initialize(page, '<ul><li><p title="Body">AB</p></li></ul>', [reference]);
  await caret(page, '[title="Body"]', 1);
  await page.evaluate(() => window.editor.insertHTML('<h2 title="Incoming" style="position:fixed;text-align:right"><span data-mw-node="test:reference" data-id="kept">Ref</span><a href="https://example.com" onclick="alert(1)">Link</a><img src="/logo.svg" alt="I" onerror="alert(1)"><script>alert(1)</script></h2>'));
  await expect(page.locator('.mw-content [title="Incoming"]')).toHaveAttribute('style', 'text-align: right');
  await expect(page.locator('.mw-content [data-mw-node="test:reference"]')).toHaveAttribute('data-id', 'kept');
  await expect(page.locator('.mw-content [title="Incoming"] > a')).toHaveText('Link');
  await expect(page.locator('.mw-content [title="Incoming"] > img')).toHaveAttribute('src', '/logo.svg');
  await expect(page.locator('.mw-content script, .mw-content [onclick], .mw-content [onerror]')).toHaveCount(0);
  await expect(page.locator('.mw-content [title="Incoming"] + p')).toHaveText('B');
});

for (const collapsed of [false, true]) test(`a semantic single heading rejects before mutation at a ${collapsed ? 'caret' : 'same-body selection'}`, async ({ page }) => {
  const before = await initialize(page, '<ul><li><p title="Body">ABCDE</p><h3>After</h3></li></ul>', [semanticHeading]);
  await page.evaluate((collapsed) => {
    const root = window.editor.surface;
    const point = root.querySelector('[title="Body"]')!.firstChild!;
    root.focus();
    document.getSelection()!.setBaseAndExtent(point, collapsed ? 1 : 4, point, 1);
  }, collapsed);
  const payload = '<h2 data-mw-node="test:heading" data-id="owned">Semantic</h2>';
  const state = await page.evaluate(({ payload, collapsed }) => {
    const editor = window.editor;
    if (collapsed) editor.format('bold', true);
    const body = editor.surface.querySelector('[title="Body"]');
    const point = document.getSelection()!.anchorNode;
    const observer = new MutationObserver(() => {});
    observer.observe(editor.surface, { childList: true, attributes: true, subtree: true });
    let rejected = false;
    try { editor.insertHTML(payload); } catch { rejected = true; }
    const mutations = observer.takeRecords().length;
    observer.disconnect();
    return { rejected, mutations, sameBody: body === editor.surface.querySelector('[title="Body"]'), samePoint: point === document.getSelection()!.anchorNode, offset: document.getSelection()!.anchorOffset, changes: window.changes.length, undo: editor.canUndo(), bold: Boolean(editor.getFormats().bold) };
  }, { payload, collapsed });
  expect(state).toEqual({ rejected: true, mutations: 0, sameBody: true, samePoint: true, offset: collapsed ? 1 : 4, changes: 0, undo: false, bold: collapsed });
  expect(await paste(page, payload)).toBe(true);
  expect(await html(page)).toBe(before);
});

test('a single heading containing a structural child rejects rather than nesting a block in the source', async ({ page }) => {
  const before = await initialize(page, '<ul><li><p title="Body">AB</p></li></ul>');
  await caret(page, '[title="Body"]', 1);
  const payload = '<h2><blockquote><p>Unsupported</p></blockquote></h2>';
  expect(await page.evaluate((payload) => {
    const root = window.editor.surface;
    const observer = new MutationObserver(() => {});
    observer.observe(root, { subtree: true, childList: true, attributes: true });
    let rejected = false;
    try { window.editor.insertHTML(payload); } catch { rejected = true; }
    const mutations = observer.takeRecords().length;
    observer.disconnect();
    return { rejected, mutations, changes: window.changes.length, undo: window.editor.canUndo() };
  }, payload)).toEqual({ rejected: true, mutations: 0, changes: 0, undo: false });
  await paste(page, payload);
  expect(await html(page)).toBe(before);
});

for (const shape of ['image', 'interleaved', 'branch-offset']) test(`single heading source ${shape} rejects without a native fallback`, async ({ page }) => {
  const value = shape === 'image' ? '<ul><li title="Owner"><p title="Body">AB<img src="/logo.svg" alt="Original"></p></li></ul>'
    : shape === 'interleaved' ? '<ul><li title="Owner"><p title="Body">AB</p><ul><li>Branch</li></ul><h3>After</h3></li></ul>'
      : '<ul><li title="Owner"><p title="Body">AB</p><ul><li>Branch</li></ul></li></ul>';
  const before = await initialize(page, value);
  await caret(page, shape === 'branch-offset' ? '[title="Owner"]' : '[title="Body"]', shape === 'branch-offset' ? 2 : 1, shape === 'branch-offset');
  expect(await page.evaluate(() => {
    try { window.editor.insertHTML('<h2>Title</h2>'); return false; } catch { return true; }
  })).toBe(true);
  await paste(page, '<h2>Title</h2>');
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ changes: 0, undo: false });
});

test('single heading insertion in a nested list in a merged cell preserves geometry and outer ancestors', async ({ page }) => {
  const before = await initialize(page, '<table><tbody><tr><td rowspan="2" colspan="2"><ul><li title="Outer">Outer<ol><li><p title="Body">AB</p><h3>After</h3><ul><li>Branch</li></ul></li></ol></li></ul></td><td><p>A</p></td></tr><tr><td><p>B</p></td></tr></tbody></table>');
  const cell = await page.locator('.mw-content td').first().elementHandle();
  const outer = await page.locator('.mw-content [title="Outer"]').elementHandle();
  await caret(page, '[title="Body"]', 1);
  await paste(page, '<h2 title="Incoming">Title</h2>');
  await expect(page.locator('.mw-content [title="Incoming"] + p')).toHaveText('B');
  await expect(page.locator('.mw-content td').first()).toHaveAttribute('rowspan', '2');
  await expect(page.locator('.mw-content td').first()).toHaveAttribute('colspan', '2');
  await expect(page.locator('.mw-content td').nth(1)).toHaveText('A');
  await expect(page.locator('.mw-content td').nth(2)).toHaveText('B');
  for (const node of [cell, outer]) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

for (const guard of ['readonly', 'composition', 'canceled', 'stripped']) test(`${guard} leaves a single-heading list paste unchanged`, async ({ page }) => {
  const before = await initialize(page, '<ul><li><p title="Body">AB</p></li></ul>');
  await caret(page, '[title="Body"]', 1);
  await page.evaluate((guard) => {
    const root = window.editor.surface;
    if (guard === 'readonly') window.editor.setReadOnly(true);
    if (guard === 'composition') root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const data = new DataTransfer();
    data.setData('text/html', guard === 'stripped' ? '<script>alert(1)</script>' : '<h2>Title</h2>');
    data.setData('text/plain', 'Wrong fallback');
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: data });
    if (guard === 'canceled') event.preventDefault();
    root.dispatchEvent(event);
  }, guard);
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo(), offset: document.getSelection()!.anchorOffset }))).toEqual({ changes: 0, undo: false, offset: 1 });
});

test('a caught invalid semantic heading import poisons the preceding outer transaction', async ({ page }) => {
  const before = await initialize(page, '<ul><li><p title="Body">AB</p></li></ul>', [semanticHeading]);
  await caret(page, '[title="Body"]', 1);
  expect(await page.evaluate(() => {
    try {
      window.editor.transact((root) => {
        root.lastElementChild!.append(document.createTextNode('!'));
        try { window.editor.insertHTML('<h2 data-mw-node="test:heading" data-id="owned">Semantic</h2>'); }
        catch { /* Catching validation must not retain an earlier outer mutation. */ }
      });
      return false;
    } catch { return true; }
  })).toBe(true);
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo(), offset: document.getSelection()!.anchorOffset }))).toEqual({ changes: 0, undo: false, offset: 1 });
});
