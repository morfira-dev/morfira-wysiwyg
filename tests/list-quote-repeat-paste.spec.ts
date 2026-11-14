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

const beforeQuote = '<blockquote title="Before quote" style="text-align: right"><p>Before <img src="/logo.svg" alt="Kept"></p></blockquote>';
const afterQuote = '<blockquote title="After quote"><h4>After</h4><p><br></p></blockquote>';
const source = `<ul><li title="Owner">${beforeQuote}<h2 title="Body">Alpha Beta</h2>${afterQuote}<p title="Keep">Keep</p><ol title="Branch"><li>Branch</li></ol></li><li>Other</li></ul>`;

for (const profile of ['blocks', 'heading', 'quote']) {
  for (const clipboard of [false, true]) test(`${profile} ${clipboard ? 'clipboard' : 'API'} paste preserves actual quotes before and after the caret`, async ({ page }) => {
    const before = await initialize(page, source);
    const handles = await Promise.all(['Before quote', 'After quote', 'Body', 'Keep', 'Branch'].map((title) => page.locator(`.mw-content [title="${title}"]`).elementHandle()));
    const image = await page.locator('.mw-content blockquote img').elementHandle();
    const placeholder = await page.locator('.mw-content [title="After quote"] br').elementHandle();
    await caret(page, '[title="Body"]', 6);
    const payload = profile === 'blocks' ? '<p><u>X</u></p><h3 title="Incoming">Y</h3>'
      : profile === 'heading' ? '<h3 title="Incoming">Y</h3>' : '<blockquote title="Incoming"><p>Y</p></blockquote>';
    if (clipboard) expect(await paste(page, payload)).toBe(true);
    else await page.evaluate((value) => window.editor.insertHTML(value), payload);
    const inserted = profile === 'blocks' ? '<h2 title="Body">Alpha <u>X</u></h2><h3 title="Incoming">YBeta</h3>'
      : `<h2 title="Body">Alpha </h2>${payload}<h2 title="Body">Beta</h2>`;
    expect(await html(page)).toBe(`<ul><li title="Owner">${beforeQuote}${inserted}${afterQuote}<p title="Keep">Keep</p><ol title="Branch"><li>Branch</li></ol></li><li>Other</li></ul>`);
    for (const node of [...handles, image, placeholder]) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
    for (const index of [0, 1]) expect(await handles[index]!.evaluate((node) => node.parentElement?.getAttribute('title'))).toBe('Owner');
    expect(await page.evaluate((profile) => {
      const root = window.editor.surface;
      const incoming = root.querySelector('[title="Incoming"]')!;
      const target = profile === 'blocks' ? incoming : incoming.nextElementSibling!;
      const range = document.getSelection()!.getRangeAt(0);
      const prefix = document.createRange();
      prefix.selectNodeContents(target);
      prefix.setEnd(range.startContainer, range.startOffset);
      return { prefix: prefix.toString(), changes: window.changes.length, collapsed: range.collapsed };
    }, profile)).toEqual({ prefix: profile === 'blocks' ? 'Y' : '', changes: 1, collapsed: true });
    await page.keyboard.insertText('!');
    await expect(page.locator(profile === 'blocks' ? '.mw-content h3[title="Incoming"]' : '.mw-content [title="Incoming"] + h2')).toHaveText(profile === 'blocks' ? 'Y!Beta' : '!Beta');
    await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
    expect(await html(page)).toBe(before);
    expect(await page.evaluate(() => ({ node: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Body"]')!.firstChild, offset: document.getSelection()!.anchorOffset, undo: window.editor.canUndo() }))).toEqual({ node: true, offset: 6, undo: false });
    await page.evaluate(() => window.editor.redo());
    await expect(page.locator('.mw-content [title="Incoming"]')).toHaveCount(1);
  });
}

test('same-body backward selection preserves multiple surrounding quotes and exact undo boundaries', async ({ page }) => {
  const before = await initialize(page, `<ul><li>${beforeQuote}<p title="Body">ABCDE</p>${afterQuote}</li></ul>`);
  const quote = await page.locator('.mw-content [title="After quote"]').elementHandle();
  await page.evaluate(() => {
    const root = window.editor.surface;
    const point = root.querySelector('[title="Body"]')!.firstChild!;
    root.focus();
    document.getSelection()!.setBaseAndExtent(point, 4, point, 1);
    window.editor.insertHTML('<h3 title="Incoming">Title</h3>');
  });
  expect(await html(page)).toBe(`<ul><li>${beforeQuote}<p title="Body">A</p><h3 title="Incoming">Title</h3><p title="Body">E</p>${afterQuote}</li></ul>`);
  expect(await quote!.evaluate((node) => node.isConnected)).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ anchor: document.getSelection()!.anchorOffset, focus: document.getSelection()!.focusOffset }))).toEqual({ anchor: 4, focus: 1 });
});

