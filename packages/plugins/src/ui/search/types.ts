import type { searchFormMessages } from './messages.js';

export interface SearchFormValues {
  query: string;
  replacement: string;
  caseSensitive: boolean;
  wholeWord: boolean;
}

export interface SearchFormOptions {
  initialValues?: Partial<SearchFormValues>;
  label?: string;
  onError?: (error: unknown) => void;
}

export interface SearchFormController {
  readonly element: HTMLElement;
  refresh(): void;
  getValues(): SearchFormValues;
  setValues(values: Partial<SearchFormValues>): void;
  destroy(): void;
}

export type SearchFormMessageKey = keyof typeof searchFormMessages.en;
