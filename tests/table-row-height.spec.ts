import { expect, test } from '@playwright/test';
import { initializeRowHeight, rowHeightSample } from './table-row-height.fixture.js';

test('minimum row height covers the merged rectangle rows without rebuilding nodes and undoes once', async ({ page }) => {
  await initializeRowHeight(page);
  const before = await page.evaluate(() => window.editor.getHTML());
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    const table = root.querySelector('table')!;
    const rows = [...table.rows];
    const nodes = [table, ...table.querySelectorAll('*')];
    const text = table.querySelector('strong')!.firstChild!;
    const native = document.getSelection()!;
    native.setBaseAndExtent(text, 5, text, 1);
    window.headerTables.select({ row: 1, column: 0 }, { row: 1, column: 1 });
    const selected = window.headerSelection()!;
    window.headerProperties.update({ rowMinHeight: '80px', cellBackground: '#abcdef', caption: 'Keep caption' });
    const current = window.headerSelection()!;
    return {
      heights: rows.map((row) => row.style.height), nodes: nodes.every((node) => node.isConnected && root.contains(node)),
      rows: rows.every((row, index) => row === table.rows[index]),
      selection: native.anchorNode === text && native.focusNode === text && native.anchorOffset === 5 && native.focusOffset === 1,
      rectangle: current.rectangle, selected: current.cells.every((cell, index) => cell === selected.cells[index]),
      cellHeights: [...table.querySelectorAll<HTMLTableCellElement>('td,th')].map((cell) => cell.style.height),
      colors: current.cells.every((cell) => Boolean(cell.style.backgroundColor)), caption: table.caption!.textContent,
      rowspan: table.querySelector('td')!.rowSpan, rowColor: rows[1].style.color,
      state: window.headerProperties.getState().rowMinHeight, changes: window.changes.length,
    };
  })).toEqual({ heights: ['', '80px', '80px', ''], nodes: true, rows: true, selection: true,
    rectangle: { top: 1, left: 0, bottom: 2, right: 1 }, selected: true,
    cellHeights: Array(11).fill(''), colors: true, caption: 'Keep caption', rowspan: 2, rowColor: 'navy', state: '80px', changes: 1 });
  const changed = await page.evaluate(() => window.editor.getHTML());
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo() }))).toEqual({ html: before, undo: false });
  await page.evaluate(() => window.editor.redo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(changed);
});

test('caret in rowspan targets both rows, reports mixed imported values and reset preserves unrelated heights', async ({ page }) => {
  const value = rowHeightSample.replace('<tr style="color:navy">', '<tr style="color:navy;height:12em">')
    .replace('<tr><td><p>Second', '<tr style="height:24px"><td><p>Second');
  await initializeRowHeight(page, value);
  expect(await page.evaluate(() => {
    const table = window.editor.surface.querySelector('table')!;
    const before = window.headerProperties.getState().rowMinHeight;
    const native = window.headerSelection()!;
    window.headerProperties.update({ cellBorder: 'navy' });
    const imported = [...table.rows].map((row) => row.style.height);
    window.headerProperties.update({ rowMinHeight: '72px' });
    const uniform = window.headerProperties.getState().rowMinHeight;
    const changes = window.changes.length;
    window.headerProperties.update({ rowMinHeight: '72px' });
    const noOp = changes === window.changes.length;
    window.headerProperties.update({ rowMinHeight: false });
    const cleared = [...table.rows].map((row) => row.style.height);
    window.editor.undo();
    const oldCount = window.changes.length;
    window.headerProperties.update({ rowMinHeight: '72px' });
    return { before, explicit: native.explicit, rectangle: native.rectangle, imported, uniform, noOp, cleared,
      redo: window.editor.canRedo(), noExtraChange: oldCount === window.changes.length };
  })).toEqual({ before: 'mixed', explicit: false, rectangle: { top: 1, left: 0, bottom: 2, right: 0 },
    imported: ['', '12em', '24px', ''], uniform: '72px', noOp: true, cleared: ['', '', '', ''], redo: true, noExtraChange: true });
});

