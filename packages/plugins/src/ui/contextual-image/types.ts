import type { contextualImageUIMessages } from './messages.js';

export interface ContextualImageUIOptions {
  readonly label?: string;
  readonly gap?: number;
  readonly onError?: (error: unknown) => void;
}

export interface ContextualImageUIController {
  readonly element: HTMLElement;
  refresh(): void;
  destroy(): void;
}

export type ContextualImageUIMessageKey = keyof typeof contextualImageUIMessages.en;
