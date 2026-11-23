import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import './table-properties.types.js';

const mergedTable = '<table title="Owner"><tbody><tr><td rowspan="2" title="A"><p><strong>Alpha</strong></p></td><td title="B"><p><em>Beta</em></p></td><td title="C"><p>Gamma</p></td></tr><tr><td title="D"><p>Delta</p></td><td title="E"><p>Echo</p></td></tr></tbody></table><p>After</p>';
const ordinaryTable = '<table title="Owner"><tbody><tr><td title="A"><p>Alpha</p></td><td title="B"><p>Beta</p></td><td title="C"><p>Gamma</p></td></tr><tr><td title="D"><p>Delta</p></td><td title="E"><p>Echo</p></td><td title="F"><p>Foxtrot</p></td></tr></tbody></table><p>After</p>';

const initialize = async (page: Page, value = mergedTable, install = true) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async ({ value, install }) => {
    window.dispose();
    const path = '/packages/plugins/dist/table-properties.js';
    const { tableProperties, tablePropertyCommands } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/plugins/table-properties');
    const tablesPath = '/packages/plugins/dist/tables.js';
    const { getTableSelection } = await import(/* @vite-ignore */ tablesPath) as typeof import('@morfira-dev/wysiwyg/plugins/tables');
    const host = document.createElement('div');
    host.className = 'table-properties-test';
    document.body.append(host);
    window.changes = [];
    window.editor = window.createEditor(host, { value, plugins: install ? [window.createTables(), tableProperties()] : [], onChange: (change) => window.changes.push(change) });
    if (install) {
      window.tablePropertiesAPI = tablePropertyCommands(window.editor);
      window.propertiesTableAPI = window.tableCommands(window.editor);
      window.propertiesSelection = () => getTableSelection(window.editor);
    }
    const cell = window.editor.surface.querySelector('td p,th p,td,th');
    if (cell) {
      const range = document.createRange();
      range.selectNodeContents(cell);
      range.collapse(true);
      window.editor.surface.focus();
      document.getSelection()!.removeAllRanges();
      document.getSelection()!.addRange(range);
    }
    window.dispose = () => { window.editor.destroy(); host.remove(); };
  }, { value, install });
};
const html = (page: Page) => page.evaluate(() => window.editor.getHTML());
const content = (page: Page) => page.locator('.table-properties-test .mw-content');

// The selection rectangle includes the complete rowspan origin, not only unmerged cells.
test('one table/cell patch keeps actual merged content and logical/native selection with exact Undo and Redo', async ({ page }) => {
  await initialize(page);
  const before = await html(page);
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    const first = root.querySelector('strong')!.firstChild!;
    root.focus();
    const native = document.getSelection()!;
    native.setBaseAndExtent(first, 4, first, 1);
    window.propertiesTableAPI.select({ row: 0, column: 0 }, { row: 0, column: 1 });
    const original = window.propertiesSelection()!;
    const nodes = [root.firstChild!, ...root.querySelectorAll('*')];
    window.tablePropertiesAPI.update({ width: '60%', alignment: 'center', cellBackground: '#abcdef', cellBorder: 'navy', cellVerticalAlign: 'middle' });
    const current = window.propertiesSelection()!;
    const state = window.tablePropertiesAPI.getState();
    return {
      state: { disabled: state.disabled, width: state.width, alignment: state.alignment, vertical: state.cellVerticalAlign },
      cells: current.cells.length, explicit: current.explicit, rectangle: current.rectangle,
      sameCells: current.cells.every((cell, index) => cell === original.cells[index]),
      retained: nodes.every((node) => node.isConnected && root.contains(node)),
      selection: native.anchorNode === first && native.focusNode === first && native.anchorOffset === 4 && native.focusOffset === 1,
      colors: current.cells.every((cell) => cell.style.backgroundColor === state.cellBackground && cell.style.borderColor === state.cellBorder),
      unrelated: [...root.querySelectorAll<HTMLTableCellElement>('[title="C"],[title="E"]')].every((cell) => !cell.getAttribute('style')),
      changes: window.changes.map((change) => change.source),
    };
  })).toEqual({ state: { disabled: false, width: '60%', alignment: 'center', vertical: 'middle' }, cells: 3, explicit: true, rectangle: { top: 0, left: 0, bottom: 1, right: 1 }, sameCells: true, retained: true, selection: true, colors: true, unrelated: true, changes: ['user'] });
  const changed = await html(page);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => {
    const first = window.editor.surface.querySelector('strong')!.firstChild!;
    const selection = document.getSelection()!;
    return { backward: selection.anchorNode === first && selection.focusNode === first && selection.anchorOffset === 4 && selection.focusOffset === 1, undo: window.editor.canUndo() };
  })).toEqual({ backward: true, undo: false });
  await page.evaluate(() => window.editor.redo());
  expect(await html(page)).toBe(changed);
});

