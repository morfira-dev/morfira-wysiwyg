import { sanitizeHTML } from '@morfira/wysiwyg-core';
import { cellsInRectangle, emptyCell, readGrid, rebuildGrid, selectionRectangle } from './grid.js';
import type { CellRectangle, GridCell } from './grid.js';

export interface TableClipboardInput { html?: string; text?: string; }
export interface TableClipboardData { html: string; text: string; }
const LIMIT = 5_000_000;

const checkLength = (value: string): void => { if (value.length > LIMIT) throw new RangeError('Clipboard content exceeds the size limit.'); };

const parseTSV = (text: string): string[][] => {
  checkLength(text);
  const rows: string[][] = [];
  let row: string[] = []; let field = ''; let quoted = false; let closed = false; let started = false;
  const finishField = () => {
    row.push(field); if (row.length > 100) throw new RangeError('Clipboard range exceeds 100 columns.');
    field = ''; closed = false; started = false;
  };
  const finishRow = () => {
    finishField(); rows.push(row); row = [];
    if (rows.length > 100) throw new RangeError('Clipboard range exceeds 100 rows.');
  };
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') { field += '"'; index++; }
        else { quoted = false; closed = true; }
      } else if (char === '\r') { field += '\n'; if (text[index + 1] === '\n') index++; }
      else field += char;
      continue;
    }
    if (char === '\t') { finishField(); continue; }
    if (char === '\n' || char === '\r') {
      finishRow(); if (char === '\r' && text[index + 1] === '\n') index++;
      continue;
    }
    if (closed) throw new TypeError('Unexpected characters after a quoted clipboard field.');
    if (char === '"') { if (started) throw new TypeError('Quotes inside a clipboard field must be escaped.'); quoted = true; started = true; }
    else { field += char; started = true; }
  }
  if (quoted) throw new TypeError('Unclosed quoted clipboard field.');
  if (row.length || field.length || started || !rows.length || !/[\r\n]$/.test(text)) finishRow();
  return rows;
};

const plainCell = (value: string, row: number, column: number): GridCell => {
  const cell = emptyCell(row, column); const paragraph = document.createElement('p');
  value.split('\n').forEach((line, index) => { if (index) paragraph.append(document.createElement('br')); paragraph.append(document.createTextNode(line)); });
  if (!value) paragraph.append(document.createElement('br'));
  cell.element.replaceChildren(paragraph); return cell;
};

export const readClipboardTable = (data: TableClipboardInput): HTMLTableElement => {
  if (data.html !== undefined) checkLength(data.html);
  if (data.text !== undefined) checkLength(data.text);
  if (data.html) {
    const template = document.createElement('template'); template.innerHTML = sanitizeHTML(data.html);
    const tables = template.content.querySelectorAll('table');
    if (tables.length) {
      if (tables.length !== 1) throw new TypeError('Clipboard must contain one table without nested tables.');
      const table = tables[0]; const grid = readGrid(table);
      if (!grid.rows || !grid.columns) throw new TypeError('Clipboard table is empty.');
      rebuildGrid(table, grid.cells, grid.rows, grid.columns); return table;
    }
    if (/<table(?=[\s/>])/i.test(data.html)) throw new TypeError('Clipboard contains no supported HTML table.');
    if (!data.text?.includes('\t')) {
      const cell = emptyCell(0, 0); cell.element.replaceChildren(template.content);
      if (!cell.element.childNodes.length) cell.element.innerHTML = '<p><br></p>';
      const table = document.createElement('table'); rebuildGrid(table, [cell], 1, 1); return table;
    }
  }
  if (data.text === undefined) throw new TypeError('Clipboard contains no supported table data.');
  const values = parseTSV(data.text); const columns = Math.max(...values.map((row) => row.length));
  const cells = values.flatMap((row, rowIndex) => row.map((value, column) => plainCell(value, rowIndex, column)));
  const table = document.createElement('table'); rebuildGrid(table, cells, values.length, columns); return table;
};

export const isTableClipboard = (data: TableClipboardInput): boolean => {
  // Recognition never inserts the payload into a live DOM. Validation happens before an edit.
  return Boolean(data.html && /<table(?=[\s/>])/i.test(data.html)) || Boolean(data.text?.includes('\t'));
};

