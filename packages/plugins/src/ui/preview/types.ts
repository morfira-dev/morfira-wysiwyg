import type { previewUIMessages } from './messages.js';

export interface PreviewUIOptions {
  readonly label?: string;
  readonly live?: boolean;
  readonly images?: 'omit' | 'load';
  readonly onError?: (error: unknown) => void;
}

export interface PreviewUIController {
  readonly element: HTMLElement;
  open(): void;
  close(): void;
  toggle(): boolean;
  isOpen(): boolean;
  refresh(): void;
  destroy(): void;
}

export type PreviewUIMessageKey = keyof typeof previewUIMessages.en;
