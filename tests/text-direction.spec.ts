import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import './text-direction.types.js';

const initialize = async (page: Page, value: string, markdown = false) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async ({ value, markdown }) => {
    const path = '/packages/plugins/dist/text-direction.js';
    const { textDirection, textDirectionCommands } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/plugins/text-direction');
    window.dispose();
    const host = document.createElement('div');
    host.className = 'text-direction-test';
    document.body.append(host);
    window.changes = [];
    window.editor = window.createEditor(host, { value, plugins: [textDirection(), ...(markdown ? [window.createMarkdownShortcuts()] : [])], onChange: (change) => window.changes.push(change) });
    window.textDirectionAPI = textDirectionCommands(window.editor);
    window.dispose = () => { window.editor.destroy(); host.remove(); };
  }, { value, markdown });
};
const html = (page: Page) => page.evaluate(() => window.editor.getHTML());
const content = (page: Page) => page.locator('.text-direction-test .mw-content');

test('rich backward sibling blocks retain actual nodes, alignment and exact one-step direction history', async ({ page }) => {
  const before = '<p title="Arabic" style="text-align: center"><strong>مرحبا</strong></p><h2 title="Hebrew" style="text-align: left"><em>שלום</em></h2><p>Keep</p>';
  await initialize(page, before);
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    const arabic = root.querySelector('strong')!.firstChild!;
    const hebrew = root.querySelector('em')!.firstChild!;
    const nodes = [...root.childNodes, ...root.querySelectorAll('*'), arabic, hebrew];
    root.focus();
    const selection = document.getSelection()!;
    selection.setBaseAndExtent(hebrew, 3, arabic, 1);
    window.textDirectionAPI.setDirection('rtl');
    return { state: window.textDirectionAPI.getState(), retained: nodes.every((node) => root.contains(node)), range: selection.anchorNode === hebrew && selection.focusNode === arabic && selection.anchorOffset === 3 && selection.focusOffset === 1, computed: [...root.children].map((node) => getComputedStyle(node).direction), align: [getComputedStyle(root.children[0]).textAlign, getComputedStyle(root.children[1]).textAlign], changes: window.changes.map((change) => change.source) };
  })).toEqual({ state: { disabled: false, direction: 'rtl', mixed: false }, retained: true, range: true, computed: ['rtl', 'rtl', 'ltr'], align: ['center', 'left'], changes: ['user'] });
  const changed = await html(page);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    const selection = document.getSelection()!;
    return { backward: selection.anchorNode === root.querySelector('em')!.firstChild && selection.focusNode === root.querySelector('strong')!.firstChild && selection.anchorOffset === 3 && selection.focusOffset === 1, undo: window.editor.canUndo() };
  })).toEqual({ backward: true, undo: false });
  await page.evaluate(() => window.editor.redo());
  expect(await html(page)).toBe(changed);
  await page.evaluate(() => {
    const text = window.editor.surface.querySelector('strong')!.firstChild!;
    document.getSelection()!.setBaseAndExtent(text, 2, text, 2);
  });
  await page.keyboard.type('X');
  await expect(content(page).locator('strong')).toHaveText('مرXحبا');
  await expect(content(page).locator('p').first()).toHaveAttribute('dir', 'rtl');
});

