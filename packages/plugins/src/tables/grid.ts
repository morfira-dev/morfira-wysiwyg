import type { GridCell, TableGrid, CellAddress, CellRectangle } from './types.js';
export type { GridCell, TableGrid, CellAddress, CellRectangle } from './types.js';
const MAX_DIMENSION = 100;
export const readGrid = (table: HTMLTableElement): TableGrid => {
  const rows = [...table.rows].filter((row) => row.closest('table') === table);
  if (rows.length > MAX_DIMENSION)
    throw new RangeError('Table exceeds 100 rows.');
  const slots: GridCell[][] = Array.from({ length: rows.length }, () => []);
  const cells: GridCell[] = [];
  let columns = 0;
  rows.forEach((row, rowIndex) => {
    let column = 0;
    for (const element of [...row.cells]) {
      while (slots[rowIndex][column])
        column++;
      const rowspan = Math.min(element.rowSpan || rows.length - rowIndex, rows.length - rowIndex);
      const colspan = element.colSpan;
      if (column + colspan > MAX_DIMENSION || rowspan < 1)
        throw new RangeError('Table exceeds supported grid dimensions.');
      const cell: GridCell = { element, row: rowIndex, column, rowspan, colspan };
      cells.push(cell);
      for (let y = rowIndex; y < rowIndex + rowspan; y++)
        for (let x = column; x < column + colspan; x++) {
          if (slots[y][x])
            throw new Error('Overlapping table cells.');
          slots[y][x] = cell;
        }
      column += colspan;
      columns = Math.max(columns, column);
    }
  });
  return { rows: rows.length, columns, cells, slots };
};
export const emptyCell = (row: number, column: number, header = false): GridCell => {
  const element = document.createElement(header ? 'th' : 'td');
  element.innerHTML = '<p><br></p>';
  return { element, row, column, rowspan: 1, colspan: 1 };
};
const rowHeights = (table: HTMLTableElement): string[] => [...table.rows]
  .filter((row) => row.closest('table') === table).map((row) => row.style.height);

