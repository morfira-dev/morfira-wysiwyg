import type { saveStateUIMessages } from './messages.js';

export interface SaveStateUIOptions {
  readonly label?: string;
  readonly onError?: (error: unknown) => void;
}
export interface SaveStateUIController {
  readonly element: HTMLElement;
  refresh(): void;
  destroy(): void;
}
export type SaveStateUIMessageKey = keyof typeof saveStateUIMessages.en;