test('reset exposes native inheritance, mixed includes absent values and multilingual code points are unchanged', async ({ page }) => {
  const text = 'עברית\u202eABC\u202c XYZ';
  await initialize(page, `<blockquote dir="rtl"><p dir="ltr">العربية abc</p><p>${text}</p></blockquote>`);
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    const paragraphs = root.querySelectorAll('p');
    root.focus();
    const selection = document.getSelection()!;
    selection.setBaseAndExtent(paragraphs[0].firstChild!, 1, paragraphs[0].firstChild!, 1);
    window.textDirectionAPI.setDirection(false);
    const reset = { state: window.textDirectionAPI.getState(), explicit: paragraphs[0].getAttribute('dir'), computed: getComputedStyle(paragraphs[0]).direction };
    selection.setBaseAndExtent(paragraphs[1].firstChild!, 1, paragraphs[1].firstChild!, 1);
    window.textDirectionAPI.setDirection('ltr');
    selection.setBaseAndExtent(paragraphs[0].firstChild!, 0, paragraphs[1].firstChild!, 0);
    const mixed = window.textDirectionAPI.getState();
    window.textDirectionAPI.setDirection('rtl');
    const unified = window.textDirectionAPI.getState();
    window.textDirectionAPI.setDirection(false);
    return { reset, mixed, unified, final: window.textDirectionAPI.getState(), inherited: [...paragraphs].map((node) => getComputedStyle(node).direction), texts: [...paragraphs].map((node) => node.textContent), parent: root.querySelector('blockquote')!.getAttribute('dir') };
  })).toEqual({ reset: { state: { disabled: false, direction: false, mixed: false }, explicit: null, computed: 'rtl' }, mixed: { disabled: false, direction: false, mixed: true }, unified: { disabled: false, direction: 'rtl', mixed: false }, final: { disabled: false, direction: false, mixed: false }, inherited: ['rtl', 'rtl'], texts: ['العربية abc', text], parent: 'rtl' });
});

test('nested, empty, quote and cell targets remain local while structural, semantic and malformed boundaries refuse atomically', async ({ page }) => {
  await initialize(page, '<ul><li title="Owner">Owner<ul title="Branch"><li>Child</li></ul></li><li><p title="Empty"><br></p></li></ul><blockquote title="Quote">Quote</blockquote><table><tbody><tr><td rowspan="2"><p title="Cell">Cell</p></td><td title="Bare">Other</td></tr><tr><td>Keep</td></tr></tbody></table>');
  expect(await page.evaluate(() => {
    const editor = window.editor;
    const root = editor.surface;
    root.focus();
    const selection = document.getSelection()!;
    const owner = root.querySelector('[title="Owner"]')!;
    selection.setBaseAndExtent(owner.firstChild!, 1, owner.firstChild!, 1);
    window.textDirectionAPI.setDirection('rtl');
    const empty = root.querySelector('[title="Empty"]')!;
    selection.setBaseAndExtent(empty, 0, empty, 0);
    window.textDirectionAPI.setDirection('ltr');
    const quote = root.querySelector('[title="Quote"]')!;
    selection.setBaseAndExtent(quote, 0, quote, 0);
    window.textDirectionAPI.setDirection('rtl');
    const bare = root.querySelector('[title="Bare"]')!;
    selection.setBaseAndExtent(bare.firstChild!, 1, bare.firstChild!, 1);
    window.textDirectionAPI.setDirection('rtl');
    const cell = root.querySelector('[title="Cell"]')!;
    selection.setBaseAndExtent(cell.firstChild!, 1, cell.firstChild!, 1);
    window.textDirectionAPI.setDirection('rtl');
    const local = { owner: owner.getAttribute('dir'), branch: root.querySelector('[title="Branch"]')!.getAttribute('dir'), empty: empty.getAttribute('dir'), emptyItem: empty.parentElement!.getAttribute('dir'), quote: quote.getAttribute('dir'), bare: bare.getAttribute('dir'), cell: cell.getAttribute('dir'), cellOwner: cell.parentElement!.getAttribute('dir') };
    const disabled: boolean[] = [];
    const refuse = (a: Node, aOffset: number, b = a, bOffset = aOffset): void => {
      selection.setBaseAndExtent(a, aOffset, b, bOffset);
      const before = root.innerHTML;
      const changes = window.changes.length;
      disabled.push(window.textDirectionAPI.getState().disabled);
      window.textDirectionAPI.setDirection('ltr');
      if (root.innerHTML !== before || window.changes.length !== changes || selection.anchorNode !== a || selection.anchorOffset !== aOffset || selection.focusNode !== b || selection.focusOffset !== bOffset) throw new Error('A refused direction operation changed its boundary.');
    };
    refuse(cell.firstChild!, 1, bare.firstChild!, 1);
    refuse(root.querySelector('[title="Branch"]')!, 0);
    refuse(root.querySelector('tr')!, 0);
    refuse(root, 0);
    quote.setAttribute('data-mw-node', 'app:quote');
    refuse(quote.firstChild!, 1);
    quote.removeAttribute('data-mw-node');
    const foreign = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    foreign.textContent = 'Foreign';
    quote.append(foreign);
    refuse(foreign.firstChild!, 1);
    foreign.remove();
    const left = document.createElement('p');
    const right = document.createElement('h2');
    left.textContent = 'Left';
    right.textContent = 'Right';
    const gap = document.createTextNode('\n ');
    quote.replaceChildren(left, gap, right);
    selection.setBaseAndExtent(left.firstChild!, 1, right.firstChild!, 1);
    window.textDirectionAPI.setDirection('ltr');
    const whitespaceAccepted = left.getAttribute('dir') === 'ltr' && right.getAttribute('dir') === 'ltr' && gap.parentNode === quote && gap.textContent === '\n ';
    gap.textContent = 'barrier';
    refuse(left.firstChild!, 1, right.firstChild!, 1);
    return { local, disabled, whitespaceAccepted, cells: root.querySelectorAll('td').length, rowspan: root.querySelector('td')!.getAttribute('rowspan') };
  })).toEqual({ local: { owner: 'rtl', branch: null, empty: 'ltr', emptyItem: null, quote: 'rtl', bare: 'rtl', cell: 'rtl', cellOwner: null }, disabled: Array(7).fill(true), whitespaceAccepted: true, cells: 3, rowspan: '2' });
});

