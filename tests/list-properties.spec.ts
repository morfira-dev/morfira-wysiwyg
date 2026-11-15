import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import './list-properties.types.js';

const initialize = async (page: Page, value: string) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async (value) => {
    const path = '/packages/plugins/dist/list-properties.js';
    const { listProperties, listPropertyCommands } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/plugins/list-properties');
    window.dispose();
    const host = document.createElement('div');
    host.className = 'list-properties-test';
    document.body.append(host);
    window.changes = [];
    window.editor = window.createEditor(host, {
      value,
      schema: [{ name: 'test:task', kind: 'attributes', tag: 'li', attributes: { 'data-checklist-checked': { type: 'enum', values: ['false', 'true'] } } }],
      plugins: [listProperties()], onChange: (change) => window.changes.push(change),
    });
    window.listPropertyAPI = listPropertyCommands(window.editor);
    window.dispose = () => { window.editor.destroy(); host.remove(); };
  }, value);
};
const html = (page: Page) => page.evaluate(() => window.editor.getHTML());
const content = (page: Page) => page.locator('.list-properties-test .mw-content');

test('combined properties preserve rich backward multi-item selection and actual subtree identity with one undo', async ({ page }) => {
  const before = '<ol title="Owner" style="color: red"><li data-checklist-checked="true"><strong>Alpha</strong><ul><li>Branch</li></ul></li><li><em>Beta</em></li></ol><p>Keep</p>';
  await initialize(page, before);
  expect(await page.evaluate(() => {
    const editor = window.editor;
    const root = editor.surface;
    const nodes = [root.firstChild!, ...root.firstElementChild!.querySelectorAll('*'), root.lastChild!];
    const alpha = root.querySelector('strong')!.firstChild!;
    const beta = root.querySelector('em')!.firstChild!;
    root.focus();
    const selection = document.getSelection()!;
    selection.setBaseAndExtent(beta, 3, alpha, 1);
    editor.transact(() => { window.listPropertyAPI.setStart(-4); window.listPropertyAPI.setReversed(true); window.listPropertyAPI.setMarker('upper-roman'); });
    const state = window.listPropertyAPI.getState();
    return { state, retained: nodes.every((node) => node.isConnected && root.contains(node)), range: selection.anchorNode === beta && selection.focusNode === alpha && selection.anchorOffset === 3 && selection.focusOffset === 1, changes: window.changes.map((change) => change.source), color: (root.firstElementChild as HTMLElement).style.color };
  })).toEqual({ state: { disabled: false, kind: 'ordered', start: -4, reversed: true, marker: 'upper-roman' }, retained: true, range: true, changes: ['user'], color: 'red' });
  await expect(content(page).locator('[data-checklist-checked]')).toHaveAttribute('data-checklist-checked', 'true');
  const changed = await html(page);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => {
    const selection = document.getSelection()!;
    const root = window.editor.surface;
    return { backward: selection.anchorNode === root.querySelector('em')!.firstChild && selection.focusNode === root.querySelector('strong')!.firstChild && selection.anchorOffset === 3 && selection.focusOffset === 1, undo: window.editor.canUndo() };
  })).toEqual({ backward: true, undo: false });
  await page.evaluate(() => window.editor.redo());
  expect(await html(page)).toBe(changed);
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    const selection = document.getSelection()!;
    return { backward: selection.anchorNode === root.querySelector('em')!.firstChild && selection.focusNode === root.querySelector('strong')!.firstChild && selection.anchorOffset === 3 && selection.focusOffset === 1 };
  })).toEqual({ backward: true });
  expect(await page.evaluate(() => {
    window.editor.transact(() => { window.listPropertyAPI.setStart(false); window.listPropertyAPI.setReversed(false); window.listPropertyAPI.setMarker(false); });
    return { state: window.listPropertyAPI.getState(), color: (window.editor.surface.firstElementChild as HTMLElement).style.color };
  })).toEqual({ state: { disabled: false, kind: 'ordered', start: false, reversed: false, marker: false }, color: 'red' });
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(changed);
  // Property selection may cross a protected branch. Native replacement across
  // a first item's nested list is intentionally blocked by list-selection.md;
  // continued typing uses an ordinary caret without broadening that contract.
  await page.evaluate(() => {
    const text = window.editor.surface.querySelector('strong')!.firstChild!;
    document.getSelection()!.setBaseAndExtent(text, 2, text, 2);
  });
  await page.keyboard.type('X');
  await expect(content(page).locator('strong')).toHaveText('AlXpha');
  await expect(content(page).locator(':scope > ol')).toHaveAttribute('start', '-4');
  await expect(content(page).locator(':scope > ol')).toHaveAttribute('reversed', '');
});

