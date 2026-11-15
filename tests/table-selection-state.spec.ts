import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import './table-selection-state.types.js';

const initialize = async (page: Page) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async () => {
    window.dispose();
    const path = '/packages/plugins/dist/tables.js';
    const { tables, getTableSelection, tableCommands, tableSelectionChange } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/plugins/tables');
    const mount = document.createElement('div');
    mount.id = 'table-state-mount';
    document.body.append(mount);
    window.editor = window.createEditor(mount, { value: '<table><tbody><tr><td rowspan="2"><p>A</p></td><td><p>B</p></td><td><p>C</p></td></tr><tr><td><p>D</p></td><td><p>E</p></td></tr></tbody></table><p>After</p>', plugins: [tables()] });
    window.tableStateAPI = tableCommands(window.editor);
    window.getTableState = (range) => getTableSelection(window.editor, range);
    window.tableStateEvents = [];
    window.editor.events.on(tableSelectionChange, (revision) => window.tableStateEvents.push(revision));
    const range = document.createRange();
    range.selectNodeContents(window.editor.surface.querySelector('td p')!);
    range.collapse(true);
    window.editor.surface.focus();
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    window.dispose = () => { window.editor.destroy(); mount.remove(); };
  });
};

test('table selection projects merged cells without focus, marker, selection or history changes', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(() => {
    document.querySelector('#table-state-mount')!.setAttribute('data-mw-node', 'application-owned');
    const before = window.editor.getHTML();
    const range = document.getSelection()!.getRangeAt(0).cloneRange();
    const focus = document.activeElement;
    const first = window.getTableState(range)!;
    const second = window.getTableState(range)!;
    return { rectangle: first.rectangle, cells: first.cells.length, explicit: first.explicit, merge: first.canMerge, split: first.canSplit, stable: first.revision === second.revision, html: before === window.editor.getHTML(), focus: focus === document.activeElement, sameRange: range.compareBoundaryPoints(Range.START_TO_START, document.getSelection()!.getRangeAt(0)) === 0, markers: window.editor.surface.querySelectorAll('[data-mw-selected]').length, undo: window.editor.canUndo() };
  })).toEqual({ rectangle: { top: 0, left: 0, bottom: 1, right: 0 }, cells: 1, explicit: false, merge: false, split: true, stable: true, html: true, focus: true, sameRange: true, markers: 0, undo: false });
});

test('logical selection intent coalesces after transactions, keeps private ownership and survives structural Undo', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    window.tableStateEvents = [];
    const api = window.tableStateAPI;
    window.editor.transact(() => {
      api.select({ row: 0, column: 0 }, { row: 0, column: 1 });
      api.select({ row: 0, column: 0 }, { row: 0, column: 1 });
    });
    const immediate = window.tableStateEvents.length;
    await Promise.resolve();
    const count = window.tableStateEvents.length;
    const state = window.getTableState()!;
    const revision = state.revision;
    api.select({ row: 0, column: 0 }, { row: 0, column: 1 });
    const intent = window.getTableState()!.revision > revision;
    const before = window.editor.getHTML();
    api.merge();
    const changed = window.editor.getHTML() !== before;
    window.editor.undo();
    const undone = window.editor.getHTML() === before;
    return { immediate, count, cells: state.cells.length, rectangle: state.rectangle, intent, changed, undone };
  })).toEqual({ immediate: 0, count: 1, cells: 3, rectangle: { top: 0, left: 0, bottom: 1, right: 1 }, intent: true, changed: true, undone: true });
});

test('external selection host ownership is validated, reference counted and releases without suppressing pointer events', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(() => {
    const api = window.tableStateAPI;
    const host = document.createElement('button');
    document.body.append(host);
    let events = 0;
    const observe = () => { events++; };
    document.addEventListener('pointerdown', observe);
    const one = api.registerSelectionHost(host);
    const two = api.registerSelectionHost(host);
    api.select({ row: 0, column: 0 }, { row: 0, column: 1 });
    one(); one();
    host.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    const preserved = window.getTableState()!.explicit;
    two();
    host.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    const released = window.getTableState()!.explicit;
    let rejected = 0;
    for (const invalid of [document.body, window.editor.surface, document.createElement('div')]) {
      try { api.registerSelectionHost(invalid); } catch { rejected++; }
    }
    document.removeEventListener('pointerdown', observe);
    host.remove();
    return { preserved, released, events, rejected };
  })).toEqual({ preserved: true, released: false, events: 2, rejected: 3 });
});

