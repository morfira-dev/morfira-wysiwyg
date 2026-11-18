import { expect, test } from '@playwright/test';
import { headerTableSample, initializeTableHeaders } from './table-headers-caption.fixture.js';

test('combined headers/caption retain rich descendants, native direction and actual logical region in one Undo', async ({ page }) => {
  await initializeTableHeaders(page);
  const before = await page.evaluate(() => window.editor.getHTML());
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    const table = root.querySelector('table')!;
    const rows = [...table.rows];
    const unchanged = table.querySelector('[title="E"]')!;
    const strong = table.querySelector('strong')!;
    const text = strong.firstChild!;
    const native = document.getSelection()!;
    native.setBaseAndExtent(text, 4, text, 1);
    window.headerTables.select({ row: 0, column: 0 }, { row: 1, column: 1 });
    window.headerProperties.update({ headerRow: true, headerColumn: true, caption: 'Quarterly results', cellBackground: '#abc' });
    const selection = window.headerSelection()!;
    const state = window.headerProperties.getState();
    return {
      headers: [...table.querySelectorAll('th')].map((cell) => [cell.title, cell.scope]),
      nodes: root.querySelector('table') === table && rows.every((row, index) => table.rows[index] === row)
        && table.querySelector('[title="E"]') === unchanged && table.querySelector('strong') === strong,
      backward: native.anchorNode === text && native.focusNode === text && native.anchorOffset === 4 && native.focusOffset === 1,
      region: { explicit: selection.explicit, cells: selection.cells.map((cell) => cell.title), rectangle: selection.rectangle, connected: selection.cells.every((cell) => cell.isConnected) },
      first: table.firstElementChild?.localName, caption: state.caption, row: state.headerRow, column: state.headerColumn,
      background: selection.cells.every((cell) => Boolean(cell.style.backgroundColor)), changes: window.changes.length,
    };
  })).toEqual({ headers: [['A', 'col'], ['B', 'col'], ['C', 'col'], ['D', 'row'], ['G', 'row']], nodes: true, backward: true,
    region: { explicit: true, cells: ['A', 'B', 'D', 'E'], rectangle: { top: 0, left: 0, bottom: 1, right: 1 }, connected: true },
    first: 'caption', caption: 'Quarterly results', row: true, column: true, background: true, changes: 1 });
  const changed = await page.evaluate(() => window.editor.getHTML());
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo() }))).toEqual({ html: before, undo: false });
  expect(await page.evaluate(() => {
    const text = window.editor.surface.querySelector('strong')!.firstChild!;
    const native = document.getSelection()!;
    return native.anchorNode === text && native.focusNode === text && native.anchorOffset === 4 && native.focusOffset === 1;
  })).toBe(true);
  await page.evaluate(() => window.editor.redo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(changed);
});

test('axis removal retains the opposite corner and idempotent headers preserve redo', async ({ page }) => {
  await initializeTableHeaders(page);
  expect(await page.evaluate(() => {
    window.headerProperties.update({ headerRow: true, headerColumn: true });
    window.headerProperties.update({ headerRow: false });
    const table = window.editor.surface.querySelector('table')!;
    const remaining = [...table.querySelectorAll('th')].map((cell) => [cell.title, cell.scope]);
    const column = window.headerProperties.getState().headerColumn;
    window.headerProperties.update({ headerRow: true, headerColumn: false });
    const remainingRow = [...table.querySelectorAll('th')].map((cell) => [cell.title, cell.scope]);
    window.headerProperties.update({ headerRow: false });
    const none = table.querySelectorAll('th').length;
    window.editor.undo();
    const before = window.editor.getHTML();
    const count = window.changes.length;
    window.headerProperties.update({ headerRow: true, headerColumn: false });
    return { remaining, remainingRow, column, none, noChange: window.editor.getHTML() === before, redo: window.editor.canRedo(), changes: window.changes.length === count };
  })).toEqual({ remaining: [['A', 'row'], ['D', 'row'], ['G', 'row']], remainingRow: [['A', 'col'], ['B', 'col'], ['C', 'col']], column: true, none: 0, noChange: true, redo: true, changes: true });
});

test('spans within a header axis survive while crossing spans reject the complete patch atomically', async ({ page }) => {
  const horizontal = '<table><tbody><tr><td colspan="2"><p><strong>Group</strong></p></td><td><p>Last</p></td></tr><tr><td><p>A</p></td><td><p>B</p></td><td><p>C</p></td></tr></tbody></table><p>After</p>';
  await initializeTableHeaders(page, horizontal);
  await page.evaluate(() => window.headerProperties.update({ headerRow: true, caption: 'Grouped' }));
  await expect(page.locator('.headers-editor th[colspan="2"]')).toHaveText('Group');
  expect(await page.evaluate(() => {
    const before = window.editor.getHTML();
    const changes = window.changes.length;
    let rejected = false;
    try { window.headerProperties.update({ headerColumn: true, caption: 'Do not write', width: '70%' }); }
    catch { rejected = true; }
    return { rejected, unchanged: before === window.editor.getHTML(), changes: changes === window.changes.length };
  })).toEqual({ rejected: true, unchanged: true, changes: true });
  const vertical = '<table><tbody><tr><td rowspan="2"><p>Group</p></td><td><p>A</p></td></tr><tr><td><p>B</p></td></tr></tbody></table><p>After</p>';
  await initializeTableHeaders(page, vertical);
  expect(await page.evaluate(() => {
    const before = window.editor.getHTML();
    let rejected = false;
    try { window.headerProperties.update({ headerRow: true, caption: 'Do not write', cellBorder: 'red' }); }
    catch { rejected = true; }
    const unchanged = before === window.editor.getHTML() && !window.editor.canUndo();
    window.headerProperties.update({ headerColumn: true });
    return { rejected, unchanged, span: window.editor.surface.querySelector('th')?.getAttribute('rowspan') };
  })).toEqual({ rejected: true, unchanged: true, span: '2' });
});