test('mixed cell values reset independently and width writes remove legacy fallback while preserving other properties', async ({ page }) => {
  await initialize(page, '<table width="240" style="margin-left: auto; margin-right: 0px; color: purple"><tbody><tr><td style="background-color: red; border-color: blue; vertical-align: top; color: green"><p>A</p></td><td style="background-color: lime; vertical-align: bottom"><p>B</p></td></tr></tbody></table>');
  expect(await page.evaluate(() => {
    window.propertiesTableAPI.select({ row: 0, column: 0 }, { row: 0, column: 1 });
    const before = window.tablePropertiesAPI.getState();
    window.tablePropertiesAPI.update({ width: '240px' });
    const table = window.editor.surface.querySelector('table')!;
    const canonicalWidth = { css: table.style.width, legacy: table.hasAttribute('width') };
    window.tablePropertiesAPI.update({ width: false, alignment: false, cellBackground: false, cellBorder: false, cellVerticalAlign: false });
    const after = window.tablePropertiesAPI.getState();
    return {
      before: { width: before.width, alignment: before.alignment, background: before.cellBackground, border: before.cellBorder, vertical: before.cellVerticalAlign },
      canonicalWidth, after,
      tableColor: table.style.color,
      firstColor: table.querySelector('td')!.style.color,
      legacy: table.hasAttribute('width'),
      ownMargins: [table.style.marginLeft, table.style.marginRight],
    };
  })).toEqual({ before: { width: '240px', alignment: 'right', background: 'mixed', border: 'mixed', vertical: 'mixed' }, canonicalWidth: { css: '240px', legacy: false }, after: { disabled: false, width: false, alignment: false, cellBackground: false, cellBorder: false, cellVerticalAlign: false, headerRow: false, headerColumn: false, caption: false, rowMinHeight: false, cellPadding: false, cellBorderWidth: false, cellBorderStyle: false, cellTextAlign: false, cellDirection: false }, tableColor: 'purple', firstColor: 'green', legacy: false, ownMargins: ['', ''] });
  await page.evaluate(() => window.editor.undo());
  await expect(content(page).locator('table')).toHaveCSS('width', '240px');
  await page.evaluate(() => window.editor.undo());
  await expect(content(page).locator('table')).toHaveAttribute('width', '240');
  expect(await page.evaluate(() => {
    const editor = window.editor;
    editor.setHTML('<table style="width: 12em"><tbody><tr><td><p>Imported width</p></td></tr></tbody></table>');
    const range = document.createRange();
    range.selectNodeContents(editor.surface.querySelector('td p')!);
    range.collapse(true);
    editor.surface.focus();
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    window.tablePropertiesAPI.update({ cellBorder: 'navy' });
    return { reported: window.tablePropertiesAPI.getState().width, stored: editor.surface.querySelector('table')!.style.width };
  })).toEqual({ reported: '12em', stored: '12em' });
});

test('empty and idempotent patches preserve redo and pending caret formatting', async ({ page }) => {
  await initialize(page, ordinaryTable);
  expect(await page.evaluate(() => {
    const editor = window.editor;
    window.tablePropertiesAPI.update({ width: '50%', cellBackground: 'red' });
    editor.undo();
    editor.format('bold', true);
    const before = { html: editor.getHTML(), formats: editor.getFormats(), selection: editor.getSelection(), changes: window.changes.length };
    window.tablePropertiesAPI.update({});
    window.tablePropertiesAPI.update({ width: false, alignment: false, cellBackground: false, cellBorder: false, cellVerticalAlign: false });
    const after = { html: editor.getHTML(), formats: editor.getFormats(), selection: editor.getSelection(), changes: window.changes.length };
    return { unchanged: JSON.stringify(before) === JSON.stringify(after), redo: editor.canRedo(), bold: editor.getFormats().bold };
  })).toEqual({ unchanged: true, redo: true, bold: true });
});