export const rebuildGrid = (table: HTMLTableElement, cells: GridCell[], rowCount: number, columnCount: number, heights: readonly string[] = rowHeights(table)): void => {
  if (rowCount < 1 || columnCount < 1) {
    table.remove();
    return;
  }
  if (rowCount > MAX_DIMENSION || columnCount > MAX_DIMENSION)
    throw new RangeError('Table dimensions must not exceed 100.');
  const occupied = Array.from({ length: rowCount }, () => Array<boolean>(columnCount).fill(false));
  for (const cell of cells) {
    if (cell.row < 0 || cell.column < 0 || cell.row + cell.rowspan > rowCount || cell.column + cell.colspan > columnCount)
      throw new Error('Cell falls outside table grid.');
    for (let row = cell.row; row < cell.row + cell.rowspan; row++)
      for (let column = cell.column; column < cell.column + cell.colspan; column++) {
        if (occupied[row][column])
          throw new Error('Overlapping cells after table edit.');
        occupied[row][column] = true;
      }
  }
  for (let row = 0; row < rowCount; row++)
    for (let column = 0; column < columnCount; column++)
      if (!occupied[row][column])
        cells.push(emptyCell(row, column));
  const caption = table.caption;
  const existingWidths = [...table.querySelectorAll(':scope > colgroup > col')].map((col) => (col as HTMLElement).style.width);
  const colgroup = document.createElement('colgroup');
  for (let column = 0; column < columnCount; column++) {
    const col = document.createElement('col');
    col.style.width = existingWidths.length === columnCount && existingWidths[column] ? existingWidths[column] : `${100 / columnCount}%`;
    colgroup.append(col);
  }
  const body = document.createElement('tbody');
  const rows = Array.from({ length: rowCount }, (_, index) => {
    const element = document.createElement('tr');
    if (heights[index]) element.style.height = heights[index];
    return body.appendChild(element);
  });
  for (const cell of [...cells].sort((a, b) => a.row - b.row || a.column - b.column)) {
    if (cell.rowspan > 1)
      cell.element.rowSpan = cell.rowspan;
    else
      cell.element.removeAttribute('rowspan');
    if (cell.colspan > 1)
      cell.element.colSpan = cell.colspan;
    else
      cell.element.removeAttribute('colspan');
    rows[cell.row].append(cell.element);
  }
  table.replaceChildren(...(caption ? [caption] : []), colgroup, body);
};
export const selectionRectangle = (grid: TableGrid, selected: HTMLTableCellElement[]): CellRectangle => {
  const cells = grid.cells.filter((cell) => selected.includes(cell.element));
  if (!cells.length)
    throw new Error('Select cells in the current table.');
  const rectangle = { top: Math.min(...cells.map((cell) => cell.row)), left: Math.min(...cells.map((cell) => cell.column)), bottom: Math.max(...cells.map((cell) => cell.row + cell.rowspan - 1)), right: Math.max(...cells.map((cell) => cell.column + cell.colspan - 1)) };
  // Expand to include every spanning cell touched by the rectangle, until stable.
  let changed = true;
  while (changed) {
    changed = false;
    for (const cell of grid.cells) {
      if (cell.row > rectangle.bottom || cell.column > rectangle.right || cell.row + cell.rowspan - 1 < rectangle.top || cell.column + cell.colspan - 1 < rectangle.left)
        continue;
      const next = { top: Math.min(rectangle.top, cell.row), left: Math.min(rectangle.left, cell.column), bottom: Math.max(rectangle.bottom, cell.row + cell.rowspan - 1), right: Math.max(rectangle.right, cell.column + cell.colspan - 1) };
      if (JSON.stringify(next) !== JSON.stringify(rectangle)) {
        Object.assign(rectangle, next);
        changed = true;
      }
    }
  }
  return rectangle;
};
export const cellsInRectangle = (grid: TableGrid, rectangle: CellRectangle): GridCell[] => grid.cells.filter((cell) => cell.row >= rectangle.top && cell.column >= rectangle.left && cell.row + cell.rowspan - 1 <= rectangle.bottom && cell.column + cell.colspan - 1 <= rectangle.right);
const insertGridAxis = (table: HTMLTableElement, index: number, row: boolean): void => {
  const grid = readGrid(table);
  const heights = rowHeights(table);
  if (row) heights.splice(index, 0, '');
  const position = row ? 'row' : 'column';
  const span = row ? 'rowspan' : 'colspan';
  for (const cell of grid.cells) {
    if (cell[position] < index && cell[position] + cell[span] > index)
      cell[span]++;
    else if (cell[position] >= index)
      cell[position]++;
  }
  rebuildGrid(table, grid.cells, grid.rows + (row ? 1 : 0), grid.columns + (row ? 0 : 1), heights);
};
const deleteGridAxis = (table: HTMLTableElement, index: number, row: boolean): void => {
  const grid = readGrid(table);
  const heights = rowHeights(table);
  if (row) heights.splice(index, 1);
  const position = row ? 'row' : 'column';
  const span = row ? 'rowspan' : 'colspan';
  const cells = grid.cells.filter((cell) => cell[position] !== index || cell[span] > 1);
  for (const cell of cells) {
    if (cell[position] <= index && cell[position] + cell[span] > index)
      cell[span]--;
    if (cell[position] > index)
      cell[position]--;
  }
  rebuildGrid(table, cells, grid.rows - (row ? 1 : 0), grid.columns - (row ? 0 : 1), heights);
};
export const insertGridRow = (table: HTMLTableElement, index: number): void => insertGridAxis(table, index, true);
export const insertGridColumn = (table: HTMLTableElement, index: number): void => insertGridAxis(table, index, false);
export const deleteGridRow = (table: HTMLTableElement, index: number): void => deleteGridAxis(table, index, true);
export const deleteGridColumn = (table: HTMLTableElement, index: number): void => deleteGridAxis(table, index, false);
