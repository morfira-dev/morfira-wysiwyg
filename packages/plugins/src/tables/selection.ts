import type { Editor } from '@morfira-dev/wysiwyg-core';
import type { TableSelectionReader } from './internal-types.js';
import type { TableSelectionState } from './types.js';
import { cellsInRectangle, readGrid, selectionRectangle } from './grid.js';

const cellAt = (node: Node, root: HTMLElement): HTMLTableCellElement | undefined => {
  const element = node.nodeType === 1 ? node as Element : node.parentElement;
  const cell = element?.closest<HTMLTableCellElement>('td,th');
  return cell && root.contains(cell) ? cell : undefined;
};

const readTableSelection = (root: HTMLElement, selected: readonly HTMLTableCellElement[], range: Range | undefined, revision: number, disabled: boolean): TableSelectionState | undefined => {
  const view = root.ownerDocument.defaultView!;
  const native = root.ownerDocument.getSelection();
  if (range === undefined && native && native.rangeCount > 1) return;
  // Native branding accepts real foreign-realm Ranges while rejecting forged objects.
  const projection = range === undefined
    ? (native?.rangeCount ? native.getRangeAt(0) : undefined)
    : view.Range.prototype.cloneRange.call(range);
  const start = projection && cellAt(projection.startContainer, root);
  const end = projection && cellAt(projection.endContainer, root);
  const explicit = selected.length > 0;
  if (projection && (!start || start !== end)) return;
  const cells = explicit ? [...selected] : start ? [start] : [];
  const table = cells[0]?.closest('table');
  if (!table || !table.isConnected || !root.contains(table) || cells.some((cell) => !root.contains(cell) || cell.closest('table') !== table) || (explicit && start && !cells.includes(start))) return;
  for (let element: Element | null = table; element && element !== root; element = element.parentElement) {
    if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml' || element.hasAttribute('data-mw-node') || (element !== table && element.tagName === 'TABLE')) return;
  }
  for (const element of table.querySelectorAll('*')) {
    if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml' || element.hasAttribute('data-mw-node') || element.tagName === 'TABLE') return;
  }
  try {
    const grid = readGrid(table);
    if (!grid.rows || !grid.columns) return;
    for (const row of grid.slots)
      for (let column = 0; column < grid.columns; column++)
        if (!row[column]) return;
    const rectangle = selectionRectangle(grid, cells);
    const region = cellsInRectangle(grid, rectangle);
    if (region.length !== cells.length || new Set(cells).size !== cells.length || region.some((cell) => !cells.includes(cell.element))) return;
    return { table, cells, rectangle, rows: grid.rows, columns: grid.columns, explicit, revision, canMerge: !disabled && cells.length > 1, canSplit: !disabled && region.some((cell) => cell.rowspan > 1 || cell.colspan > 1) };
  }
  catch {
    return;
  }
};

/** Observe the current table region without including this query in headless table commands. */
export const getTableSelection = (editor: Editor, range?: Range): TableSelectionState | undefined => {
  const reader = editor.getPlugin<TableSelectionReader>('tables:selection');
  if (!reader) throw new Error('Install tables() on an active editor.');
  const [cells, revision, disabled] = reader();
  return readTableSelection(editor.surface, cells, range, revision, disabled);
};
