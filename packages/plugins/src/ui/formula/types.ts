import type { FormulaRenderOptions } from '../../formula/types.js';
import type { formulaMessages } from './messages.js';

export interface FormulaViewOptions extends FormulaRenderOptions {}
export interface FormulaViewController {
  refresh(): void;
  destroy(): void;
}
export interface FormulaFormOptions {
  readonly label?: string;
  readonly onError?: (error: unknown) => void;
}
export interface FormulaFormController {
  readonly element: HTMLDialogElement;
  open(target?: HTMLElement): void;
  close(): void;
  isOpen(): boolean;
  getSource(): string;
  setSource(source: string): void;
  destroy(): void;
}
export type FormulaMessageKey = keyof typeof formulaMessages.en;
