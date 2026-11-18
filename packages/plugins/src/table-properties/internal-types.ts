import type { TableSelectionState } from '../tables/types.js';
import type { TablePropertiesPatch } from './types.js';
import type { GridCell } from '../tables/types.js';

export interface TableHeaderState {
  readonly headerRow: boolean;
  readonly headerColumn: boolean;
}
export interface TableHeaderChange {
  readonly cell: GridCell;
  readonly tag: 'td' | 'th';
  readonly scope: 'row' | 'col' | undefined;
}
export interface TableSemanticsPlan {
  readonly cells: readonly TableHeaderChange[];
  readonly caption: string | false | undefined;
  readonly captionChanged: boolean;
}

export interface TablePropertiesRequest {
  readonly patch: TablePropertiesPatch;
  readonly expected: TableSelectionState;
}
