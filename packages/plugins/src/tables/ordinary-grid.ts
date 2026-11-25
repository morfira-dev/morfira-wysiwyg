import { readGrid } from './grid.js';
import type { TableGrid } from './types.js';

/** Selection is observational, but must not paint another semantic owner's DOM. */
export const ordinaryTableGrid = (root: HTMLElement, table: HTMLTableElement): TableGrid => {
  if (!table.isConnected || !root.contains(table)) throw new Error('The table is no longer in this editor.');
  for (let node: Element | null = table; node && node !== root; node = node.parentElement) {
    if (node.namespaceURI !== 'http://www.w3.org/1999/xhtml' || node.hasAttribute('data-mw-node')
      || (node !== table && node.tagName === 'TABLE')) throw new Error('Unsupported table owner.');
  }
  for (const node of table.querySelectorAll('*')) {
    if (node.namespaceURI !== 'http://www.w3.org/1999/xhtml' || node.hasAttribute('data-mw-node') || node.tagName === 'TABLE')
      throw new Error('Unsupported table content.');
  }
  const grid = readGrid(table);
  if (!grid.rows || !grid.columns) throw new Error('The table is empty.');
  for (const row of grid.slots)
    for (let column = 0; column < grid.columns; column++)
      if (!row[column]) throw new Error('The table grid has missing cells.');
  return grid;
};
