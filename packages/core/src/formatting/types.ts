import type { DocumentNode } from '../document/index.js';
export interface Piece {
  node: DocumentNode;
  selected: boolean;
}

export interface InlineGroup {
  selected: boolean;
  children: DocumentNode[];
}