test('innermost empty items and list offsets resolve locally while merged-cell boundaries remain isolated', async ({ page }) => {
  await initialize(page, '<ul title="Outer"><li>Owner<ol title="Inner"><li title="Empty"><br></li><li>Child</li></ol></li></ul><table><tbody><tr><td rowspan="2"><ul title="Cell"><li>Cell</li></ul></td><td><ul title="Other"><li>Other</li></ul></td></tr><tr><td>Keep</td></tr></tbody></table>');
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    root.focus();
    const empty = root.querySelector('[title="Empty"]')!;
    const selection = document.getSelection()!;
    selection.setBaseAndExtent(empty, 0, empty, 0);
    window.listPropertyAPI.setStart(-2);
    const emptyState = window.listPropertyAPI.getState();
    const inner = root.querySelector('[title="Inner"]')!;
    selection.setBaseAndExtent(inner, 1, inner, 0);
    window.listPropertyAPI.setReversed(true);
    window.listPropertyAPI.setMarker('lower-alpha');
    const offsetState = window.listPropertyAPI.getState();
    const outerText = root.querySelector('[title="Outer"] > li')!.firstChild!;
    selection.setBaseAndExtent(empty, 0, outerText, 1);
    const crossLevelDisabled = window.listPropertyAPI.getState().disabled;
    const cellText = root.querySelector('[title="Cell"] li')!.firstChild!;
    selection.setBaseAndExtent(cellText, 1, cellText, 1);
    window.listPropertyAPI.setMarker('square');
    const cellState = window.listPropertyAPI.getState();
    const otherText = root.querySelector('[title="Other"] li')!.firstChild!;
    selection.setBaseAndExtent(cellText, 1, otherText, 2);
    const before = root.innerHTML;
    const disabled = window.listPropertyAPI.getState().disabled;
    window.listPropertyAPI.setMarker('circle');
    return { emptyState, offsetState, crossLevelDisabled, cellState, disabled, crossCellUnchanged: before === root.innerHTML, outerStyle: root.querySelector('[title="Outer"]')!.getAttribute('style'), otherStyle: root.querySelector('[title="Other"]')!.getAttribute('style') };
  })).toEqual({ emptyState: { disabled: false, kind: 'ordered', start: -2, reversed: false, marker: false }, offsetState: { disabled: false, kind: 'ordered', start: -2, reversed: true, marker: 'lower-alpha' }, crossLevelDisabled: true, cellState: { disabled: false, kind: 'bullet', start: false, reversed: false, marker: 'square' }, disabled: true, crossCellUnchanged: true, outerStyle: null, otherStyle: null });
  await expect(content(page).locator('td[rowspan="2"]')).toHaveText('Cell');
  await expect(content(page).locator('td')).toHaveCount(3);
});

