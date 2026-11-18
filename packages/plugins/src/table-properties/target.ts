import type { Editor } from '@morfira-dev/wysiwyg-core';
import { getTableSelection } from '../tables/selection.js';
import type { TableSelectionState } from '../tables/types.js';

const protectedElement = (element: Element): boolean => element.getAttribute('contenteditable')?.trim().toLowerCase() === 'false';

/** The existing projection owns grid/semantic/namespace validation; add protected ownership. */
export const tablePropertyTarget = (editor: Editor, range?: Range): TableSelectionState | undefined => {
  const state = getTableSelection(editor, range);
  if (!state) return;
  for (let element: Element | null = state.table; element && element !== editor.surface; element = element.parentElement) {
    if (protectedElement(element)) return;
  }
  if ([...state.table.querySelectorAll('[contenteditable]')].some(protectedElement)) return;
  return state;
};

export const sameTablePropertyTarget = (expected: TableSelectionState, current: TableSelectionState): boolean => expected.table === current.table
  && expected.explicit === current.explicit && expected.revision === current.revision && expected.rows === current.rows && expected.columns === current.columns
  && expected.cells.length === current.cells.length && expected.cells.every((cell, index) => cell === current.cells[index])
  && expected.rectangle.top === current.rectangle.top && expected.rectangle.left === current.rectangle.left
  && expected.rectangle.bottom === current.rectangle.bottom && expected.rectangle.right === current.rectangle.right;
