import type { Editor, EditorPlugin } from '@morfira/wysiwyg-core';
import { cellsInRectangle, deleteGridColumn, deleteGridRow, emptyCell, insertGridColumn, insertGridRow, readGrid, rebuildGrid, selectionRectangle } from './grid.js';
import type { CellAddress } from './grid.js';
import { copyTableRange, isTableClipboard, planTablePaste, readClipboardTable } from './clipboard.js';
import type { TableClipboardData, TableClipboardInput } from './clipboard.js';
export type { TableClipboardData, TableClipboardInput } from './clipboard.js';
export interface TableOptions { onClipboardError?: (error: Error) => void; }
export type { CellAddress } from './grid.js';
export interface TableCommands {
  copy(): TableClipboardData;
  cut(): TableClipboardData;
  paste(data: TableClipboardInput): void;
  insert(rows: number, columns: number): void;
  select(from: CellAddress, to?: CellAddress): void;
  rowAbove(): void;
  rowBelow(): void;
  columnLeft(): void;
  columnRight(): void;
  deleteRow(): void;
  deleteColumn(): void;
  merge(): void;
  split(): void;
  remove(): void;
  background(color: string): void;
  border(color: string): void;
  columnWidth(column: number, pixels: number): void;
}

const moveCaret = (cell: HTMLElement): void => {
  const range = document.createRange(); range.selectNodeContents(cell.firstElementChild ?? cell); range.collapse(true);
  const selection = document.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
};
const targetCell = (target: EventTarget | Node | null, root: HTMLElement): HTMLTableCellElement | undefined => {
  const node = target instanceof Node ? target : undefined;
  const element = node instanceof Element ? node : node?.parentElement;
  const cell = element?.closest<HTMLTableCellElement>('td,th');
  return cell && root.contains(cell) ? cell : undefined;
};
const validateColor = (value: string): string => {
  if (!/^(#[a-f\d]{3,8}|[a-z]{1,24}|(?:rgb|rgba|hsl|hsla)\([\d\s.,%+-]+\))$/i.test(value)) throw new TypeError('Unsupported color value.');
  return value;
};

export const tables = (options: TableOptions = {}): EditorPlugin => ({
  name: 'tables',
  setup: (editor) => {
    const root = editor.surface;
    let selected: HTMLTableCellElement[] = [];
    let currentTable: HTMLTableElement | undefined;
    let anchor: HTMLTableCellElement | undefined;
    let dragging = false;
    let resizing: { table: HTMLTableElement; column: number; start: number; width: number; end: number; } | undefined;
    let disposed = false;
    const status = document.createElement('div'); status.className = 'mw-table-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); editor.element.append(status);
    const reportClipboardError = (reason: unknown) => {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      status.textContent = error.message; options.onClipboardError?.(error);
    };
    const menu = document.createElement('div'); menu.className = 'mw-table-menu'; menu.hidden = true; menu.setAttribute('role', 'menu'); editor.element.append(menu);
    const handle = document.createElement('button'); handle.type = 'button'; handle.className = 'mw-table-resize'; handle.hidden = true; handle.setAttribute('aria-label', 'Изменить ширину столбца'); editor.element.append(handle);
    let hover: { table: HTMLTableElement; column: number; width: number; } | undefined;
    const clearSelection = () => { for (const cell of selected) cell.removeAttribute('data-mw-selected'); selected = []; };
    const closeMenu = () => { menu.hidden = true; };
    const useCells = (cells: HTMLTableCellElement[]) => {
      clearSelection(); selected = cells.filter((cell) => root.contains(cell));
      for (const cell of selected) cell.setAttribute('data-mw-selected', 'true');
      if (selected[0]) currentTable = selected[0].closest('table')!;
    };
    const activeCells = (): HTMLTableCellElement[] => {
      selected = selected.filter((cell) => root.contains(cell));
      if (selected.length) return selected;
      const cell = targetCell(document.getSelection()?.anchorNode ?? null, root);
      if (cell) { currentTable = cell.closest('table')!; return [cell]; }
      return [];
    };
    const selectRegion = (from: HTMLTableCellElement, to: HTMLTableCellElement) => {
      const table = from.closest('table')!;
      if (table !== to.closest('table')) return;
      const grid = readGrid(table); const rectangle = selectionRectangle(grid, [from, to]);
      useCells(cellsInRectangle(grid, rectangle).map((cell) => cell.element));
    };
    const edit = (mutate: (table: HTMLTableElement, cells: HTMLTableCellElement[]) => void) => {
      if (editor.isReadOnly()) return;
      const cells = activeCells(); if (!cells.length) return;
      const table = cells[0].closest('table')!;
      editor.transact(() => { mutate(table, cells); clearSelection(); closeMenu(); handle.hidden = true; hover = undefined; });
      const cell = table.isConnected ? table.querySelector<HTMLTableCellElement>('td,th') : null;
      if (cell) { currentTable = table; moveCaret(cell); } else currentTable = undefined;
    };
    const applyColumnWidth = (table: HTMLTableElement, column: number, pixels: number) => {
      if (!Number.isInteger(column) || column < 0 || !Number.isFinite(pixels) || pixels < 40 || pixels > 4000) throw new RangeError('Column width must be 40–4000 pixels.');
      if (!root.contains(table) || column >= readGrid(table).columns) throw new RangeError('Column is outside the current table.');
      editor.transact(() => {
        const grid = readGrid(table); const widths = Array.from({ length: grid.columns }, (_, index) => grid.slots[0][index]?.element.getBoundingClientRect().width / (grid.slots[0][index]?.colspan ?? 1) || 100);
        rebuildGrid(table, grid.cells, grid.rows, grid.columns);
        const cols = table.querySelectorAll<HTMLElement>(':scope > colgroup > col');
        widths[column] = pixels; cols.forEach((col, index) => { col.style.width = `${Math.round(widths[index])}px`; });
        table.style.width = `${Math.round(widths.reduce((sum, width) => sum + width, 0))}px`;
      });
    };
    const clipboardCells = () => {
      const cells = activeCells();
      if (!cells.length) throw new Error('Place the caret in a table or select its cells first.');
      return { cells, table: cells[0].closest('table')! };
    };
    const clearCellContents = (cells: HTMLTableCellElement[]) => {
      editor.transact(() => { for (const cell of cells) cell.innerHTML = '<p><br></p>'; });
    };
    const commands: TableCommands = {
      copy: () => { const { table, cells } = clipboardCells(); return copyTableRange(table, cells); },
      cut: () => {
        const { table, cells } = clipboardCells(); const data = copyTableRange(table, cells);
        if (!editor.isReadOnly()) clearCellContents(cells);
        return data;
      },
      paste: (data) => {
        if (editor.isReadOnly()) return;
        const explicit = selected.some((cell) => root.contains(cell));
        const { table, cells } = clipboardCells(); const source = readClipboardTable(data);
        const plan = planTablePaste(table, cells, source, explicit);
        editor.transact(() => { plan.apply(); clearSelection(); closeMenu(); status.textContent = ''; moveCaret(plan.firstCell); });
        currentTable = table;
      },
      insert: (rows, columns) => {
        if (![rows, columns].every((n) => Number.isInteger(n) && n > 0 && n <= 100)) throw new RangeError('Table dimensions must be integers from 1 to 100.');
        editor.transact(() => {
          const native = document.getSelection(); const active = native?.anchorNode;
          const element = active instanceof Element ? active : active?.parentElement;
          if (element?.closest('table') && root.contains(element)) throw new Error('Nested tables are not supported.');
          const table = document.createElement('table'); table.style.width = '100%';
          const cells = Array.from({ length: rows }, (_, row) => Array.from({ length: columns }, (_, column) => emptyCell(row, column))).flat();
          rebuildGrid(table, cells, rows, columns);
          let block = element?.closest<HTMLElement>('p,h1,h2,h3,h4,h5,h6,blockquote,pre,ul,ol');
          while (block?.parentElement && block.parentElement !== root) block = block.parentElement;
          if (block && root.contains(block)) { block.after(table); if (!block.textContent && !block.querySelector('img')) block.remove(); }
          else root.append(table);
          if (!table.nextSibling) { const tail = document.createElement('p'); tail.innerHTML = '<br>'; table.after(tail); }
          clearSelection(); currentTable = table; moveCaret(cells[0].element);
        });
      },
      select: (from, to = from) => {
        activeCells();
        if (!currentTable || !root.contains(currentTable)) throw new Error('Place the caret in a table first.');
        const grid = readGrid(currentTable);
        for (const address of [from, to]) if (![address.row, address.column].every(Number.isInteger) || address.row < 0 || address.column < 0 || !grid.slots[address.row]?.[address.column]) throw new RangeError('Cell address is outside the table.');
        selectRegion(grid.slots[from.row][from.column].element, grid.slots[to.row][to.column].element);
      },
      rowAbove: () => edit((table, cells) => insertGridRow(table, selectionRectangle(readGrid(table), cells).top)),
      rowBelow: () => edit((table, cells) => insertGridRow(table, selectionRectangle(readGrid(table), cells).bottom + 1)),
      columnLeft: () => edit((table, cells) => insertGridColumn(table, selectionRectangle(readGrid(table), cells).left)),
      columnRight: () => edit((table, cells) => insertGridColumn(table, selectionRectangle(readGrid(table), cells).right + 1)),
      deleteRow: () => edit((table, cells) => { const rectangle = selectionRectangle(readGrid(table), cells); for (let row = rectangle.bottom; row >= rectangle.top; row--) deleteGridRow(table, row); }),
      deleteColumn: () => edit((table, cells) => { const rectangle = selectionRectangle(readGrid(table), cells); for (let column = rectangle.right; column >= rectangle.left; column--) deleteGridColumn(table, column); }),
      merge: () => edit((table, cells) => {
        const grid = readGrid(table); const rectangle = selectionRectangle(grid, cells); const targets = cellsInRectangle(grid, rectangle);
        if (targets.reduce((sum, cell) => sum + cell.rowspan * cell.colspan, 0) !== (rectangle.bottom - rectangle.top + 1) * (rectangle.right - rectangle.left + 1)) throw new Error('Cannot merge an incomplete table rectangle.');
        const first = targets[0]; if (!first || targets.length === 1) return;
        for (const other of targets.slice(1)) if (other.element.textContent || other.element.querySelector('img,table')) first.element.append(...other.element.childNodes);
        first.rowspan = rectangle.bottom - rectangle.top + 1; first.colspan = rectangle.right - rectangle.left + 1;
        rebuildGrid(table, grid.cells.filter((cell) => cell === first || !targets.includes(cell)), grid.rows, grid.columns);
      }),
      split: () => edit((table, cells) => {
        const grid = readGrid(table);
        for (const cell of grid.cells.filter((cell) => cells.includes(cell.element))) { cell.rowspan = 1; cell.colspan = 1; }
        rebuildGrid(table, grid.cells, grid.rows, grid.columns);
      }),
      remove: () => edit((table) => table.remove()),
      background: (color) => { const value = validateColor(color); edit((_table, cells) => { for (const cell of cells) cell.style.backgroundColor = value; }); },
      border: (color) => { const value = validateColor(color); edit((_table, cells) => { for (const cell of cells) cell.style.borderColor = value; }); },
      columnWidth: (column, pixels) => {
        activeCells();
        if (!currentTable) throw new Error('Place the caret in a table first.');
        applyColumnWidth(currentTable, column, pixels);
      },
    };
    const pasteRange = (event: ClipboardEvent) => {
      if (!event.clipboardData || !activeCells().length) return;
      const data = { html: event.clipboardData.getData('text/html'), text: event.clipboardData.getData('text/plain') };
      if (!isTableClipboard(data) && !selected.length) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (editor.isReadOnly()) return;
      try { commands.paste(data); } catch (error) { reportClipboardError(error); }
    };
    const copyRange = (event: ClipboardEvent, cut: boolean) => {
      selected = selected.filter((cell) => root.contains(cell));
      if (!selected.length || !event.clipboardData) return;
      event.preventDefault(); event.stopImmediatePropagation();
      try {
        const data = commands.copy();
        event.clipboardData.setData('text/html', data.html); event.clipboardData.setData('text/plain', data.text);
        if (cut && !editor.isReadOnly()) clearCellContents([...selected]);
      } catch (error) { reportClipboardError(error); }
    };
    const copyRangeEvent = (event: ClipboardEvent) => copyRange(event, false);
    const cutRangeEvent = (event: ClipboardEvent) => copyRange(event, true);
    const removeAPI = editor.providePlugin('tables', commands);
    root.addEventListener('paste', pasteRange, true); root.addEventListener('copy', copyRangeEvent, true); root.addEventListener('cut', cutRangeEvent, true);
    const menuActions: [string, () => void][] = [
      ['Строка выше', commands.rowAbove], ['Строка ниже', commands.rowBelow], ['Столбец слева', commands.columnLeft], ['Столбец справа', commands.columnRight],
      ['Объединить ячейки', commands.merge], ['Разделить ячейку', commands.split], ['Удалить строку', commands.deleteRow], ['Удалить столбец', commands.deleteColumn], ['Удалить таблицу', commands.remove],
    ];
    for (const [label, run] of menuActions) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.setAttribute('role', 'menuitem');
      button.addEventListener('mousedown', (event) => event.preventDefault()); button.addEventListener('click', () => { run(); closeMenu(); }); menu.append(button);
    }
    for (const [label, run] of [['Цвет ячейки', commands.background], ['Цвет границы', commands.border]] as const) {
      const control = document.createElement('input'); control.type = 'color'; control.setAttribute('aria-label', label); control.addEventListener('input', () => run(control.value)); menu.append(control);
    }
    const pointerDown = (event: PointerEvent) => {
      if (editor.isReadOnly() || event.button !== 0) return;
      closeMenu(); const cell = targetCell(event.target, root);
      if (!cell) { clearSelection(); currentTable = undefined; return; }
      if (event.shiftKey && anchor && root.contains(anchor)) { event.preventDefault(); selectRegion(anchor, cell); }
      else { clearSelection(); anchor = cell; currentTable = cell.closest('table')!; }
      dragging = true;
    };
    const pointerMove = (event: PointerEvent) => {
      if (editor.isReadOnly() || resizing) return;
      const cell = targetCell(event.target, root);
      if (!cell) return;
      if (dragging && anchor && cell !== anchor) { selectRegion(anchor, cell); return; }
      const table = cell.closest('table')!; const grid = readGrid(table); const item = grid.cells.find((entry) => entry.element === cell)!;
      const rect = cell.getBoundingClientRect(); const parent = editor.element.getBoundingClientRect();
      const column = item.column + item.colspan - 1;
      hover = { table, column, width: rect.width / item.colspan };
      handle.style.left = `${rect.right - parent.left - 3}px`; handle.style.top = `${rect.top - parent.top}px`; handle.style.height = `${rect.height}px`; handle.hidden = false;
    };
    const pointerUp = () => { dragging = false; };
    const contextMenu = (event: MouseEvent) => {
      const cell = targetCell(event.target, root); if (!cell || editor.isReadOnly()) return;
      event.preventDefault(); if (!selected.includes(cell)) useCells([cell]);
      const rect = editor.element.getBoundingClientRect();
      menu.hidden = false; menu.style.left = `${Math.max(0, Math.min(event.clientX - rect.left, rect.width - 220))}px`; menu.style.top = `${event.clientY - rect.top}px`;
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { closeMenu(); clearSelection(); return; }
      if (event.key !== 'Tab' || editor.isReadOnly()) return;
      const cell = targetCell(document.getSelection()?.anchorNode ?? null, root); if (!cell) return;
      const table = cell.closest('table')!; const cells = readGrid(table).cells.map((entry) => entry.element); const index = cells.indexOf(cell);
      const next = index + (event.shiftKey ? -1 : 1); event.preventDefault(); clearSelection();
      if (next >= cells.length) { editor.transact(() => insertGridRow(table, table.rows.length)); moveCaret(readGrid(table).cells[cells.length].element); }
      else if (next >= 0) moveCaret(cells[next]);
      else { const previous = table.previousElementSibling as HTMLElement | null; if (previous) moveCaret(previous); }
    };
    const outside = (event: PointerEvent) => { if (!editor.element.contains(event.target as Node)) { closeMenu(); clearSelection(); handle.hidden = true; } };
    let previouslyReadOnly = editor.isReadOnly();
    const update = () => { if (disposed) return; selected = selected.filter((cell) => root.contains(cell)); if (currentTable && !root.contains(currentTable)) currentTable = undefined; handle.hidden = true; hover = undefined; if (editor.isReadOnly()) { closeMenu(); if (!previouslyReadOnly) clearSelection(); } previouslyReadOnly = editor.isReadOnly(); };
    const resizeStart = (event: PointerEvent) => {
      if (!hover || editor.isReadOnly()) return; event.preventDefault();
      currentTable = hover.table; resizing = { ...hover, start: event.clientX, end: event.clientX };
      document.addEventListener('pointermove', resizeMove); document.addEventListener('pointerup', resizeEnd, { once: true }); document.addEventListener('pointercancel', resizeCancel, { once: true });
    };
    const resizeMove = (event: PointerEvent) => { if (resizing) { resizing.end = event.clientX; handle.style.transform = `translateX(${resizing.end - resizing.start}px)`; } };
    const releaseResize = () => { document.removeEventListener('pointermove', resizeMove); document.removeEventListener('pointerup', resizeEnd); document.removeEventListener('pointercancel', resizeCancel); handle.style.transform = ''; };
    const resizeEnd = () => { const state = resizing; resizing = undefined; releaseResize(); if (state && root.contains(state.table) && !editor.isReadOnly()) { currentTable = state.table; applyColumnWidth(state.table, state.column, Math.min(4000, Math.max(40, state.width + state.end - state.start))); } handle.hidden = true; };
    const resizeCancel = () => { resizing = undefined; releaseResize(); handle.hidden = true; };
    root.addEventListener('pointerdown', pointerDown); root.addEventListener('pointermove', pointerMove); root.addEventListener('contextmenu', contextMenu); root.addEventListener('keydown', keydown);
    document.addEventListener('pointerup', pointerUp); document.addEventListener('pointerdown', outside); handle.addEventListener('pointerdown', resizeStart);
    const unsubscribe = editor.subscribe(update); const unselect = editor.onSelectionChange(() => { if (editor.isReadOnly()) update(); });
    return () => {
      disposed = true; root.removeEventListener('paste', pasteRange, true); root.removeEventListener('copy', copyRangeEvent, true); root.removeEventListener('cut', cutRangeEvent, true); status.remove(); resizeCancel(); unsubscribe(); unselect(); removeAPI(); clearSelection();
      root.removeEventListener('pointerdown', pointerDown); root.removeEventListener('pointermove', pointerMove); root.removeEventListener('contextmenu', contextMenu); root.removeEventListener('keydown', keydown);
      document.removeEventListener('pointerup', pointerUp); document.removeEventListener('pointerdown', outside); handle.removeEventListener('pointerdown', resizeStart); menu.remove(); handle.remove();
    };
  },
});

export const tableCommands = (editor: Editor): TableCommands => {
  const commands = editor.getPlugin<TableCommands>('tables'); if (!commands) throw new Error('Install tables() when creating the editor.'); return commands;
};