test('a range across ordinary bodies in one item keeps quotes outside that interval intact', async ({ page }) => {
  const before = await initialize(page, `<ul><li>${beforeQuote}<p title="Start">Alpha <strong>one</strong></p><p>Covered</p><h2 title="End"><em>Beta</em> tail</h2>${afterQuote}</li></ul>`);
  const handles = await Promise.all(['Before quote', 'After quote'].map((title) => page.locator(`.mw-content [title="${title}"]`).elementHandle()));
  await page.evaluate(() => {
    const root = window.editor.surface;
    root.focus();
    document.getSelection()!.setBaseAndExtent(root.querySelector('em')!.firstChild!, 2, root.querySelector('[title="Start"]')!.firstChild!, 6);
  });
  await paste(page, '<p>X</p><h3>Y</h3>');
  expect(await html(page)).toBe(`<ul><li>${beforeQuote}<p title="Start">Alpha X</p><h3>Y<em>ta</em> tail</h3>${afterQuote}</li></ul>`);
  for (const node of handles) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

test('a sibling-item selection preserves a quote preceding its start and a quote following its end', async ({ page }) => {
  const before = await initialize(page, `<ol><li>${beforeQuote}<p title="Start">Alpha <strong>one</strong></p></li><li><p>Covered</p></li><li><h2 title="End"><em>Beta</em> tail</h2>${afterQuote}<ul title="Branch"><li>Branch</li></ul></li></ol>`);
  const handles = await Promise.all(['Before quote', 'After quote', 'Branch'].map((title) => page.locator(`.mw-content [title="${title}"]`).elementHandle()));
  await page.evaluate(() => {
    const root = window.editor.surface;
    root.focus();
    document.getSelection()!.setBaseAndExtent(root.querySelector('em')!.firstChild!, 2, root.querySelector('[title="Start"]')!.firstChild!, 6);
  });
  await paste(page, '<p>X</p><h3 title="Incoming">Y</h3>');
  expect(await html(page)).toBe(`<ol><li>${beforeQuote}<p title="Start">Alpha X</p><h3 title="Incoming">Y<em>ta</em> tail</h3>${afterQuote}<ul title="Branch"><li>Branch</li></ul></li></ol>`);
  for (const node of handles) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ anchor: document.getSelection()!.anchorNode?.textContent, anchorOffset: document.getSelection()!.anchorOffset, focus: document.getSelection()!.focusNode?.textContent, focusOffset: document.getSelection()!.focusOffset }))).toEqual({ anchor: 'Beta', anchorOffset: 2, focus: 'Alpha ', focusOffset: 6 });
});

