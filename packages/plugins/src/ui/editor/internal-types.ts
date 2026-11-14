import type { EditorUIAction, EditorUIBuiltin, EditorUIMessageKey } from './types.js';

export interface EditorUIControl {
  readonly id: string;
  readonly element: HTMLButtonElement | HTMLSelectElement | HTMLInputElement;
  readonly builtin?: EditorUIBuiltin;
  readonly action?: EditorUIAction;
  readonly reset?: boolean;
  readonly labelKey?: EditorUIMessageKey;
  readonly options?: readonly { value: string; key: EditorUIMessageKey }[];
}