test('native Enter preserves properties and structural indentation and joining respect explicit numbering boundaries', async ({ page }) => {
  await initialize(page, '<ol start="4" reversed="" style="list-style-type: lower-roman"><li>AB</li><li>CD</li></ol>');
  await page.evaluate(() => window.editor.setSelection(1));
  await page.keyboard.press('Enter');
  await expect(content(page).locator('ol')).toHaveAttribute('start', '4');
  await expect(content(page).locator('ol')).toHaveAttribute('reversed', '');
  await expect(content(page).locator('ol')).toHaveCSS('list-style-type', 'lower-roman');
  await expect(content(page).locator('ol > li')).toHaveCount(3);
  await page.keyboard.type('X');
  await expect(content(page).locator('ol > li').nth(1)).toHaveText('XB');
  const nested = '<ol start="4" reversed=""><li>Parent<ol start="9"><li>Existing</li></ol></li><li title="Move">Move</li></ol>';
  await page.evaluate((value) => {
    window.editor.setHTML(value);
    const text = window.editor.surface.querySelector('[title="Move"]')!.firstChild!;
    document.getSelection()!.setBaseAndExtent(text, 1, text, 1);
    window.editor.format('indent', 1);
  }, nested);
  const branches = content(page).locator(':scope > ol > li > ol');
  await expect(branches).toHaveCount(2);
  await expect(branches.nth(0)).toHaveAttribute('start', '9');
  await expect(branches.nth(0)).toHaveText('Existing');
  await expect(branches.nth(1)).toHaveAttribute('start', '4');
  await expect(branches.nth(1)).toHaveAttribute('reversed', '');
  await expect(branches.nth(1)).toHaveText('Move');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(nested);
  await page.evaluate(() => {
    window.editor.setHTML('<ol start="4"><li>A</li></ol><p>B</p><ol reversed=""><li>C</li></ol>');
    const text = window.editor.surface.querySelector('p')!.firstChild!;
    document.getSelection()!.setBaseAndExtent(text, 0, text, 1);
    window.editor.format('list', 'ordered');
  });
  await expect(content(page).locator(':scope > ol')).toHaveCount(3);
  await expect(content(page)).toHaveText('ABC');
  const ordered = '<ol title="Convert" start="4" reversed="" style="list-style-type: lower-roman; color: red"><li>AB</li></ol>';
  await page.evaluate((value) => {
    window.editor.setHTML(value);
    window.editor.setSelection(0, 2);
    window.editor.format('list', 'bullet');
  }, ordered);
  expect(await page.evaluate(() => {
    const list = window.editor.surface.querySelector('ul')!;
    return { lists: window.editor.surface.querySelectorAll('ul,ol').length, start: list.getAttribute('start'), reversed: list.hasAttribute('reversed'), marker: list.style.listStyleType, color: list.style.color, text: list.textContent };
  })).toEqual({ lists: 1, start: null, reversed: false, marker: '', color: 'red', text: 'AB' });
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(ordered);
  const bullet = '<ul title="Convert" style="list-style-type: square; color: red"><li>CD</li></ul>';
  await page.evaluate((value) => {
    window.editor.setHTML(value);
    window.editor.setSelection(0, 2);
    window.editor.format('list', 'ordered');
  }, bullet);
  expect(await page.evaluate(() => {
    const list = window.editor.surface.querySelector('ol')!;
    return { lists: window.editor.surface.querySelectorAll('ul,ol').length, start: list.getAttribute('start'), reversed: list.hasAttribute('reversed'), marker: list.style.listStyleType, color: list.style.color, text: list.textContent };
  })).toEqual({ lists: 1, start: null, reversed: false, marker: '', color: 'red', text: 'CD' });
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(bullet);
});

