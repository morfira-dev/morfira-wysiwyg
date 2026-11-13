import type { DocumentNode } from '../document/index.js';
export interface LinkFormat {
  href: string;
  title?: string;
  target?: '_self' | '_blank';
  text?: string;
}
export type Attributes = Record<string, string>;
export type Operation = {
  kind: 'style';
  property: string;
  value: string | false;
} | {
  kind: 'link';
  attributes: Attributes | false;
};
export interface Piece {
  node: DocumentNode;
  selected: boolean;
  link?: Attributes;
}
