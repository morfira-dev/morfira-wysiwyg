import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import './contextual-table.types.js';

const mergedRows = '<p>Before</p><table><tr><td rowspan="2">A</td><td>B</td><td>C</td></tr><tr><td>D</td><td>E</td></tr><tr><td>F</td><td>G</td><td>H</td></tr></table><p>After</p>';
const mergedColumns = '<p>Before</p><table><tr><td colspan="2">A</td><td>B</td></tr><tr><td>C</td><td>D</td><td>E</td></tr><tr><td>F</td><td>G</td><td>H</td></tr></table><p>After</p>';
const initialize = async (page: Page, value = mergedRows) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async (value) => {
    window.dispose();
    for (const path of ['core/dist/style.css', 'plugins/dist/tables.css', 'plugins/dist/ui/contextual-table.css']) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/packages/' + path;
      document.head.append(link);
      await new Promise<void>((resolve, reject) => { link.onload = () => resolve(); link.onerror = () => reject(new Error(path)); });
    }
    const mount = document.createElement('div');
    mount.className = 'workflow-table-mount';
    mount.style.cssText = 'margin:160px 12px;max-width:600px';
    const controls = document.createElement('div');
    document.body.append(mount, controls);
    const tablesPath = '/packages/plugins/dist/tables.js';
    const { tables, tableCommands } = await import(/* @vite-ignore */ tablesPath) as typeof import('@morfira-dev/wysiwyg/plugins/tables');
    const uiPath = '/packages/plugins/dist/ui/contextual-table.js';
    const { createContextualTableUI } = await import(/* @vite-ignore */ uiPath) as typeof import('@morfira-dev/wysiwyg/ui/contextual-table');
    window.editor = window.createEditor(mount, { value, locale: 'en', plugins: [tables()] });
    window.contextualTableAPI = tableCommands(window.editor);
    window.contextualTableUI = createContextualTableUI(controls, window.editor);
    window.dispose = () => { window.contextualTableUI.destroy(); window.editor.destroy(); mount.remove(); controls.remove(); };
  }, value);
};
const caret = async (page: Page, text: string) => page.evaluate((text) => {
  const cell = [...window.editor.surface.querySelectorAll('td,th')].find((node) => node.textContent === text)!;
  window.editor.focus();
  const range = document.createRange();
  range.selectNodeContents(cell);
  range.collapse(true);
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  window.editor.surface.dispatchEvent(new Event('click', { bubbles: true }));
  window.contextualTableUI.refresh();
}, text);
const selected = (page: Page) => page.evaluate(async () => {
  const path = '/packages/plugins/dist/tables.js';
  const { getTableSelection } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/plugins/tables');
  const state = getTableSelection(window.editor);
  return state && { rectangle: state.rectangle, cells: state.cells.map((cell) => cell.textContent), explicit: state.explicit };
});

test('whole rows and columns close over merged boundaries without changing native selection, contents or history', async ({ page }) => {
  await initialize(page);
  await caret(page, 'D');
  const result = await page.evaluate(() => {
    const html = window.editor.getHTML();
    const native = document.getSelection()!.getRangeAt(0).cloneRange();
    const cells = [...window.editor.surface.querySelectorAll('td,th')];
    window.contextualTableAPI.selectRow();
    const after = document.getSelection()!.getRangeAt(0);
    return { html: window.editor.getHTML() === html, native: native.startContainer === after.startContainer && native.startOffset === after.startOffset && native.endContainer === after.endContainer && native.endOffset === after.endOffset, retained: cells.every((cell) => window.editor.surface.contains(cell)), undo: window.editor.canUndo() };
  });
  expect(result).toEqual({ html: true, native: true, retained: true, undo: false });
  expect(await selected(page)).toEqual({ rectangle: { top: 0, left: 0, bottom: 1, right: 2 }, cells: ['A', 'B', 'C', 'D', 'E'], explicit: true });
  await page.evaluate((html) => window.editor.setHTML(html), mergedColumns);
  await caret(page, 'D');
  await page.evaluate(() => window.contextualTableAPI.selectColumn());
  expect(await selected(page)).toEqual({ rectangle: { top: 0, left: 0, bottom: 2, right: 1 }, cells: ['A', 'C', 'D', 'F', 'G'], explicit: true });
  await page.evaluate(() => window.contextualTableAPI.selectTable());
  expect((await selected(page))?.cells).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
});