test('patch validation failures preserve selection and history before any property mutation', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(() => {
    const editor = window.editor;
    const api = window.tablePropertiesAPI;
    // Retain a real redo entry so a failed patch cannot silently clear history.
    api.update({ width: '60%' });
    editor.undo();
    const text = editor.surface.querySelector('strong')!.firstChild!;
    const native = document.getSelection()!;
    native.setBaseAndExtent(text, 4, text, 1);
    window.propertiesTableAPI.select({ row: 0, column: 0 }, { row: 0, column: 1 });
    const original = editor.getHTML();
    const selected = window.propertiesSelection()!;
    const before = { undo: editor.canUndo(), redo: editor.canRedo(), changes: window.changes.length };
    const untouched = () => editor.getHTML() === original && editor.canUndo() === before.undo
      && editor.canRedo() === before.redo && window.changes.length === before.changes
      && native.anchorNode === text && native.focusNode === text && native.anchorOffset === 4 && native.focusOffset === 1
      && window.propertiesSelection()?.cells.every((cell, index) => cell === selected.cells[index]) === true
      && window.propertiesSelection()?.cells.length === selected.cells.length;
    const failure = new Error('Application property getter failed.');
    const throwing = { cellPadding: '8px' };
    Object.defineProperty(throwing, 'width', { enumerable: true, get: () => { throw failure; } });
    let getterFailure = false;
    try { api.update(throwing); }
    catch (error) { getterFailure = error === failure; }
    const afterGetter = untouched();
    let reads = 0;
    const unknownFailures = ['unknown', Symbol('unknown')].map((key) => {
      const patch = Object.create(null);
      Object.defineProperty(patch, 'cellPadding', { enumerable: true, get: () => { reads++; return '8px'; } });
      Object.defineProperty(patch, key, { enumerable: true, value: 'ignored' });
      let rejected = false;
      try { api.update(patch); }
      catch (error) { rejected = error instanceof TypeError; }
      return rejected && untouched();
    });
    return { getterFailure, afterGetter, unknownFailures, reads, redo: editor.canRedo() };
  });
  expect(result).toEqual({ getterFailure: true, afterGetter: true, unknownFailures: [true, true], reads: 0, redo: true });
});

test('invalid complete patches throw before eligibility and never partly apply during read-only or missing selection', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(() => {
    const editor = window.editor;
    const before = editor.getHTML();
    const invalid: unknown[] = [null, [], new Date(), { width: undefined }, { padding: '2px' }, { width: '0%' }, { width: '39px' }, { width: '4001px' }, { width: '1.5%' }, { width: 'calc(50%)' }, { alignment: 'justify' }, { cellVerticalAlign: 'baseline' }, { width: '70%', cellBackground: 'red; width: 2px' }, { cellBorder: 'url(/properties-probe)' }, { cellBackground: 'a'.repeat(101) }];
    const failures = invalid.map((patch) => {
      try { window.tablePropertiesAPI.update(patch as never); return false; }
      catch { return true; }
    });
    editor.setReadOnly(true);
    window.tablePropertiesAPI.update({ width: '70%' });
    let readonlyThrows = false;
    try { window.tablePropertiesAPI.update({ width: undefined } as never); } catch { readonlyThrows = true; }
    const disabled = window.tablePropertiesAPI.getState().disabled;
    editor.setReadOnly(false);
    const paragraph = editor.surface.lastElementChild!;
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    range.collapse(true);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    window.tablePropertiesAPI.update({ width: '70%' });
    let missingThrows = false;
    try { window.tablePropertiesAPI.update({ unknown: true } as never); } catch { missingThrows = true; }
    return { failures, readonlyThrows, missingThrows, disabled, unchanged: editor.getHTML() === before, undo: editor.canUndo(), changes: window.changes.length };
  })).toEqual({ failures: Array(15).fill(true), readonlyThrows: true, missingThrows: true, disabled: true, unchanged: true, undo: false, changes: 0 });
});

