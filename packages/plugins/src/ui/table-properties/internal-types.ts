import type { TableSelectionState } from '../../tables/types.js';
import type { TablePropertiesState } from '../../table-properties/types.js';
import type { TablePropertiesFormField } from './types.js';

export interface TablePropertiesFormTarget {
  readonly state: TableSelectionState;
  readonly range: Range;
  readonly values: TablePropertiesState;
  readonly revision: number;
}
export interface TablePropertiesFormControl {
  readonly key: TablePropertiesFormField;
  readonly caption: HTMLSpanElement;
  readonly input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
}
