import type { NodeView } from '../types.js';

export interface InlineViewEntry {
  readonly view: NodeView;
  readonly wrapper: HTMLElement;
  text: string;
  attributes: string;
  version: number;
  stop(): void;
}