test('composition guards mutations and external replacement permits a fresh target without a stale composition tail', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(() => {
    const editor = window.editor;
    const before = editor.getHTML();
    editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const disabled = window.tablePropertiesAPI.getState().disabled;
    window.tablePropertiesAPI.update({ width: '75%', cellVerticalAlign: 'bottom' });
    const unchanged = editor.getHTML() === before;
    editor.setHTML('<table><tbody><tr><td><p>Replacement</p></td></tr></tbody></table>');
    const paragraph = editor.surface.querySelector('td p')!;
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    range.collapse(true);
    editor.surface.focus();
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    window.tablePropertiesAPI.update({ width: '55%' });
    return { disabled, unchanged, state: window.tablePropertiesAPI.getState(), text: paragraph.textContent, changes: window.changes.map((change) => change.source), undo: editor.canUndo() };
  })).toEqual({ disabled: true, unchanged: true, state: { disabled: false, width: '55%', alignment: false, cellBackground: false, cellBorder: false, cellVerticalAlign: false, headerRow: false, headerColumn: false, caption: false, rowMinHeight: false, cellPadding: false, cellBorderWidth: false, cellBorderStyle: false, cellTextAlign: false, cellDirection: false }, text: 'Replacement', changes: ['api', 'user'], undo: true });
});

test('protected, semantic, foreign, nested, incomplete and overlapping table targets refuse atomically', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(({ mergedTable }) => {
    const outcomes: boolean[] = [];
    for (const shape of ['protected-cell', 'protected-owner', 'semantic', 'foreign', 'nested', 'hole', 'overlap']) {
      const editor = window.editor;
      const overlap = '<table><tbody><tr><td><p>A</p></td><td rowspan="2"><p>B</p></td></tr><tr><td colspan="2"><p>C</p></td></tr></tbody></table>';
      editor.setHTML(shape === 'overlap' ? overlap : mergedTable);
      const table = editor.surface.querySelector('table')!;
      const cell = table.querySelector('td')!;
      if (shape === 'protected-cell') cell.setAttribute('contenteditable', 'false');
      if (shape === 'protected-owner') table.setAttribute('contenteditable', 'false');
      if (shape === 'semantic') table.setAttribute('data-mw-node', 'application-owned');
      if (shape === 'foreign') cell.append(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
      if (shape === 'nested') cell.insertAdjacentHTML('beforeend', '<table><tbody><tr><td><p>Nested</p></td></tr></tbody></table>');
      if (shape === 'hole') table.rows[1].lastElementChild!.remove();
      const range = document.createRange();
      range.selectNodeContents(cell.querySelector('p')!);
      range.collapse(true);
      editor.surface.focus();
      document.getSelection()!.removeAllRanges();
      document.getSelection()!.addRange(range);
      const before = editor.surface.innerHTML;
      const state = window.tablePropertiesAPI.getState();
      window.tablePropertiesAPI.update({ width: '60%', cellBackground: 'red' });
      outcomes.push(state.disabled && editor.surface.innerHTML === before && !editor.canUndo());
    }
    return outcomes;
  }, { mergedTable })).toEqual(Array(7).fill(true));
});

test('state reads are pure, marker attributes confer no authority, and native cross-cell ranges are refused', async ({ page }) => {
  await initialize(page, ordinaryTable);
  expect(await page.evaluate(() => {
    const editor = window.editor;
    const table = editor.surface.querySelector('table')!;
    const cells = [...table.querySelectorAll('td')];
    for (const cell of cells) cell.setAttribute('data-mw-selected', 'true');
    const native = document.getSelection()!;
    const before = editor.getHTML();
    const range = native.getRangeAt(0).cloneRange();
    const focus = document.activeElement;
    const one = window.tablePropertiesAPI.getState();
    const two = window.tablePropertiesAPI.getState();
    const pure = editor.getHTML() === before && !editor.canUndo() && document.activeElement === focus && native.getRangeAt(0).compareBoundaryPoints(Range.START_TO_START, range) === 0 && JSON.stringify(one) === JSON.stringify(two);
    window.tablePropertiesAPI.update({ cellBackground: 'red' });
    const styled = cells.map((cell) => Boolean(cell.style.backgroundColor));
    editor.undo();
    const first = editor.surface.querySelector('td p')!.firstChild!;
    const second = editor.surface.querySelectorAll('td p')[1].firstChild!;
    native.setBaseAndExtent(first, 1, second, 1);
    const crossBefore = editor.getHTML();
    const disabled = window.tablePropertiesAPI.getState().disabled;
    window.tablePropertiesAPI.update({ width: '90%', cellVerticalAlign: 'bottom' });
    return { pure, explicit: window.propertiesSelection()?.explicit ?? false, styled, disabled, unchanged: editor.getHTML() === crossBefore, redo: editor.canRedo() };
  })).toEqual({ pure: true, explicit: false, styled: [true, false, false, false, false, false], disabled: true, unchanged: true, redo: true });
});