test('minimum sizing permits taller content and safe row heights persist without properties plugin', async ({ page }) => {
  await initializeRowHeight(page, '<table style="height:240px"><tbody><tr style="height:72px;min-height:999px;position:fixed"><td style="height:55px"><p style="height:160px">Tall content</p></td></tr><tr><td><p>Other</p></td></tr></tbody></table><p>After</p>');
  await page.evaluate(() => window.headerProperties.update({ rowMinHeight: '1px' }));
  const row = page.locator('.headers-editor tr').first();
  expect(await row.evaluate((element) => ({ height: element.style.height, min: element.style.minHeight, position: element.style.position,
    rendered: element.getBoundingClientRect().height > 100, cell: element.querySelector('td')!.style.height,
    table: element.closest('table')!.style.height }))).toEqual({ height: '1px', min: '', position: '', rendered: true, cell: '55px', table: '240px' });
  expect(await page.evaluate(() => {
    const html = window.editor.getHTML();
    const json = window.editor.getJSON();
    const host = document.createElement('div');
    document.body.append(host);
    const plain = window.createEditor(host, { value: html });
    const htmlSame = plain.getHTML() === html;
    plain.setJSON(json);
    const jsonSame = plain.getHTML() === html;
    plain.destroy(); host.remove();
    const first = window.editor.surface.querySelector('td p')!.firstChild!;
    window.editor.surface.focus();
    document.getSelection()!.setBaseAndExtent(first, 0, first, 0);
    window.headerProperties.update({ rowMinHeight: false });
    const table = window.editor.surface.querySelector('table')!;
    return { htmlSame, jsonSame, reset: table.rows[0].style.height, cell: table.rows[0].cells[0].style.height, table: table.style.height };
  })).toEqual({ htmlSame: true, jsonSame: true, reset: '', cell: '55px', table: '240px' });
});

test('invalid complete row patches reject before changes and readonly/IME block valid writes', async ({ page }) => {
  await initializeRowHeight(page);
  expect(await page.evaluate(() => {
    const before = window.editor.getHTML();
    const values: unknown[] = [undefined, null, true, 72, '0px', '1001px', '01px', '1.5px', '72%', '12em', ' 72px', '72px ', 'inherit', 'calc(1px)', '72px!important', '72px;background:red', 'url(/row-height-probe)'];
    const rejected = values.every((rowMinHeight) => {
      try { window.headerProperties.update({ width: '70%', caption: 'Do not change', rowMinHeight } as never); return false; }
      catch { return window.editor.getHTML() === before; }
    });
    window.editor.setReadOnly(true);
    window.headerProperties.update({ rowMinHeight: '72px' });
    window.editor.setReadOnly(false);
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    window.headerProperties.update({ rowMinHeight: '72px' });
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    return { rejected, unchanged: window.editor.getHTML() === before, undo: window.editor.canUndo(), changes: window.changes.length };
  })).toEqual({ rejected: true, unchanged: true, undo: false, changes: 0 });
});

test('focus replacement cannot redirect row sizing and retained commands fail after disposal', async ({ page }) => {
  await initializeRowHeight(page);
  expect(await page.evaluate(() => {
    const original = window.editor.surface.querySelector('table')!;
    const button = document.createElement('button'); document.body.append(button); button.focus();
    const text = original.querySelector('strong')!.firstChild!;
    document.getSelection()!.setBaseAndExtent(text, 0, text, 0);
    window.editor.surface.addEventListener('focusin', () => window.editor.setHTML('<table><tbody><tr><td><p>External</p></td></tr></tbody></table><p>After</p>'), { once: true });
    window.headerProperties.update({ rowMinHeight: '72px' });
    const table = window.editor.surface.querySelector('table')!;
    const unchanged = table !== original && table.rows[0].style.height === '' && table.textContent === 'External';
    const undo = window.editor.canUndo();
    window.editor.destroy();
    let disposed = false;
    try { window.headerProperties.update({ rowMinHeight: '72px' }); } catch { disposed = true; }
    return { unchanged, undo, disposed };
  })).toEqual({ unchanged: true, undo: false, disposed: true });
});
