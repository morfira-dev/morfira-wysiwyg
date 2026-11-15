import type { contextualLinkUIMessages } from './messages.js';

export interface ContextualLinkUIOptions {
  readonly label?: string;
  readonly onError?: (error: unknown) => void;
  readonly gap?: number;
}

export interface ContextualLinkUIController {
  readonly element: HTMLElement;
  refresh(): void;
  destroy(): void;
}

export type ContextualLinkUIMessageKey = keyof typeof contextualLinkUIMessages.en;
