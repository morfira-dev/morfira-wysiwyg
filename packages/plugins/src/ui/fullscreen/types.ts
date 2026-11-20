import type { fullscreenUIMessages } from './messages.js';

export interface FullscreenUIOptions {
  readonly target: HTMLElement;
  readonly label?: string;
  readonly onChange?: (active: boolean) => void;
  readonly onError?: (error: unknown) => void;
}

export interface FullscreenUIController {
  readonly element: HTMLButtonElement;
  enter(): boolean;
  exit(): void;
  toggle(): boolean;
  isActive(): boolean;
  refresh(): void;
  destroy(): void;
}

export type FullscreenUIMessageKey = keyof typeof fullscreenUIMessages.en;