test('read-only fresh context exposes observational selection while mutation controls and composition remain guarded', async ({ page }) => {
  await initialize(page);
  await caret(page, 'D');
  await page.evaluate(() => window.editor.setReadOnly(true));
  await caret(page, 'D');
  const panel = page.locator('.mw-contextual-table');
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-mw-table-action="selectRow"]')).toBeEnabled();
  await expect(panel.locator('[data-mw-table-action="merge"]')).toBeDisabled();
  const before = await page.evaluate(() => window.editor.getHTML());
  await panel.getByRole('button', { name: 'Select rows', exact: true }).click();
  expect((await selected(page))?.cells).toEqual(['A', 'B', 'C', 'D', 'E']);
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
  await page.evaluate(() => {
    window.editor.setReadOnly(false);
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  });
  const markers = await page.locator('[data-mw-selected]').count();
  await page.evaluate(() => window.contextualTableAPI.selectTable());
  expect(await page.locator('[data-mw-selected]').count()).toBe(markers);
  await expect(panel).toBeHidden();
});

test('protected and sparse source refusal preserves markers and native points, disposed commands reject', async ({ page }) => {
  await initialize(page);
  await caret(page, 'D');
  const result = await page.evaluate(() => {
    const api = window.contextualTableAPI;
    api.select({ row: 1, column: 1 });
    const table = window.editor.surface.querySelector('table')!;
    const native = document.getSelection()!.getRangeAt(0).cloneRange();
    const moved = document.createRange();
    moved.selectNodeContents(table.rows[2]!.cells[0]!);
    moved.collapse(true);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(moved);
    const oldMarkers = window.editor.surface.innerHTML;
    let rejected = 0;
    try { api.selectTable(); } catch { rejected++; }
    const staleRetained = window.editor.surface.innerHTML === oldMarkers;
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(native.cloneRange());
    table.setAttribute('data-mw-node', 'app:protected');
    const before = window.editor.surface.innerHTML;
    try { api.selectTable(); } catch { rejected++; }
    const retained = window.editor.surface.innerHTML === before;
    table.removeAttribute('data-mw-node');
    table.rows[2]!.deleteCell(2);
    const sparse = window.editor.surface.innerHTML;
    try { api.selectColumn(); } catch { rejected++; }
    const after = document.getSelection()!.getRangeAt(0);
    const same = native.startContainer === after.startContainer && native.startOffset === after.startOffset;
    const sparseRetained = window.editor.surface.innerHTML === sparse;
    window.editor.destroy();
    try { api.selectRow(); } catch { rejected++; }
    return { rejected, retained, sparseRetained, staleRetained, same };
  });
  expect(result).toEqual({ rejected: 4, retained: true, sparseRetained: true, staleRetained: true, same: true });
});

test('keyboard context selection supports a complete TSV paste, copy, structural edit and undo workflow', async ({ page }) => {
  await initialize(page, '<p>Before</p><table><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></table><p>After</p>');
  await caret(page, 'A');
  await page.keyboard.press('Alt+F10');
  const panel = page.locator('.mw-contextual-table');
  await expect(panel.locator('button').first()).toBeFocused();
  await panel.getByRole('button', { name: 'Select table', exact: true }).focus();
  await page.keyboard.press('Enter');
  const result = await page.evaluate(() => {
    const api = window.contextualTableAPI;
    const before = window.editor.getHTML();
    api.paste({ text: 'Name\tCount\nTea\t2' });
    const pasted = window.editor.getHTML();
    api.selectTable();
    const copied = api.copy();
    api.rowBelow();
    const rows = window.editor.surface.querySelector('table')!.rows.length;
    window.editor.undo();
    const undoStructure = window.editor.getHTML() === pasted;
    window.editor.undo();
    return { text: copied.text, table: copied.html.includes('<table'), rows, undoStructure, undoPaste: window.editor.getHTML() === before };
  });
  expect(result).toEqual({ text: 'Name\tCount\r\nTea\t2', table: true, rows: 3, undoStructure: true, undoPaste: true });
});
