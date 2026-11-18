import type { TableSelectionState } from '../tables/types.js';
import type { TablePropertiesPatch } from './types.js';

export interface TablePropertiesRequest {
  readonly patch: TablePropertiesPatch;
  readonly expected: TableSelectionState;
}
