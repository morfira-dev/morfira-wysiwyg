export interface SuggestionQuery {
  query: string;
  signal: AbortSignal;
  limit: number;
}
export interface SuggestionOption {
  id: string;
  label: string;
  description?: string;
}
export interface MentionOption extends SuggestionOption {
}
export type { SlashOption } from '../slash/types.js';
export type SuggestionProvider<T extends SuggestionOption> = (request: SuggestionQuery) => readonly T[] | Promise<readonly T[]>;
export interface SuggestionOptions<T extends SuggestionOption> {
  provide: SuggestionProvider<T>;
  minQueryLength?: number;
  maxItems?: number;
  debounceMs?: number;
}
export interface SuggestionAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface SuggestionState<T extends SuggestionOption> {
  status: 'closed' | 'loading' | 'ready' | 'error';
  query: string;
  items: readonly T[];
  activeIndex: number;
  anchor?: SuggestionAnchor;
  error?: 'provider-error' | 'invalid-results';
}
export interface SuggestionController<T extends SuggestionOption> {
  getState(): SuggestionState<T>;
  subscribe(listener: (state: SuggestionState<T>) => void): () => void;
  onDispose(listener: () => void): () => void;
  open(): boolean;
  close(): void;
  move(direction: -1 | 1): void;
  choose(id: string): boolean;
}