test('plugin-independent HTML, JSON and paste preserve canonical dir while invalid attributes and bidi CSS stay outside the document', async ({ page }) => {
  await initialize(page, '<p>Target</p>');
  expect(await page.evaluate(async () => {
    const path = '/packages/core/dist/index.js';
    const { createDocumentSchema, sanitizeHTML } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg');
    const schema = createDocumentSchema();
    const input = '<p dir=" RTL ">العربية</p><ul dir="ltr"><li dir="rtl">עברית</li></ul>';
    const normalized = schema.sanitizeHTML(input);
    window.editor.destroy();
    const host = document.createElement('div');
    document.body.append(host);
    let changes = 0;
    const editor = window.createEditor(host, { value: normalized, onChange: () => { changes++; } });
    editor.setJSON(editor.getJSON());
    const roundTrip = editor.getHTML();
    editor.setSelection(1);
    const before = { html: editor.getHTML(), selection: editor.getSelection(), changes, undo: editor.canUndo() };
    const invalid = [{ tag: 'span', dir: 'rtl' }, { tag: 'p', dir: 'RTL' }, { tag: 'p', dir: 'auto' }, { tag: 'p', dir: true }, { tag: 'p', dir: 'rtl; color: red' }];
    const rejected = invalid.map(({ tag, dir }) => {
      try { editor.setJSON({ version: 1, children: [{ type: 'element', tag, attributes: { dir }, children: [{ type: 'text', text: 'Invalid' }] }] } as never); return false; }
      catch { return editor.getHTML() === before.html && !editor.canUndo() && changes === before.changes && JSON.stringify(editor.getSelection()) === JSON.stringify(before.selection); }
    });
    editor.setHTML('<p>Target</p>');
    editor.setSelection(0, 6);
    const data = new DataTransfer();
    data.setData('text/html', input);
    const paste = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: data });
    editor.surface.dispatchEvent(paste);
    const pasted = [...editor.surface.querySelectorAll('[dir]')].map((node) => [node.localName, node.getAttribute('dir')]);
    const filtered = sanitizeHTML('<p dir="auto" style="direction: rtl; unicode-bidi: bidi-override; writing-mode: vertical-rl; color: red"><bdi dir="rtl">Safe</bdi></p><span dir="rtl">Inline</span><table dir="rtl"><tbody><tr><td dir=" RTL ">Cell</td></tr></tbody></table>');
    editor.destroy();
    host.remove();
    const aliased = sanitizeHTML('<div dir=" RTL ">X</div>');
    let jsonAliasRejected = false;
    try { schema.validateDocument({ version: 1, children: [{ type: 'element', tag: 'div', attributes: { dir: 'rtl' }, children: [] }] } as never); }
    catch { jsonAliasRejected = true; }
    return { normalized, roundTrip, rejected, pasted, filtered, aliased, jsonAliasRejected };
  })).toEqual({ normalized: '<p dir="rtl">العربية</p><ul dir="ltr"><li dir="rtl">עברית</li></ul>', roundTrip: '<p dir="rtl">العربية</p><ul dir="ltr"><li dir="rtl">עברית</li></ul>', rejected: Array(5).fill(true), pasted: [['p', 'rtl'], ['ul', 'ltr'], ['li', 'rtl']], filtered: '<p style="color: red">Safe</p><span>Inline</span><table><tbody><tr><td dir="rtl">Cell</td></tr></tbody></table>', aliased: '<p dir="rtl">X</p>', jsonAliasRejected: true });
});

