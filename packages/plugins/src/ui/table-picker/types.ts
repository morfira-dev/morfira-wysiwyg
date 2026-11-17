import type { EditorLocale } from '@morfira-dev/wysiwyg-core';
import type { tablePickerMessages } from './messages.js';

export interface TablePickerState {
  readonly locale: EditorLocale;
  readonly disabled: boolean;
}

export interface TablePickerOptions extends TablePickerState {
  readonly rows: number;
  readonly columns: number;
  readonly onSelect: (rows: number, columns: number) => void;
}

export interface TablePickerController {
  readonly element: HTMLElement;
  refresh(state: TablePickerState): void;
  destroy(): void;
}

export type TablePickerFactory = (host: HTMLElement, options: TablePickerOptions) => TablePickerController;
export type TablePickerMessageKey = keyof typeof tablePickerMessages.en;
