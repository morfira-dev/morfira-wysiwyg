import type { printUIMessages } from './messages.js';

export interface PrintUIOptions {
  readonly label?: string;
  readonly onError?: (error: unknown) => void;
}

export interface PrintUIController {
  readonly element: HTMLElement;
  print(): boolean;
  cancel(): void;
  isPrinting(): boolean;
  destroy(): void;
}

export type PrintUIMessageKey = keyof typeof printUIMessages.en;