test('bounded retag, list, Markdown and heading Enter transformations preserve validated direction boundaries', async ({ page }) => {
  await initialize(page, '<p dir="rtl">Text</p>', true);
  expect(await page.evaluate(() => {
    const editor = window.editor;
    editor.setSelection(1);
    const retained: Array<string | null> = [];
    for (const [format, value] of [['header', 2], ['blockquote', true], ['code-block', true]] as const) {
      editor.format(format, value);
      retained.push(editor.surface.firstElementChild!.getAttribute('dir'));
    }
    editor.setHTML('<p dir="rtl">Item</p>');
    editor.setSelection(1);
    editor.format('list', 'bullet');
    const item = editor.surface.querySelector('li')!.getAttribute('dir');
    editor.format('list', false);
    const unwrapped = editor.surface.querySelector('p')!.getAttribute('dir');
    editor.setHTML('<ul><li dir="rtl"><p>A</p><h2 dir="ltr">B</h2></li></ul>');
    editor.setSelection(0, 2);
    editor.format('list', false);
    const bodies = [...editor.surface.querySelectorAll('p,h2')].map((node) => node.getAttribute('dir'));
    editor.setHTML('<ul dir="rtl"><li>A</li></ul>');
    editor.setSelection(0, 1);
    editor.format('list', 'ordered');
    const converted = editor.surface.querySelector('ol')!.getAttribute('dir');
    editor.setHTML('<ul dir="rtl"><li>A</li></ul><p>B</p><ul dir="ltr"><li>C</li></ul>');
    const paragraph = editor.surface.querySelector('p')!.firstChild!;
    document.getSelection()!.setBaseAndExtent(paragraph, 0, paragraph, 1);
    editor.format('list', 'bullet');
    const separate = editor.surface.querySelectorAll(':scope > ul').length;
    editor.setHTML('<ul dir="rtl"><li>Parent<ul dir="ltr"><li>Existing</li></ul></li><li title="Move">Move</li></ul>');
    const text = editor.surface.querySelector('[title="Move"]')!.firstChild!;
    document.getSelection()!.setBaseAndExtent(text, 1, text, 1);
    editor.format('indent', 1);
    const branches = [...editor.surface.querySelectorAll(':scope > ul > li > ul')].map((node) => ({ dir: node.getAttribute('dir'), text: node.textContent }));
    return { retained, item, unwrapped, bodies, converted, separate, branches };
  })).toEqual({ retained: ['rtl', 'rtl', 'rtl'], item: 'rtl', unwrapped: 'rtl', bodies: ['rtl', 'ltr'], converted: 'rtl', separate: 3, branches: [{ dir: 'ltr', text: 'Existing' }, { dir: 'rtl', text: 'Move' }] });
  await page.evaluate(() => { window.editor.setHTML('<p dir="rtl">#</p>'); window.editor.setSelection(1); });
  await page.keyboard.press('Space');
  await expect(content(page).locator('h1')).toHaveAttribute('dir', 'rtl');
  await page.evaluate(() => { window.editor.setHTML('<p dir="rtl">-</p>'); window.editor.setSelection(1); });
  await page.keyboard.press('Space');
  await expect(content(page).locator('li')).toHaveAttribute('dir', 'rtl');
  await page.evaluate(() => { window.editor.setHTML('<h2 dir="rtl">Title</h2>'); window.editor.setSelection(5); });
  await page.keyboard.press('Enter');
  await expect(content(page).locator('p')).toHaveAttribute('dir', 'rtl');
  await page.keyboard.type('Body');
  await expect(content(page).locator('p')).toHaveText('Body');
  const firstBody = '<ul><li dir="rtl"><p>A</p><h2 dir="ltr">B</h2></li></ul>';
  await page.evaluate((value) => {
    window.editor.setHTML(value);
    const text = window.editor.surface.querySelector('p')!.firstChild!;
    window.editor.surface.focus();
    document.getSelection()!.setBaseAndExtent(text, 0, text, 0);
  }, firstBody);
  await page.keyboard.press('Backspace');
  await expect(content(page).locator(':scope > p')).toHaveAttribute('dir', 'rtl');
  await expect(content(page).locator(':scope > p')).toHaveText('A');
  await expect(content(page).locator(':scope > h2')).toHaveAttribute('dir', 'ltr');
  await expect(content(page).locator(':scope > h2')).toHaveText('B');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(firstBody);
  expect(await page.evaluate(() => {
    const selection = document.getSelection()!;
    const text = window.editor.surface.querySelector('p')!.firstChild;
    return { caret: selection.isCollapsed && selection.anchorNode === text && selection.anchorOffset === 0, undo: window.editor.canUndo() };
  })).toEqual({ caret: true, undo: false });
  const emptyExit = '<ul><li dir="rtl"><p dir="ltr"><br></p></li></ul>';
  await page.evaluate((value) => {
    window.editor.setHTML(value);
    const paragraph = window.editor.surface.querySelector('p')!;
    window.editor.surface.focus();
    document.getSelection()!.setBaseAndExtent(paragraph, 0, paragraph, 0);
  }, emptyExit);
  await page.keyboard.press('Enter');
  await expect(content(page).locator(':scope > p')).toHaveAttribute('dir', 'ltr');
  await page.keyboard.type('X');
  await expect(content(page).locator(':scope > p')).toHaveText('X');
  await expect(content(page).locator(':scope > p')).toHaveCSS('direction', 'ltr');
  await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
  expect(await html(page)).toBe(emptyExit);
  expect(await page.evaluate(() => {
    const selection = document.getSelection()!;
    const paragraph = window.editor.surface.querySelector('p');
    return { caret: selection.isCollapsed && selection.anchorNode === paragraph && selection.anchorOffset === 0, undo: window.editor.canUndo() };
  })).toEqual({ caret: true, undo: false });
});

