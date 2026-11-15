import type { EditorUIOptions } from '../editor/types.js';
import type { contextualToolbarMessages } from './messages.js';

export interface ContextualToolbarOptions {
  readonly groups?: EditorUIOptions['groups'];
  readonly density?: EditorUIOptions['density'];
  readonly label?: string;
  readonly onError?: (error: unknown) => void;
  readonly gap?: number;
}

export interface ContextualToolbarController {
  readonly element: HTMLElement;
  refresh(): void;
  destroy(): void;
}

export type ContextualToolbarMessageKey = keyof typeof contextualToolbarMessages.en;
