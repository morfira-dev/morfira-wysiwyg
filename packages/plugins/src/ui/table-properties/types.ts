import type { tablePropertiesFormMessages } from './messages.js';

export interface TablePropertiesFormValues {
  width: string;
  rowMinHeight: string;
  alignment: string;
  cellBackground: string;
  cellBorder: string;
  cellPadding: string;
  cellBorderWidth: string;
  cellBorderStyle: string;
  cellVerticalAlign: string;
  cellTextAlign: string;
  cellDirection: string;
  headerRow: string;
  headerColumn: string;
  caption: string;
}
export interface TablePropertiesFormOptions {
  label?: string;
  onError?: (error: unknown) => void | Promise<void>;
}
export interface TablePropertiesFormController {
  readonly element: HTMLElement;
  refresh(): void;
  getValues(): TablePropertiesFormValues;
  setValues(values: Partial<TablePropertiesFormValues>): void;
  destroy(): void;
}
export type TablePropertiesFormField = keyof TablePropertiesFormValues;
export type TablePropertiesFormMessageKey = keyof typeof tablePropertiesFormMessages.en;