test('invalid and same-value direction commands retain focus, redo and pending typing marks', async ({ page }) => {
  await initialize(page, '<p dir="rtl">Text</p>');
  expect(await page.evaluate(() => {
    const editor = window.editor;
    editor.setSelection(1);
    window.textDirectionAPI.setDirection('ltr');
    editor.undo();
    editor.format('bold', true);
    const before = { html: editor.getHTML(), selection: editor.getSelection(), formats: editor.getFormats(), redo: editor.canRedo(), changes: window.changes.length };
    const values: unknown[] = ['auto', 'RTL', true, '', null];
    const rejected = values.map((value) => { try { window.textDirectionAPI.setDirection(value as never); return false; } catch { return true; } });
    window.textDirectionAPI.setDirection('rtl');
    const after = { html: editor.getHTML(), selection: editor.getSelection(), formats: editor.getFormats(), redo: editor.canRedo(), changes: window.changes.length };
    const outside = document.createElement('input');
    document.body.append(outside);
    outside.focus();
    document.getSelection()!.removeAllRanges();
    window.textDirectionAPI.setDirection('ltr');
    const unsupported = { focused: document.activeElement === outside, redo: editor.canRedo(), html: editor.getHTML() };
    let invalidOutside = false;
    try { window.textDirectionAPI.setDirection('auto' as never); } catch { invalidOutside = true; }
    outside.remove();
    return { rejected, unchanged: JSON.stringify(before) === JSON.stringify(after), pending: after.formats.bold, redo: before.redo, unsupported, invalidOutside };
  })).toEqual({ rejected: Array(5).fill(true), unchanged: true, pending: true, redo: true, unsupported: { focused: true, redo: true, html: '<p dir="rtl">Text</p>' }, invalidOutside: true });
});

