import type { TableSelectionState } from '../tables/types.js';

export const checkedRowMinHeight = (value: unknown): string | false => {
  if (value === false) return false;
  if (typeof value !== 'string' || !/^[1-9]\d{0,3}px$/.test(value) || Number(value.slice(0, -2)) > 1000)
    throw new TypeError('Minimum row height must be an integer from 1px to 1000px or false.');
  return value;
};

/** The authoritative rectangle already expands through every touched rowspan. */
export const selectedPropertyRows = (target: TableSelectionState): HTMLTableRowElement[] =>
  [...target.table.rows].filter((row) => row.closest('table') === target.table)
    .slice(target.rectangle.top, target.rectangle.bottom + 1);

export const rowMinHeightState = (target: TableSelectionState): string | false => {
  const rows = selectedPropertyRows(target);
  const first = rows[0]?.style.height || false;
  return rows.some((row) => (row.style.height || false) !== first) ? 'mixed' : first;
};