test('plugin-independent codecs and paste canonicalize reversed presence and bounded markers while invalid JSON remains atomic', async ({ page }) => {
  await initialize(page, '<p>Target</p>');
  expect(await page.evaluate(async () => {
    const path = '/packages/core/dist/index.js';
    const { createDocumentSchema, sanitizeHTML } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg');
    const schema = createDocumentSchema();
    const input = '<ol start="-2147483648" reversed="false" style="list-style-type: UPPER-ALPHA; color: red"><li>Ordered</li></ol><ul style="list-style-type: square"><li>Bullet</li></ul>';
    const normalized = schema.sanitizeHTML(input);
    window.editor.destroy();
    const host = document.createElement('div');
    document.body.append(host);
    const editor = window.createEditor(host, { value: normalized });
    editor.setJSON(editor.getJSON());
    const roundTrip = editor.getHTML();
    const before = editor.getHTML();
    const invalid = [
      { tag: 'ul', attributes: { reversed: '' } },
      { tag: 'p', attributes: { reversed: '' } },
      { tag: 'ol', attributes: { reversed: 'false' } },
      { tag: 'ol', attributes: { reversed: true } },
      { tag: 'ol', attributes: { start: '2147483648' } },
    ];
    const rejected = invalid.map(({ tag, attributes }) => {
      try { editor.setJSON({ version: 1, children: [{ type: 'element', tag, attributes, children: [] }] } as never); return false; }
      catch { return editor.getHTML() === before && !editor.canUndo(); }
    });
    editor.setJSON({ version: 1, children: [{ type: 'element', tag: 'ol', attributes: { start: '2147483647', reversed: '' }, children: [{ type: 'element', tag: 'li', attributes: {}, children: [{ type: 'text', text: 'Maximum' }] }] }] });
    const maximum = editor.surface.querySelector('ol')!.getAttribute('start');
    editor.setHTML('<p>Target</p>');
    editor.setSelection(0, 6);
    const data = new DataTransfer();
    data.setData('text/html', input);
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: data });
    editor.surface.dispatchEvent(event);
    const pasted = { reversed: editor.surface.querySelector('ol')!.getAttribute('reversed'), start: editor.surface.querySelector('ol')!.getAttribute('start'), marker: editor.surface.querySelector('ol')!.style.listStyleType, bullet: editor.surface.querySelector('ul')!.style.listStyleType };
    const malicious = ['url(/marker.svg)', 'var(--marker)', 'symbols(cyclic "x")', '"custom"', 'disc\\', 'unknown-counter'];
    const filtered = malicious.map((marker) => {
      const output = sanitizeHTML(`<ul style='list-style-type: ${marker}; color: red'><li>Safe</li></ul>`);
      return { markerRemoved: !output.includes('list-style-type'), textRetained: output.includes('<li>Safe</li>'), colorRetained: output.includes('color: red') };
    });
    const wrongKinds = sanitizeHTML('<ul style="list-style-type: upper-roman; color: red" reversed><li>Bullet</li></ul><ol style="list-style-type: disc"><li>Ordered</li></ol><p reversed style="list-style-type: circle">Plain</p>');
    editor.destroy();
    host.remove();
    return { canonical: normalized.includes('reversed=""') && normalized.includes('list-style-type: upper-alpha'), roundTrip: roundTrip === normalized, rejected, maximum, pasted, filtered, wrongKinds };
  })).toEqual({ canonical: true, roundTrip: true, rejected: Array(5).fill(true), maximum: '2147483647', pasted: { reversed: '', start: '-2147483648', marker: 'upper-alpha', bullet: 'square' }, filtered: Array.from({ length: 6 }, () => ({ markerRemoved: true, textRetained: true, colorRetained: true })), wrongKinds: '<ul style="color: red"><li>Bullet</li></ul><ol><li>Ordered</li></ol><p>Plain</p>' });
});

test('invalid, unsupported and idempotent commands preserve redo and pending marks, including malformed shallow targets', async ({ page }) => {
  await initialize(page, '<ul><li>Item</li></ul><ul><li>Other</li></ul>');
  expect(await page.evaluate(() => {
    const editor = window.editor;
    const api = window.listPropertyAPI;
    editor.setSelection(1);
    api.setMarker('square');
    editor.undo();
    editor.format('bold', true);
    const before = { html: editor.getHTML(), selection: editor.getSelection(), formats: editor.getFormats(), redo: editor.canRedo(), changes: window.changes.length };
    const calls = [() => api.setStart(2147483648), () => api.setStart(1.5), () => api.setReversed('false' as never), () => api.setMarker('url(/bad)' as never)];
    const invalid = calls.map((call) => { try { call(); return false; } catch { return true; } });
    api.setMarker(false);
    api.setMarker('lower-roman');
    api.setStart(4);
    api.setReversed(true);
    const after = { html: editor.getHTML(), selection: editor.getSelection(), formats: editor.getFormats(), redo: editor.canRedo(), changes: window.changes.length };
    const root = editor.surface;
    const list = root.querySelector('ul')!;
    const malformed = document.createElement('p');
    malformed.textContent = 'Malformed';
    list.append(malformed);
    const shallowBefore = root.innerHTML;
    const barrier = api.getState().disabled;
    api.setMarker('circle');
    const shallowPreserved = root.innerHTML === shallowBefore && editor.canRedo() && editor.getFormats().bold === true;
    malformed.remove();
    const selection = document.getSelection()!;
    const item = list.querySelector('li')!;
    item.setAttribute('data-mw-node', 'app:owner');
    const semanticDisabled = api.getState().disabled;
    item.removeAttribute('data-mw-node');
    const table = document.createElement('table');
    const cell = table.insertRow().insertCell();
    cell.textContent = 'Nested cell';
    item.append(table);
    selection.setBaseAndExtent(cell.firstChild!, 1, cell.firstChild!, 1);
    const nestedCellDisabled = api.getState().disabled;
    table.remove();
    selection.setBaseAndExtent(root, 0, root, 0);
    const rootDisabled = api.getState().disabled;
    const texts = root.querySelectorAll('li');
    selection.setBaseAndExtent(texts[0].firstChild!, 1, texts[1].firstChild!, 1);
    const crossListDisabled = api.getState().disabled;
    return { invalid, unchanged: JSON.stringify(before) === JSON.stringify(after), redo: before.redo, pending: after.formats.bold, barrier, shallowPreserved, semanticDisabled, nestedCellDisabled, rootDisabled, crossListDisabled };
  })).toEqual({ invalid: Array(4).fill(true), unchanged: true, redo: true, pending: true, barrier: true, shallowPreserved: true, semanticDisabled: true, nestedCellDisabled: true, rootDisabled: true, crossListDisabled: true });
});