test('state rejects spoofed rectangles, conflicting ranges and unsupported table ownership or grids', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(() => {
    const api = window.tableStateAPI;
    const root = window.editor.surface;
    const cells = root.querySelectorAll('td');
    cells[1].setAttribute('data-mw-selected', 'true');
    const ordinary = window.getTableState()!.cells.length;
    const cross = document.createRange();
    cross.setStart(cells[0], 0);
    cross.setEnd(cells[1], 0);
    const rejectsCross = window.getTableState(cross) === undefined;
    api.select({ row: 0, column: 0 });
    cross.selectNodeContents(cells[1]);
    const rejectsConflict = window.getTableState(cross) === undefined;
    const project = document.createRange();
    project.selectNodeContents(cells[0]);
    cells[1].setAttribute('data-mw-node', 'owned');
    const protectedTable = window.getTableState(project) === undefined;
    cells[1].removeAttribute('data-mw-node');
    const foreign = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    cells[1].append(foreign);
    const foreignTable = window.getTableState(project) === undefined;
    foreign.remove();
    cells[1].append(document.createElement('table'));
    const nested = window.getTableState(project) === undefined;
    cells[1].querySelector('table')!.remove();
    cells[4].remove();
    const ragged = window.getTableState(project) === undefined;
    let malformed = false;
    try { window.getTableState({} as Range); } catch { malformed = true; }
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const foreignRange = frame.contentDocument!.createRange();
    foreignRange.selectNodeContents(frame.contentDocument!.body);
    const foreignRangeRejected = window.getTableState(foreignRange) === undefined;
    frame.remove();
    return { ordinary, rejectsCross, rejectsConflict, protectedTable, foreignTable, nested, ragged, malformed, foreignRangeRejected };
  })).toEqual({ ordinary: 1, rejectsCross: true, rejectsConflict: true, protectedTable: true, foreignTable: true, nested: true, ragged: true, malformed: true, foreignRangeRejected: true });
});

test('composition and read-only disable capabilities; API replacement invalidates nodes and disposal cancels queued notifications', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(async () => {
    const api = window.tableStateAPI;
    const root = window.editor.surface;
    const range = document.getSelection()!.getRangeAt(0).cloneRange();
    root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const composing = window.getTableState(range)!.canSplit;
    root.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    const restored = window.getTableState(range)!.canSplit;
    root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    window.editor.setReadOnly(true);
    // Canceling composition restores the snapshot and replaces the original cell nodes.
    const readonlyRange = document.createRange();
    readonlyRange.selectNodeContents(root.querySelector('td p')!);
    readonlyRange.collapse(true);
    const readonly = window.getTableState(readonlyRange)!.canSplit;
    window.editor.setReadOnly(false);
    const readonlyReset = window.getTableState(readonlyRange)!.canSplit;
    root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    window.editor.setHTML('<table><tbody><tr><td colspan="2"><p>New</p></td></tr></tbody></table>');
    const replacementRange = document.createRange();
    replacementRange.selectNodeContents(root.querySelector('td p')!);
    replacementRange.collapse(true);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(replacementRange);
    const apiReset = window.getTableState(replacementRange)!.canSplit;
    api.select({ row: 0, column: 0 });
    window.editor.setHTML('<p>Replacement</p>');
    const replaced = window.getTableState(range) === undefined;
    window.tableStateEvents = [];
    window.editor.destroy();
    await Promise.resolve();
    let disposed = 0;
    try { window.getTableState(); } catch { disposed++; }
    try { api.registerSelectionHost(document.body); } catch { disposed++; }
    return { composing, restored, readonly, readonlyReset, apiReset, replaced, events: window.tableStateEvents.length, disposed };
  })).toEqual({ composing: false, restored: true, readonly: false, readonlyReset: true, apiReset: true, replaced: true, events: 0, disposed: 2 });
});

test('native notifications keep revision stable while explicit intent is scoped to its editor', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(async () => {
    const path = '/packages/plugins/dist/tables.js';
    const { tables, tableSelectionChange } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/plugins/tables');
    const mount = document.createElement('div');
    document.body.append(mount);
    const other = window.createEditor(mount, { plugins: [tables()] });
    let otherEvents = 0;
    other.events.on(tableSelectionChange, () => { otherEvents++; });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const revision = window.getTableState()!.revision;
    window.tableStateEvents = [];
    const range = document.createRange();
    range.selectNodeContents(window.editor.surface.querySelectorAll('td p')[1]);
    range.collapse(true);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    await Promise.resolve();
    const unchanged = window.getTableState()!.revision === revision;
    const notified = window.tableStateEvents.length > 0;
    // Both instances may observe their own native selection invalidation. A logical
    // selection command in this editor must not publish to the other event channel.
    otherEvents = 0;
    window.tableStateAPI.select({ row: 0, column: 1 });
    await Promise.resolve();
    other.destroy();
    mount.remove();
    return { unchanged, notified, otherEvents };
  })).toEqual({ unchanged: true, notified: true, otherEvents: 0 });
});
