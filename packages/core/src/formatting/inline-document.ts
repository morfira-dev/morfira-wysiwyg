import type { DocumentNode, DocumentTag, EditorDocument, ElementNode } from '../document/index.js';
import type { InlineGroup, Piece } from './types.js';

import { inlineBlockTags, splitSelectedText } from './inline-pieces.js';

const textLength = (node: DocumentNode): number => node.type === 'text'
  ? node.text.length
  : node.children.reduce((length, child) => length + textLength(child), 0);

export const inlineDocument = (value: EditorDocument, from: number, to: number, tag: DocumentTag, enabled: boolean): EditorDocument => {
  let position = 0;
  const visit = (node: DocumentNode): Piece[] => {
    if (node.type === 'text') {
      const start = position;
      position += node.text.length;
      return splitSelectedText(node.text, start, from, to, (text, selected) => {
        const leaf: DocumentNode = { type: 'text', text };
        return { node: selected && enabled ? { type: 'element', tag, attributes: {}, children: [leaf] } as ElementNode : leaf, selected };
      });
    }
    // Descendants already inherit this mark. Keep their validated wrapper shape unchanged.
    if (enabled && node.tag === tag) {
      position += textLength(node);
      return [{ node, selected: false }];
    }
    const children = node.children.flatMap(visit);
    if (inlineBlockTags.has(node.tag) || node.attributes['data-mw-node'])
      return [{ node: { ...node, children: children.map((piece) => piece.node) }, selected: false }];
    if (!children.length)
      return [{ node, selected: false }];
    const groups: InlineGroup[] = [];
    for (const piece of children) {
      const last = groups.at(-1);
      if (last?.selected === piece.selected)
        last.children.push(piece.node);
      else
        groups.push({ selected: piece.selected, children: [piece.node] });
    }
    return groups.flatMap<Piece>((group) => node.tag === tag && !enabled && group.selected
      ? group.children.map((child) => ({ node: child, selected: true }))
      : [{ node: { ...node, children: group.children }, selected: group.selected }]);
  };
  return { version: 1, children: value.children.flatMap(visit).map((piece) => piece.node) };
};