test('read-only, composition, authoritative replacement and per-instance disposal retain explicit state', async ({ page }) => {
  await initialize(page, '<ol><li>First</li></ol>');
  expect(await page.evaluate(async () => {
    const path = '/packages/plugins/dist/list-properties.js';
    const { listProperties, listPropertyCommands } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/plugins/list-properties');
    const host = document.createElement('div');
    document.body.append(host);
    const second = window.createEditor(host, { value: '<ol reversed=""><li>Second</li></ol>', plugins: [listProperties()] });
    const api = listPropertyCommands(second);
    second.setSelection(1);
    api.setStart(0);
    const actual = api.getState();
    const first = window.editor.getHTML();
    second.setReadOnly(true);
    const readonly = api.getState().disabled;
    const before = second.getHTML();
    api.setStart(9);
    api.setReversed(false);
    const guarded = before === second.getHTML();
    second.setHTML('<ol start="5"><li>External</li></ol>');
    second.setReadOnly(false);
    second.setSelection(1);
    second.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const composing = api.getState().disabled;
    api.setMarker('lower-alpha');
    const during = second.getHTML();
    second.setHTML('<ul><li>Authoritative</li></ul>');
    second.setSelection(1);
    const resumed = api.getState();
    api.setMarker('circle');
    second.destroy();
    let disposed = 0;
    for (const call of [api.getState, () => api.setStart(2)]) {
      try { call(); } catch { disposed++; }
    }
    host.remove();
    return { actual, first, readonly, guarded, composing, during, resumed, disposed };
  })).toEqual({ actual: { disabled: false, kind: 'ordered', start: 0, reversed: true, marker: false }, first: '<ol><li>First</li></ol>', readonly: true, guarded: true, composing: true, during: '<ol start="5"><li>External</li></ol>', resumed: { disabled: false, kind: 'bullet', start: false, reversed: false, marker: false }, disposed: 2 });
});

test('selective list-property imports and plugin factories are SSR-safe without DOM or network access', () => {
  const result = execFileSync(process.execPath, ['--input-type=module', '--eval', `
    for (const key of ['document', 'window', 'customElements']) Object.defineProperty(globalThis, key, { get: () => { throw new Error('DOM accessed'); } });
    globalThis.fetch = () => { throw new Error('Network accessed'); };
    const { listProperties, listPropertyCommands } = await import('@morfira-dev/wysiwyg/plugins/list-properties');
    console.log(JSON.stringify({ plugin: listProperties().name, commands: typeof listPropertyCommands }));
  `], { cwd: process.cwd(), encoding: 'utf8' });
  expect(JSON.parse(result)).toEqual({ plugin: 'list-properties', commands: 'function' });
});
