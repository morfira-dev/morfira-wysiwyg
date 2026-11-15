import type { contextualTableUIMessages } from './messages.js';

export interface ContextualTableUIOptions {
  readonly label?: string;
  readonly gap?: number;
  readonly onError?: (error: unknown) => void;
}

export interface ContextualTableUIController {
  readonly element: HTMLElement;
  refresh(): void;
  destroy(): void;
}

export type ContextualTableUIMessageKey = keyof typeof contextualTableUIMessages.en;
