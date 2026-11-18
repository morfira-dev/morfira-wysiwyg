import type { Editor } from '@morfira-dev/wysiwyg-core';
import { readGrid } from '../tables/grid.js';
import { tableCommands } from '../tables/plugin.js';
import type { TableGrid, TableSelectionState } from '../tables/types.js';
import type { TableHeaderChange, TableHeaderState, TableSemanticsPlan } from './internal-types.js';
import type { TablePropertiesPatch } from './types.js';

export const tableCaption = (table: HTMLTableElement): string | false => table.caption?.textContent || false;

const gridHeaders = (grid: TableGrid): TableHeaderState => {
  const row = grid.cells.filter((cell) => cell.row === 0);
  const headerRow = grid.rows > 1 && row.length > 0 && row.every(({ element, rowspan }) => element.localName === 'th'
    && rowspan === 1 && [null, 'col', 'colgroup'].includes(element.getAttribute('scope')));
  const column = grid.cells.filter((cell) => cell.column === 0 && (!headerRow || cell.row > 0));
  const headerColumn = grid.columns > 1 && column.length > 0 && column.every(({ element, colspan }) => element.localName === 'th'
    && colspan === 1 && [null, 'row', 'rowgroup'].includes(element.getAttribute('scope')));
  return { headerRow, headerColumn };
};
export const tableHeaders = (table: HTMLTableElement): TableHeaderState => gridHeaders(readGrid(table));

/** Resolve all semantic refusals before any styles or live wrappers are changed. */
export const planTableSemantics = (table: HTMLTableElement, patch: TablePropertiesPatch): TableSemanticsPlan => {
  const cells: TableHeaderChange[] = [];
  const captions = [...table.children].filter((child) => child.localName === 'caption');
  if ((patch.headerRow !== undefined || patch.headerColumn !== undefined || patch.caption !== undefined) && captions.length > 1)
    throw new RangeError('Choose a table with at most one caption.');
  if (patch.headerRow !== undefined || patch.headerColumn !== undefined) {
    const grid = readGrid(table);
    if ((patch.headerRow === true && grid.rows < 2) || (patch.headerColumn === true && grid.columns < 2))
      throw new RangeError('A header axis requires a following body row or column.');
    if (grid.cells.some((cell) => (patch.headerRow !== undefined && cell.row === 0 && cell.rowspan > 1)
      || (patch.headerColumn !== undefined && cell.column === 0 && cell.colspan > 1)))
      throw new RangeError('A merged cell crosses the requested header boundary.');
    const previous = gridHeaders(grid);
    const headerRow = patch.headerRow ?? previous.headerRow;
    const headerColumn = patch.headerColumn ?? previous.headerColumn;
    for (const cell of grid.cells) {
      if (!(patch.headerRow !== undefined && cell.row === 0) && !(patch.headerColumn !== undefined && cell.column === 0)) continue;
      const scope = cell.row === 0 && headerRow ? 'col' : cell.column === 0 && headerColumn ? 'row' : undefined;
      const tag = scope ? 'th' : 'td';
      if (cell.element.localName !== tag || cell.element.getAttribute('scope') !== (scope ?? null)) cells.push({ cell, tag, scope });
    }
  }
  const caption = patch.caption;
  const captionChanged = caption !== undefined && (caption === false ? captions.length > 0
    : tableCaption(table) !== caption || table.caption !== table.firstElementChild);
  return { cells, caption, captionChanged };
};

export const applyTableSemantics = (editor: Editor, target: TableSelectionState, plan: TableSemanticsPlan): void => {
  if (!plan.cells.length && !plan.captionChanged) return;
  const document = target.table.ownerDocument;
  const native = document.getSelection();
  const anchor = native?.anchorNode;
  const focus = native?.focusNode;
  const anchorOffset = native?.anchorOffset ?? 0;
  const focusOffset = native?.focusOffset ?? 0;
  const replacements = new Map<Node, Node>();
  for (const { cell, tag, scope } of plan.cells) {
    let element = cell.element;
    if (element.localName !== tag) {
      const replacement = document.createElement(tag);
      for (const attribute of element.attributes) replacement.setAttribute(attribute.name, attribute.value);
      while (element.firstChild) replacement.append(element.firstChild);
      element.replaceWith(replacement);
      replacements.set(element, replacement);
      element = replacement;
    }
    if (scope) element.setAttribute('scope', scope);
    else element.removeAttribute('scope');
  }
  if (plan.captionChanged) {
    if (plan.caption === false) target.table.caption?.remove();
    else {
      const caption = target.table.caption ?? document.createElement('caption');
      if (caption.textContent !== plan.caption) caption.textContent = plan.caption!;
      if (target.table.firstElementChild !== caption) target.table.prepend(caption);
    }
  }
  if (anchor && focus && native && editor.surface.contains(replacements.get(anchor) ?? anchor) && editor.surface.contains(replacements.get(focus) ?? focus))
    native.setBaseAndExtent(replacements.get(anchor) ?? anchor, anchorOffset, replacements.get(focus) ?? focus, focusOffset);
  if (target.explicit && replacements.size) {
    const { top, left, bottom, right } = target.rectangle;
    tableCommands(editor).select({ row: top, column: left }, { row: bottom, column: right });
  }
};
