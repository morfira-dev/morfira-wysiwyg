import type { sourceEditorMessages } from './messages.js';

export interface SourceEditorOptions {
  readonly label?: string;
  readonly onError?: (error: unknown) => void;
}

export interface SourceEditorPreview {
  readonly html: string;
  readonly changed: boolean;
}

export interface SourceEditorController {
  readonly element: HTMLDialogElement;
  open(): boolean;
  close(): void;
  isOpen(): boolean;
  getValue(): string;
  setValue(value: string): void;
  preview(): SourceEditorPreview | undefined;
  destroy(): void;
}

export type SourceEditorMessageKey = keyof typeof sourceEditorMessages.en;
