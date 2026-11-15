import type { EditorChange } from '../editor/types.js';
import type { SelectionBookmark, TextSelection } from '../selection/index.js';
import type { EditorLocale } from '../localization/types.js';
declare const eventType: unique symbol;
export interface PluginEvent<T> {
  readonly name: string;
  readonly [eventType]: (payload: T) => T;
}
export interface EditorInputCommit {
  readonly inputType: 'insertParagraph' | 'insertFromPaste';
  readonly sourceEvent: Event;
  readonly selection: SelectionBookmark | undefined;
  readonly isCurrent: () => boolean;
}

export interface EditorEventMap {
  change: EditorChange;
  inputcommit: EditorInputCommit;
  selectionchange: TextSelection | undefined;
  readonlychange: boolean;
  localechange: EditorLocale;
  destroy: void;
}
export interface EditorEvents {
  on<K extends keyof EditorEventMap>(event: K, listener: (payload: EditorEventMap[K]) => void): () => void;
  on<T>(event: PluginEvent<T>, listener: (payload: T) => void): () => void;
  emit<T>(event: PluginEvent<T>, payload: T): void;
}
export interface EventHub {
  events: EditorEvents;
  notify<K extends keyof EditorEventMap>(event: K, payload: EditorEventMap[K]): void;
  destroy(): void;
}
export interface QueuedEvent {
  key: string | object;
  payload: unknown;
  core: boolean;
}