test('caption changes are literal, preserve equal rich content and persist without the optional plugin', async ({ page }) => {
  const value = headerTableSample.replace('<table title="Headers">', '<table title="Headers"><caption><em>Rich caption</em></caption>');
  await initializeTableHeaders(page, value);
  expect(await page.evaluate(() => {
    const table = window.editor.surface.querySelector('table')!;
    const caption = table.caption!;
    const em = caption.querySelector('em')!;
    const cells = [...table.querySelectorAll('td')];
    window.headerProperties.update({ caption: 'Rich caption' });
    const same = table.caption === caption && caption.querySelector('em') === em && !window.editor.canUndo();
    window.headerProperties.update({ headerRow: true });
    const rich = caption.querySelector('em') === em;
    window.headerProperties.update({ caption: ' <img src=x onerror=alert(1)> & text ' });
    return { same, rich, safe: caption.querySelectorAll('*').length === 0, literal: caption.textContent,
      cells: cells.slice(3).every((cell) => cell.isConnected && table.contains(cell)), captions: table.querySelectorAll(':scope > caption').length };
  })).toEqual({ same: true, rich: true, safe: true, literal: ' <img src=x onerror=alert(1)> & text ', cells: true, captions: 1 });
  expect(await page.evaluate(() => {
    const json = window.editor.getJSON();
    const html = window.editor.getHTML();
    const host = document.createElement('div');
    document.body.append(host);
    const independent = window.createEditor(host);
    independent.setJSON(json);
    const same = independent.getHTML() === html;
    independent.setHTML(html);
    const reimported = independent.getHTML() === html;
    independent.destroy(); host.remove();
    window.headerProperties.update({ caption: '' });
    const removed = window.editor.surface.querySelectorAll('caption').length === 0;
    const count = window.changes.length;
    window.headerProperties.update({ caption: false });
    return { same, reimported, removed, noop: count === window.changes.length };
  })).toEqual({ same: true, reimported: true, removed: true, noop: true });
});

test('partial headers normalize only an explicit axis and unsupported values or duplicate captions never partly write', async ({ page }) => {
  await initializeTableHeaders(page, headerTableSample.replace('<td title="B">', '<th title="B">').replace('Beta</p></td>', 'Beta</p></th>'));
  expect(await page.evaluate(() => {
    const before = window.editor.getHTML();
    const row = window.headerProperties.getState().headerRow;
    const rejected = [{ headerRow: 'true' }, { headerColumn: undefined }, { caption: 'x'.repeat(5001), width: '60%' }, { caption: '<b>x</b>', headerRow: 1 }]
      .every((patch) => { try { window.headerProperties.update(patch as never); return false; } catch { return window.editor.getHTML() === before; } });
    window.headerProperties.update({ caption: 'No normalization' });
    const retainedPartial = window.editor.surface.querySelectorAll('th').length === 1;
    window.headerProperties.update({ headerRow: true });
    const normalized = window.headerProperties.getState().headerRow;
    const table = window.editor.surface.querySelector('table')!;
    table.append(document.createElement('caption'));
    const raw = window.editor.surface.innerHTML;
    let duplicateRejected = false;
    try { window.headerProperties.update({ caption: 'Denied', width: '80%' }); } catch { duplicateRejected = true; }
    const unchanged = raw === window.editor.surface.innerHTML;
    window.editor.setHTML('<table><tbody><tr><td><p>Only cell</p></td></tr></tbody></table>');
    const range = document.createRange();
    range.selectNodeContents(window.editor.surface.querySelector('td p')!); range.collapse(true);
    window.editor.surface.focus();
    const native = document.getSelection()!; native.removeAllRanges(); native.addRange(range);
    const single = window.editor.getHTML();
    const minimums = [{ headerRow: true, caption: 'Denied' }, { headerColumn: true, caption: 'Denied' }].every((patch) => {
      try { window.headerProperties.update(patch); return false; }
      catch { return window.editor.getHTML() === single && !window.editor.canUndo(); }
    });
    return { row, rejected, retainedPartial, normalized, duplicateRejected, unchanged, minimums };
  })).toEqual({ row: false, rejected: true, retainedPartial: true, normalized: true, duplicateRejected: true, unchanged: true, minimums: true });
});

test('readonly, composition and focus replacement cannot apply header/caption writes to a stale table', async ({ page }) => {
  await initializeTableHeaders(page);
  const before = await page.evaluate(() => window.editor.getHTML());
  await page.evaluate(() => {
    window.editor.setReadOnly(true);
    window.headerProperties.update({ headerRow: true, caption: 'Blocked' });
    window.editor.setReadOnly(false);
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    window.headerProperties.update({ headerColumn: true, caption: 'Blocked' });
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
  });
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo() }))).toEqual({ html: before, undo: false });
  expect(await page.evaluate(() => {
    const native = document.getSelection()!;
    const saved = native.getRangeAt(0).cloneRange();
    const button = document.createElement('button'); document.body.append(button); button.focus();
    native.removeAllRanges(); native.addRange(saved);
    window.editor.surface.addEventListener('focus', () => window.editor.setHTML('<p>Replacement</p>'), { once: true });
    window.headerProperties.update({ headerRow: true, caption: 'Stale' });
    const result = { html: window.editor.getHTML(), undo: window.editor.canUndo() };
    button.remove();
    return result;
  })).toEqual({ html: '<p>Replacement</p>', undo: false });
});
