import type { DocumentNode, DocumentTag, EditorDocument, ElementNode } from '../document/index.js';
import type { InlineGroup, Piece } from './types.js';

const blockTags = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'figure', 'figcaption']);

const textLength = (node: DocumentNode): number => node.type === 'text'
  ? node.text.length
  : node.children.reduce((length, child) => length + textLength(child), 0);

export const inlineDocument = (value: EditorDocument, from: number, to: number, tag: DocumentTag, enabled: boolean): EditorDocument => {
  let position = 0;
  const visit = (node: DocumentNode): Piece[] => {
    if (node.type === 'text') {
      const start = position;
      position += node.text.length;
      const left = Math.max(0, Math.min(node.text.length, from - start));
      const right = Math.max(left, Math.min(node.text.length, to - start));
      return [[0, left, false], [left, right, true], [right, node.text.length, false]].flatMap(([begin, end, selected]) => {
        const text = node.text.slice(begin as number, end as number);
        if (!text)
          return [];
        const leaf: DocumentNode = { type: 'text', text };
        return [{ node: selected && enabled ? { type: 'element', tag, attributes: {}, children: [leaf] } as ElementNode : leaf, selected: Boolean(selected) }];
      });
    }
    // Descendants already inherit this mark. Keep their validated wrapper shape unchanged.
    if (enabled && node.tag === tag) {
      position += textLength(node);
      return [{ node, selected: false }];
    }
    const children = node.children.flatMap(visit);
    if (blockTags.has(node.tag))
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
