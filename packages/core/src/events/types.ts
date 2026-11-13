import type { EditorChange } from '../editor/types.js';
import type { TextSelection } from '../selection/index.js';
declare const eventType: unique symbol;
export interface PluginEvent<T> {
  readonly name: string;
  readonly [eventType]: (payload: T) => T;
}
export interface EditorEventMap {
  change: EditorChange;
  selectionchange: TextSelection | undefined;
  readonlychange: boolean;
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
