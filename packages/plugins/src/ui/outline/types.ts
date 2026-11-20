import type { outlineUIMessages } from './messages.js';

export interface OutlineUIOptions {
  readonly label?: string;
  readonly maxHeadings?: number;
  readonly onError?: (error: unknown) => void;
}

export interface OutlineUIController {
  readonly element: HTMLElement;
  refresh(): void;
  destroy(): void;
}

export type OutlineUIMessageKey = keyof typeof outlineUIMessages.en;