const cellText = (cell: HTMLTableCellElement): string => {
  const visit = (node: Node): string => {
    if (node.nodeType === 3) return node.textContent ?? '';
    if (!(node instanceof Element)) return '';
    if (node.localName === 'br') return '\n';
    const block = /^(p|div|h[1-6]|pre|li|blockquote)$/.test(node.localName);
    const placeholder = block && node.childNodes.length === 1 && node.firstChild instanceof HTMLBRElement;
    const content = placeholder ? '' : [...node.childNodes].map(visit).join('');
    return content + (block ? '\n' : '');
  };
  return [...cell.childNodes].map(visit).join('').replace(/\n$/, '');
};
const quoteTSV = (value: string): string => /[\t\r\n"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

export const copyTableRange = (table: HTMLTableElement, cells: HTMLTableCellElement[]): TableClipboardData => {
  const grid = readGrid(table); const rectangle = selectionRectangle(grid, cells);
  const selected = cellsInRectangle(grid, rectangle);
  const output = document.createElement('table');
  const clones = selected.map((cell) => ({ ...cell, element: cell.element.cloneNode(true) as HTMLTableCellElement, row: cell.row - rectangle.top, column: cell.column - rectangle.left }));
  rebuildGrid(output, clones, rectangle.bottom - rectangle.top + 1, rectangle.right - rectangle.left + 1);
  const rows: string[] = [];
  for (let row = rectangle.top; row <= rectangle.bottom; row++) {
    const fields: string[] = [];
    for (let column = rectangle.left; column <= rectangle.right; column++) {
      const cell = grid.slots[row]?.[column]; fields.push(quoteTSV(cell && cell.row === row && cell.column === column ? cellText(cell.element) : ''));
    }
    rows.push(fields.join('\t'));
  }
  return { html: sanitizeHTML(output.outerHTML), text: rows.join('\r\n') };
};

const intersects = (cell: GridCell, area: CellRectangle): boolean => cell.row <= area.bottom && cell.column <= area.right && cell.row + cell.rowspan - 1 >= area.top && cell.column + cell.colspan - 1 >= area.left;
const contained = (cell: GridCell, area: CellRectangle): boolean => cell.row >= area.top && cell.column >= area.left && cell.row + cell.rowspan - 1 <= area.bottom && cell.column + cell.colspan - 1 <= area.right;

export interface TablePastePlan { apply(): void; firstCell: HTMLTableCellElement; }
export const planTablePaste = (table: HTMLTableElement, cells: HTMLTableCellElement[], sourceTable: HTMLTableElement, explicitSelection: boolean): TablePastePlan => {
  const target = readGrid(table); const source = readGrid(sourceTable);
  const selection = selectionRectangle(target, cells);
  const scalar = source.rows === 1 && source.columns === 1 && source.cells.length === 1 && source.cells[0].rowspan === 1 && source.cells[0].colspan === 1;
  const multiple = explicitSelection && cells.length > 1;
  if (explicitSelection && scalar) {
    const targets = cellsInRectangle(target, selection).map((cell) => cell.element);
    return { firstCell: targets[0], apply: () => { for (const cell of targets) cell.replaceChildren(...[...source.cells[0].element.childNodes].map((node) => node.cloneNode(true))); } };
  }
  if (multiple && (selection.bottom - selection.top + 1 !== source.rows || selection.right - selection.left + 1 !== source.columns)) throw new RangeError('Clipboard range must match the selected table rectangle.');
  const area = { top: selection.top, left: selection.left, bottom: selection.top + source.rows - 1, right: selection.left + source.columns - 1 };
  const rows = Math.max(target.rows, area.bottom + 1); const columns = Math.max(target.columns, area.right + 1);
  if (rows > 100 || columns > 100) throw new RangeError('Pasted table would exceed 100 rows or columns.');
  for (const cell of target.cells) if (intersects(cell, area) && !contained(cell, area)) throw new RangeError('Paste would split an existing merged cell. Select its complete area first.');
  const inserted = source.cells.map((cell) => ({ ...cell, element: cell.element.cloneNode(true) as HTMLTableCellElement, row: area.top + cell.row, column: area.left + cell.column }));
  const next = [...target.cells.filter((cell) => !intersects(cell, area)), ...inserted];
  return { firstCell: inserted[0].element, apply: () => rebuildGrid(table, next, rows, columns) };
};
