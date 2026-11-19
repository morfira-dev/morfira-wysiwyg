import type { Editor, SchemaContribution } from '@morfira-dev/wysiwyg-core';
import type { SuggestionOption } from './types.js';

export type Kind = 'mentions' | 'slash';
export interface SuggestionIntegration<T extends SuggestionOption> {
  readonly schema: readonly SchemaContribution[];
  readonly insert: (editor: Editor, candidate: Candidate, item: T) => void;
}
export interface Point {
  node: Text;
  offset: number;
}
export interface Leaf {
  node: Text;
  from: number;
  to: number;
}
export interface Candidate {
  query: string;
  text: string;
  block: HTMLElement;
  start: Point;
  end: Point;
  leaves: Leaf[];
}
export interface Request {
  abort: AbortController;
  timer?: ReturnType<typeof setTimeout>;
}
