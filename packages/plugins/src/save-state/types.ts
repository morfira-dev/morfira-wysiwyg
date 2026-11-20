import type { EditorDocument } from '@morfira-dev/wysiwyg-core';

export type SaveStateStatus = 'saved' | 'dirty' | 'saving' | 'error';
export interface SaveStateSnapshot {
  readonly status: SaveStateStatus;
  readonly dirty: boolean;
  readonly revision: number;
  readonly savedRevision: number;
}
export interface SaveStateContext {
  readonly signal: AbortSignal;
  readonly revision: number;
}
export interface SaveStateOptions {
  readonly save: (document: EditorDocument, context: SaveStateContext) => void | Promise<void>;
  readonly autoSave?: boolean;
  readonly debounceMs?: number;
  readonly onError?: (error: unknown) => void;
}
export interface SaveStateCommands {
  getState(): SaveStateSnapshot;
  save(): Promise<boolean>;
  retry(): Promise<boolean>;
  markSaved(): void;
  subscribe(listener: (state: SaveStateSnapshot) => void): () => void;
}
