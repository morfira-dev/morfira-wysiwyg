import type { documentTags } from './index.js';
export type DocumentTag = typeof documentTags[number];
export interface TextNode {
  type: 'text';
  text: string;
}
export interface ElementNode {
  type: 'element';
  tag: DocumentTag;
  attributes: Record<string, string>;
  children: DocumentNode[];
}
export type DocumentNode = TextNode | ElementNode;
export interface EditorDocument {
  version: 1;
  children: DocumentNode[];
}