test('quote then heading then several blocks can be inserted without resetting the document', async ({ page }) => {
  const before = await initialize(page, '<ul><li><p title="Body">AB</p></li></ul>');
  await caret(page, '[title="Body"]', 1);
  await page.evaluate(() => window.editor.insertHTML('<blockquote title="First quote">Q</blockquote>'));
  const quote = await page.locator('.mw-content [title="First quote"]').elementHandle();
  const first = await html(page);
  await page.evaluate(() => window.editor.insertHTML('<h2 title="Heading">H</h2>'));
  const second = await html(page);
  await paste(page, '<p>X</p><h3 title="Last">Y</h3>');
  const third = '<ul><li><p title="Body">A</p><blockquote title="First quote">Q</blockquote><p title="Body"><br></p><h2 title="Heading">H</h2><p title="Body">X</p><h3 title="Last">YB</h3></li></ul>';
  expect(await html(page)).toBe(third);
  expect(await quote!.evaluate((node) => node.isConnected)).toBe(true);
  expect(await page.evaluate(() => window.changes.length)).toBe(3);
  await page.keyboard.insertText('!');
  await expect(page.locator('.mw-content [title="Last"]')).toHaveText('Y!B');
  for (const expected of [third, second, first, before]) {
    await page.evaluate(() => window.editor.undo());
    expect(await html(page)).toBe(expected);
  }
  expect(await page.evaluate(() => ({ node: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Body"]')!.firstChild, offset: document.getSelection()!.anchorOffset, undo: window.editor.canUndo() }))).toEqual({ node: true, offset: 1, undo: false });
  for (const expected of [first, second, third]) {
    await page.evaluate(() => window.editor.redo());
    expect(await html(page)).toBe(expected);
  }
});

for (const position of ['inside', 'multiple-quotes-with-image', 'item-edge', 'cross-items-with-branch', 'middle-item-with-branch']) test(`${position === 'inside' ? 'a nested quote payload inside a quote' : `a ${position} quote selection`} is an atomic block-paste barrier`, async ({ page }) => {
  const value = position === 'middle-item-with-branch'
    ? '<ul><li><p title="Before">AB</p></li><li><blockquote>Quote</blockquote><ol><li>Blocked branch</li></ol></li><li><p title="Other">EF</p></li></ul>'
    : `<ul><li title="Owner"><p title="Before">AB</p><blockquote title="Quote"><p>Quote</p></blockquote>${position === 'multiple-quotes-with-image' ? '<blockquote>Second quote<img src="/logo.svg" alt="Original"></blockquote>' : ''}<h2 title="After">CD</h2>${position === 'cross-items-with-branch' ? '<ol><li>Blocked branch</li></ol>' : ''}</li><li><p title="Other">EF</p></li></ul>`;
  const before = await initialize(page, value);
  await page.evaluate((position) => {
    const root = window.editor.surface;
    const selection = document.getSelection()!;
    root.focus();
    if (position === 'inside') {
      const point = root.querySelector('blockquote p')!.firstChild!;
      selection.setBaseAndExtent(point, 1, point, 1);
    } else if (position === 'item-edge') {
      const item = root.querySelector('[title="Owner"]')!;
      selection.setBaseAndExtent(item, 1, item, 1);
    } else {
      const start = root.querySelector('[title="Before"]')!.firstChild!;
      const end = root.querySelector(position === 'multiple-quotes-with-image' ? '[title="After"]' : '[title="Other"]')!.firstChild!;
      selection.setBaseAndExtent(end, 1, start, 1);
    }
  }, position);
  const payload = position === 'inside' ? '<blockquote>Nested</blockquote>' : '<p>X</p><h3>Y</h3>';
  const result = await page.evaluate((payload) => {
    const editor = window.editor;
    const selection = document.getSelection()!;
    const anchor = selection.anchorNode;
    const focus = selection.focusNode;
    const offsets = [selection.anchorOffset, selection.focusOffset];
    const observer = new MutationObserver(() => {});
    observer.observe(editor.surface, { subtree: true, childList: true, attributes: true });
    let rejected = false;
    try { editor.insertHTML(payload); } catch { rejected = true; }
    const mutations = observer.takeRecords().length;
    observer.disconnect();
    return { rejected, mutations, same: anchor === selection.anchorNode && focus === selection.focusNode, offsets: offsets.join(',') === [selection.anchorOffset, selection.focusOffset].join(','), changes: window.changes.length, undo: editor.canUndo() };
  }, payload);
  expect(result).toEqual({ rejected: true, mutations: 0, same: true, offsets: true, changes: 0, undo: false });
  expect(await paste(page, position === 'inside' ? '<blockquote>Nested</blockquote>' : '<h3>New</h3>')).toBe(true);
  expect(await html(page)).toBe(before);
});

test('an item-level edge after a quote resolves to the following ordinary body', async ({ page }) => {
  await initialize(page, '<ul><li title="Owner"><p>Before</p><blockquote>Q</blockquote><h2 title="Body">AB</h2></li></ul>');
  await caret(page, '[title="Owner"]', 2, true);
  await page.evaluate(() => window.editor.insertHTML('<p>X</p><h3>Y</h3>'));
  expect(await html(page)).toBe('<ul><li title="Owner"><p>Before</p><blockquote>Q</blockquote><h2 title="Body">X</h2><h3>YAB</h3></li></ul>');
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => ({ item: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Owner"]'), offset: document.getSelection()!.anchorOffset }))).toEqual({ item: true, offset: 2 });
});

test('a selection ending before a quote keeps it, while a collapsed caret at the same LI offset is blocked', async ({ page }) => {
  const before = await initialize(page, '<ul><li title="Owner"><p title="Body">ABC</p><blockquote title="Quote">Q</blockquote><p>After</p></li></ul>');
  const quote = await page.locator('.mw-content [title="Quote"]').elementHandle();
  await page.evaluate(() => {
    const root = window.editor.surface;
    const item = root.querySelector('[title="Owner"]')!;
    root.focus();
    document.getSelection()!.setBaseAndExtent(item, 1, item.querySelector('p')!.firstChild!, 1);
    window.editor.insertHTML('<p>X</p><h3>Y</h3>');
  });
  expect(await html(page)).toBe('<ul><li title="Owner"><p title="Body">AX</p><h3>Y</h3><blockquote title="Quote">Q</blockquote><p>After</p></li></ul>');
  expect(await quote!.evaluate((node) => node.isConnected)).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ anchor: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Owner"]'), anchorOffset: document.getSelection()!.anchorOffset, focus: document.getSelection()!.focusNode?.textContent, focusOffset: document.getSelection()!.focusOffset }))).toEqual({ anchor: true, anchorOffset: 1, focus: 'ABC', focusOffset: 1 });
  await caret(page, '[title="Owner"]', 1, true);
  const changes = await page.evaluate(() => window.changes.length);
  expect(await page.evaluate(() => {
    try { window.editor.insertHTML('<h3>Blocked</h3>'); return false; } catch { return true; }
  })).toBe(true);
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo(), item: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Owner"]'), offset: document.getSelection()!.anchorOffset }))).toEqual({ changes, undo: false, item: true, offset: 1 });
});

const semanticQuote: SchemaNodeSpec = { name: 'test:quote', kind: 'block', tag: 'blockquote', attributes: { 'data-id': { type: 'text', required: true } } };
for (const quote of ['<blockquote data-mw-node="test:quote" data-id="kept">Q</blockquote>', '<blockquote><blockquote>Nested</blockquote></blockquote>', '<blockquote>Loose<p>Mixed</p></blockquote>']) test(`an unsupported unselected source quote rejects the whole block paste: ${quote}`, async ({ page }) => {
  const before = await initialize(page, `<ul><li>${quote}<p title="Body">AB</p></li></ul>`, [semanticQuote]);
  await caret(page, '[title="Body"]');
  const result = await page.evaluate(() => {
    const editor = window.editor;
    editor.format('bold', true);
    const body = editor.surface.querySelector('[title="Body"]');
    const point = document.getSelection()!.anchorNode;
    const observer = new MutationObserver(() => {});
    observer.observe(editor.surface, { subtree: true, attributes: true, childList: true });
    let rejected = false;
    try { editor.insertHTML('<blockquote>New</blockquote>'); } catch { rejected = true; }
    const mutations = observer.takeRecords().length;
    observer.disconnect();
    return { rejected, mutations, same: point === document.getSelection()!.anchorNode && body === editor.surface.querySelector('[title="Body"]'), bold: Boolean(editor.getFormats().bold), changes: window.changes.length, undo: editor.canUndo() };
  });
  expect(result).toEqual({ rejected: true, mutations: 0, same: true, bold: true, changes: 0, undo: false });
  await paste(page, '<h3>New</h3>');
  expect(await html(page)).toBe(before);
});

test('same-offset pending formatting clears for a valid repeated block insertion and is restored on undo', async ({ page }) => {
  const before = await initialize(page, '<ul><li><blockquote title="Quote"><br></blockquote><p title="Body">AB</p></li></ul>');
  await caret(page, '[title="Body"]');
  await page.evaluate(() => {
    window.editor.format('bold', true);
    window.editor.insertHTML('<p><br></p><h3 title="Last"><br></h3>');
  });
  expect(await html(page)).toBe('<ul><li><blockquote title="Quote"><br></blockquote><p title="Body"><br></p><h3 title="Last">AB</h3></li></ul>');
  expect(await page.evaluate(() => ({ index: window.editor.getSelection()!.index, bold: Boolean(window.editor.getFormats().bold), changes: window.changes.length }))).toEqual({ index: 0, bold: false, changes: 1 });
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ bold: Boolean(window.editor.getFormats().bold), node: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Body"]')!.firstChild, offset: document.getSelection()!.anchorOffset }))).toEqual({ bold: true, node: true, offset: 0 });
});

test('repeated block paste in a nested list stays within its merged cell', async ({ page }) => {
  const value = `<table><tbody><tr><td rowspan="2" colspan="2"><ul><li title="Outer">Outer${source}</li></ul></td><td><p>A</p></td></tr><tr><td><p>B</p></td></tr></tbody></table>`;
  const before = await initialize(page, value);
  const cell = await page.locator('.mw-content td').first().elementHandle();
  const outer = await page.locator('.mw-content [title="Outer"]').elementHandle();
  const quote = await page.locator('.mw-content [title="After quote"]').elementHandle();
  await caret(page, '[title="Body"]', 6);
  await paste(page, '<h3 title="Incoming">H</h3>');
  await expect(page.locator('.mw-content [title="Incoming"] + h2')).toHaveText('Beta');
  for (const node of [cell, outer, quote]) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
  await expect(page.locator('.mw-content td').first()).toHaveAttribute('rowspan', '2');
  await expect(page.locator('.mw-content td').first()).toHaveAttribute('colspan', '2');
  await expect(page.locator('.mw-content td').nth(1)).toHaveText('A');
  await expect(page.locator('.mw-content td').nth(2)).toHaveText('B');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

for (const guard of ['readonly', 'composition', 'canceled']) test(`${guard} prevents manual repeated block paste`, async ({ page }) => {
  const before = await initialize(page, source);
  await caret(page, '[title="Body"]', 6);
  await page.evaluate((guard) => {
    const root = window.editor.surface;
    if (guard === 'readonly') window.editor.setReadOnly(true);
    if (guard === 'composition') root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    if (guard === 'canceled') root.addEventListener('paste', (event) => event.preventDefault(), { capture: true, once: true });
  }, guard);
  await paste(page, '<h3>H</h3>');
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ changes: 0, undo: false });
});

test('a nested invalid block paste still poisons the complete outer transaction with existing quotes', async ({ page }) => {
  const before = await initialize(page, source, [semanticQuote]);
  await caret(page, '[title="Body"]', 6);
  expect(await page.evaluate(() => {
    try {
      window.editor.transact((root) => {
        root.querySelector('[title="Keep"]')!.append(document.createTextNode('!'));
        try { window.editor.insertHTML('<blockquote data-mw-node="test:quote">Missing id</blockquote>'); } catch { /* The failed nested import must poison its transaction. */ }
      });
      return false;
    } catch { return true; }
  })).toBe(true);
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ node: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Body"]')!.firstChild, offset: document.getSelection()!.anchorOffset, changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ node: true, offset: 6, changes: 0, undo: false });
});

test('native Enter and Backspace boundaries remain guarded while block paste can reuse the same quoted item', async ({ page }) => {
  const before = await initialize(page, source);
  await caret(page, '[title="Body"]', 0);
  for (const inputType of ['insertParagraph', 'deleteContentBackward']) {
    expect(await page.evaluate((inputType) => {
      const event = new InputEvent('beforeinput', { inputType, bubbles: true, cancelable: true });
      window.editor.surface.dispatchEvent(event);
      return event.defaultPrevented;
    }, inputType)).toBe(true);
    expect(await html(page)).toBe(before);
    expect(await page.evaluate(() => window.changes.length)).toBe(0);
  }
  await page.evaluate(() => window.editor.insertHTML('<h3 title="Incoming">H</h3>'));
  await expect(page.locator('.mw-content [title="Incoming"]')).toHaveText('H');
});

test('opaque quote validation preserves its actual formatting whitespace and child nodes', async ({ page }) => {
  await initialize(page, '<ul><li><blockquote title="Quote">\n  <p>Quote</p>\n  <h3>Source</h3>\n</blockquote><p title="Body">AB</p></li></ul>');
  const quote = await page.locator('.mw-content [title="Quote"]').elementHandle();
  const before = await quote!.evaluate((node) => node.innerHTML);
  const child = await page.locator('.mw-content [title="Quote"] h3').elementHandle();
  await caret(page, '[title="Body"]', 1);
  await page.evaluate(() => window.editor.insertHTML('<h3 title="Incoming">H</h3>'));
  expect(await quote!.evaluate((node) => ({ connected: node.isConnected, html: node.innerHTML }))).toEqual({ connected: true, html: before });
  expect(await child!.evaluate((node) => node.isConnected && node.parentElement?.getAttribute('title') === 'Quote')).toBe(true);
});
