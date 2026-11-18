import type { imageResizeUIMessages } from './messages.js';

export interface ImageResizeUIOptions {
  readonly label?: string;
  readonly onError?: (error: unknown) => void;
}
export interface ImageResizeUIController {
  readonly element: HTMLElement;
  refresh(): void;
  destroy(): void;
}
export type ImageResizeUIMessageKey = keyof typeof imageResizeUIMessages.en;
