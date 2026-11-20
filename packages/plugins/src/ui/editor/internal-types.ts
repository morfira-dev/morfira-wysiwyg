import type { EditorUIAction, EditorUIBuiltin, EditorUIMessageKey } from './types.js';

export interface EditorUIControl {
  readonly id: string;
  readonly element: HTMLButtonElement | HTMLSelectElement | HTMLInputElement;
  readonly builtin?: EditorUIBuiltin;
  readonly action?: EditorUIAction;
  readonly reset?: boolean;
  readonly labelKey?: EditorUIMessageKey;
  readonly options?: readonly { value: string; key: EditorUIMessageKey }[];
  colorDraft?: string;
}

export interface EditorUIOverflow {
  readonly button: HTMLButtonElement;
  readonly region: HTMLElement;
  refresh(): void;
  close(restoreFocus?: boolean): void;
  destroy(): void;
}

export interface EditorUIOverflowOptions {
  element: HTMLElement;
  toolbar: HTMLElement;
  groups: readonly HTMLElement[];
  priorities: readonly number[];
  label: () => string;
  capture: () => void;
  updateTabs: () => void;
}