test('instances and authoritative replacements remain isolated; retained APIs fail after disposal', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(async () => {
    const path = '/packages/plugins/dist/table-properties.js';
    const { tableProperties, tablePropertyCommands } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/plugins/table-properties');
    const first = window.editor;
    const firstHTML = first.getHTML();
    const host = document.createElement('div');
    document.body.append(host);
    const second = window.createEditor(host, { value: '<table><tbody><tr><td><p>Second</p></td></tr></tbody></table>', plugins: [window.createTables(), tableProperties()] });
    const api = tablePropertyCommands(second);
    const selectSecond = () => {
      const range = document.createRange();
      range.selectNodeContents(second.surface.querySelector('td p')!);
      range.collapse(true);
      second.surface.focus();
      document.getSelection()!.removeAllRanges();
      document.getSelection()!.addRange(range);
    };
    selectSecond();
    api.update({ width: '333px' });
    window.tablePropertiesAPI.update({ width: '70%' });
    const isolated = first.getHTML() === firstHTML;
    second.setHTML('<table><tbody><tr><td><p>External</p></td></tr></tbody></table>');
    const reset = !second.canUndo();
    selectSecond();
    api.update({ cellBorder: 'blue' });
    const state = api.getState();
    second.destroy();
    let disposed = 0;
    for (const call of [api.getState, () => api.update({ width: '40%' }), () => tablePropertyCommands(second)]) {
      try { call(); } catch { disposed++; }
    }
    host.remove();
    return { isolated, reset, width: state.width, border: state.cellBorder, disposed };
  })).toEqual({ isolated: true, reset: true, width: false, border: 'blue', disposed: 3 });
});

test('table margins and cell vertical alignment roundtrip through HTML and JSON without the optional plugin', async ({ page }) => {
  const value = '<table style="width: 70%; margin-left: auto; margin-right: 0px"><tbody><tr><td style="vertical-align: middle; background-color: red; border-color: blue"><p>Cell</p></td></tr></tbody></table>';
  await initialize(page, value, false);
  expect(await page.evaluate(() => {
    const editor = window.editor;
    const expected = editor.getHTML();
    const json = editor.getJSON();
    editor.setHTML('<p>Temporary</p>');
    editor.setJSON(json);
    const table = editor.surface.querySelector('table')!;
    const cell = table.querySelector('td')!;
    const afterJSON = editor.getHTML();
    editor.setHTML(afterJSON);
    return { version: json.version, same: editor.getHTML() === expected && afterJSON === expected, width: table.style.width, left: table.style.marginLeft, right: table.style.marginRight, vertical: cell.style.verticalAlign, background: cell.style.backgroundColor, border: cell.style.borderColor, undo: editor.canUndo() };
  })).toEqual({ version: 1, same: true, width: '70%', left: 'auto', right: '0px', vertical: 'middle', background: 'red', border: 'blue', undo: false });
});

test('codec limits new styles by tag and value and rejects resource/declaration injection in HTML and JSON', async ({ page }) => {
  let requests = 0;
  await page.route('**/table-properties-probe*', async (route) => { requests++; await route.abort(); });
  await initialize(page, '<p>Before</p>', false);
  expect(await page.evaluate(() => {
    const editor = window.editor;
    const source = '<table style="margin-left: auto; margin-right: 0px; margin-top: 1px; margin: 0px; position: fixed; background-image: url(/table-properties-probe.png)"><tbody><tr><td style="vertical-align: bottom; margin-left: auto"><p>Cell</p></td></tr></tbody></table><p style="margin-left: auto; margin-right: 0px; vertical-align: middle">Outside</p>';
    editor.setHTML(source);
    const supported = editor.getHTML();
    const table = editor.surface.querySelector('table')!;
    const cell = table.querySelector('td')!;
    const outside = editor.surface.querySelector('p[style]');
    const safe = table.style.marginLeft === 'auto' && table.style.marginRight === '0px' && !table.style.marginTop && !table.style.position && !table.style.backgroundImage && cell.style.verticalAlign === 'bottom' && !cell.style.marginLeft && !outside;
    const json = editor.getJSON();
    const element = json.children[0];
    if (element.type !== 'element') throw new Error('Expected a table document node.');
    element.attributes.style = 'margin-left: url(/table-properties-probe-json.png); margin-right: 40%; vertical-align: top; width: 65%';
    editor.setJSON(json);
    const filtered = editor.surface.querySelector('table')!;
    const invalid = ['margin-left: 1px', 'margin-right: inherit', 'margin-left: var(--x)', 'margin-right: calc(1px)', 'margin: auto', 'vertical-align: baseline', 'vertical-align: 1px', 'vertical-align: inherit'];
    const refused = invalid.every((style) => {
      editor.setHTML(`<table style="${style}"><tbody><tr><td style="${style}"><p>Cell</p></td></tr></tbody></table>`);
      return !editor.surface.querySelector('table')!.getAttribute('style') && !editor.surface.querySelector('td')!.getAttribute('style');
    });
    return { safe, kept: supported.includes('vertical-align: bottom'), filtered: !filtered.style.marginLeft && !filtered.style.marginRight && !filtered.style.verticalAlign && filtered.style.width === '65%', refused };
  })).toEqual({ safe: true, kept: true, filtered: true, refused: true });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(requests).toBe(0);
});

