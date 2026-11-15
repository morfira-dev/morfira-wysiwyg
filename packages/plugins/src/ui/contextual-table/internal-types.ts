import type { TableSelectionState } from '../../tables/types.js';

export type ContextualTableAction = 'rowAbove' | 'rowBelow' | 'deleteRow' | 'columnLeft' | 'columnRight' | 'deleteColumn' | 'merge' | 'split';

export interface ContextualTableTarget {
  readonly state: TableSelectionState;
  readonly range: Range;
  readonly apiRevision: number;
}