test('read-only, composition, authoritative replacements and stale handles preserve per-editor ownership', async ({ page }) => {
  await initialize(page, '<p>First</p>');
  expect(await page.evaluate(async () => {
    const path = '/packages/plugins/dist/text-direction.js';
    const { textDirection, textDirectionCommands } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/plugins/text-direction');
    const host = document.createElement('div');
    document.body.append(host);
    const second = window.createEditor(host, { value: '<p>Second</p>', plugins: [textDirection()] });
    const api = textDirectionCommands(second);
    second.setSelection(1);
    api.setDirection('rtl');
    const first = window.editor.getHTML();
    second.setReadOnly(true);
    const readonly = api.getState();
    api.setDirection('ltr');
    let invalidReadonly = false;
    try { api.setDirection('auto' as never); } catch { invalidReadonly = true; }
    const guarded = second.getHTML();
    second.setHTML('<p dir="ltr">External</p>');
    second.setReadOnly(false);
    second.setSelection(1);
    second.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const composing = api.getState().disabled;
    api.setDirection('rtl');
    const during = second.getHTML();
    second.setHTML('<p>Authoritative</p>');
    second.setSelection(1);
    const resumed = api.getState();
    api.setDirection('rtl');
    second.destroy();
    let disposed = 0;
    for (const call of [api.getState, () => api.setDirection('rtl')]) {
      try { call(); } catch { disposed++; }
    }
    host.remove();
    return { first, readonly, invalidReadonly, guarded, composing, during, resumed, disposed };
  })).toEqual({ first: '<p>First</p>', readonly: { disabled: true, direction: 'rtl', mixed: false }, invalidReadonly: true, guarded: '<p dir="rtl">Second</p>', composing: true, during: '<p dir="ltr">External</p>', resumed: { disabled: false, direction: false, mixed: false }, disposed: 2 });
});

test('selective direction imports and factory calls are SSR-safe without DOM or network', () => {
  const result = execFileSync(process.execPath, ['--input-type=module', '--eval', `
    for (const key of ['document', 'window', 'customElements']) Object.defineProperty(globalThis, key, { get: () => { throw new Error('DOM accessed'); } });
    globalThis.fetch = () => { throw new Error('Network accessed'); };
    const { textDirection, textDirectionCommands } = await import('@morfira-dev/wysiwyg/plugins/text-direction');
    console.log(JSON.stringify({ plugin: textDirection().name, commands: typeof textDirectionCommands }));
  `], { cwd: process.cwd(), encoding: 'utf8' });
  expect(JSON.parse(result)).toEqual({ plugin: 'text-direction', commands: 'function' });
});