test('rectangle clipboard preserves cell properties only and structural edits retain surviving styles with fresh-cell defaults', async ({ page }) => {
  await initialize(page, ordinaryTable);
  const before = await html(page);
  expect(await page.evaluate(() => {
    const editor = window.editor;
    const table = editor.surface.querySelector('table')!;
    const origin = table.querySelector('td')!;
    const untouched = [table.querySelector('[title="C"]')!, table.querySelector('[title="F"]')!];
    window.propertiesTableAPI.select({ row: 0, column: 0 }, { row: 1, column: 1 });
    window.tablePropertiesAPI.update({ width: '55%', alignment: 'right', cellBackground: 'blue', cellVerticalAlign: 'bottom' });
    const styled = editor.getHTML();
    const copy = window.propertiesTableAPI.copy();
    const documentCopy = new DOMParser().parseFromString(copy.html, 'text/html');
    const copiedTable = documentCopy.querySelector('table')!;
    const clipboard = [...copiedTable.querySelectorAll('td')].length === 4 && [...copiedTable.querySelectorAll('td')].every((cell) => cell.style.backgroundColor === 'blue' && cell.style.verticalAlign === 'bottom') && !copiedTable.style.width && !copiedTable.style.marginLeft && !copiedTable.style.marginRight;
    window.propertiesTableAPI.merge();
    const merged = editor.getHTML();
    const merge = origin.isConnected && origin.rowSpan === 2 && origin.colSpan === 2 && origin.style.backgroundColor === 'blue';
    window.propertiesTableAPI.split();
    const split = editor.getHTML();
    const defaults = [...table.querySelectorAll('td')].filter((cell) => cell !== origin && !untouched.includes(cell)).every((cell) => !cell.style.backgroundColor && !cell.style.verticalAlign);
    window.propertiesTableAPI.rowBelow();
    const surviving = untouched.every((node) => node.isConnected && table.contains(node)) && origin.isConnected && table.style.width === '55%' && table.style.marginLeft === 'auto' && table.style.marginRight === '0px';
    editor.undo();
    const rowUndo = editor.getHTML() === split;
    editor.undo();
    const splitUndo = editor.getHTML() === merged;
    editor.undo();
    const mergeUndo = editor.getHTML() === styled;
    editor.undo();
    return { clipboard, merge, defaults, surviving, rowUndo, splitUndo, mergeUndo };
  })).toEqual({ clipboard: true, merge: true, defaults: true, surviving: true, rowUndo: true, splitUndo: true, mergeUndo: true });
  expect(await html(page)).toBe(before);
});

test('selective table-property import and factory are SSR-safe without DOM, framework or network access', () => {
  const result = execFileSync(process.execPath, ['--input-type=module', '--eval', `
    for (const key of ['document', 'window', 'customElements']) Object.defineProperty(globalThis, key, { get: () => { throw new Error('DOM accessed'); } });
    globalThis.fetch = () => { throw new Error('Network accessed'); };
    const { tableProperties, tablePropertyCommands } = await import('@morfira-dev/wysiwyg/plugins/table-properties');
    console.log(JSON.stringify({ plugin: tableProperties().name, commands: typeof tablePropertyCommands }));
  `], { cwd: process.cwd(), encoding: 'utf8' });
  expect(JSON.parse(result)).toEqual({ plugin: 'table-properties', commands: 'function' });
});
