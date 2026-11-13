import type { LinkFormat, Attributes, Operation, Piece } from './inline-attributes.types.js';
export type { LinkFormat } from './inline-attributes.types.js';
import { validateDocument } from '../document/index.js';
import type { DocumentNode, EditorDocument, ElementNode } from '../document/index.js';
export const inlineStyles: Record<string, string> = { color: 'color', background: 'background-color' };
const blocks = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'figure', 'figcaption']);
const checkedAttributes = (tag: 'span' | 'a', attributes: Attributes): Attributes => (validateDocument({ version: 1, children: [{ type: 'element', tag, attributes, children: [] }] }).children[0] as ElementNode).attributes;
export const normalizeInlineStyle = (name: string, value: unknown): string | false => {
  if (value === false)
    return false;
  if (typeof value !== 'string' || !value.trim() || value.length > 128 || /[;{}]/.test(value))
    throw new TypeError('Expected a CSS color or false.');
  const property = inlineStyles[name];
  const attrs = checkedAttributes('span', { style: `${property}: ${value}` });
  const probe = document.createElement('span');
  probe.setAttribute('style', attrs.style ?? '');
  const color = probe.style.getPropertyValue(property);
  if (!color)
    throw new TypeError('Unsupported or invalid CSS color.');
  return color;
};
export const normalizeLink = (value: unknown): {
  attributes: Attributes;
  text?: string;
} | false => {
  if (value === false)
    return false;
  const input = typeof value === 'string' ? { href: value } : value;
  if (!input || typeof input !== 'object' || Array.isArray(input) || !('href' in input) || typeof input.href !== 'string')
    throw new TypeError('Expected a link URL, LinkFormat or false.');
  const link = input as Record<string, unknown>;
  const attributes: Attributes = { href: input.href };
  if (link.title !== undefined) {
    if (typeof link.title !== 'string' || link.title.length > 1024)
      throw new TypeError('Link title must be a string up to 1024 characters.');
    attributes.title = link.title;
  }
  if (link.target !== undefined) {
    if (link.target !== '_self' && link.target !== '_blank')
      throw new TypeError('Link target must be _self or _blank.');
    attributes.target = link.target;
  }
  if (link.text !== undefined && (typeof link.text !== 'string' || !link.text.length || link.text.length > 20000))
    throw new TypeError('New link text must contain 1–20000 characters.');
  const clean = checkedAttributes('a', attributes);
  if (!clean.href)
    throw new TypeError('Unsupported or unsafe link URL.');
  return { attributes: clean, ...(typeof link.text === 'string' ? { text: link.text } : {}) };
};
export const mergeLinkAttributes = (previous: Attributes, patch: Attributes): Attributes => {
  const attrs = { ...previous, ...patch };
  if (!attrs.title)
    delete attrs.title;
  if (patch.target === '_self')
    delete attrs.rel;
  return checkedAttributes('a', attrs);
};
const equalAttributes = (a?: Attributes, b?: Attributes) => JSON.stringify(Object.entries(a ?? {}).sort()) === JSON.stringify(Object.entries(b ?? {}).sort());
const withoutProperty = (attributes: Attributes, property: string): Attributes => {
  const attrs = { ...attributes };
  const style = (attrs.style ?? '').split(';').map((part) => part.trim()).filter((part) => part && part.slice(0, part.indexOf(':')).trim() !== property).join('; ');
  if (style)
    attrs.style = style;
  else
    delete attrs.style;
  return attrs;
};
const groupPieces = (pieces: Piece[]): {
  pieces: Piece[];
  selected: boolean;
  link?: Attributes;
}[] => {
  const result: {
    pieces: Piece[];
    selected: boolean;
    link?: Attributes;
  }[] = [];
  for (const piece of pieces) {
    const last = result.at(-1);
    if (last && last.selected === piece.selected && equalAttributes(last.link, piece.link))
      last.pieces.push(piece);
    else
      result.push({ pieces: [piece], selected: piece.selected, link: piece.link });
  }
  return result;
};
const compact = (nodes: DocumentNode[]): DocumentNode[] => {
  const result: DocumentNode[] = [];
  for (const node of nodes) {
    const next = node.type === 'element' ? { ...node, children: compact(node.children) } : node;
    const previous = result.at(-1);
    if (next.type === 'text' && previous?.type === 'text')
      previous.text += next.text;
    else if (next.type === 'element' && previous?.type === 'element' && !blocks.has(next.tag) && !['img', 'br', 'hr'].includes(next.tag) && previous.tag === next.tag && equalAttributes(previous.attributes, next.attributes))
      previous.children = compact([...previous.children, ...next.children]);
    else
      result.push(next);
  }
  return result;
};
export const transformInlineAttributes = (document: EditorDocument, from: number, to: number, operation: Operation): EditorDocument => {
  let position = 0;
  const wrap = (pieces: Piece[]): DocumentNode[] => groupPieces(pieces).flatMap((group) => {
    const children = group.pieces.map((piece) => piece.node);
    if (operation.kind === 'style')
      return group.selected && operation.value !== false ? [{ type: 'element', tag: 'span', attributes: { style: `${operation.property}: ${operation.value}` }, children } as ElementNode] : children;
    const attrs = group.selected ? operation.attributes === false ? undefined : mergeLinkAttributes(group.link ?? {}, operation.attributes) : group.link;
    return attrs ? [{ type: 'element', tag: 'a', attributes: attrs, children } as ElementNode] : children;
  });
  const visit = (node: DocumentNode, inheritedLink?: Attributes): Piece[] => {
    if (node.type === 'text') {
      const start = position;
      position += node.text.length;
      const left = Math.max(0, Math.min(node.text.length, from - start));
      const right = Math.max(left, Math.min(node.text.length, to - start));
      return [[0, left, false], [left, right, true], [right, node.text.length, false]].flatMap(([begin, end, selected]) => {
        const text = node.text.slice(begin as number, end as number);
        return text ? [{ node: { type: 'text', text } as DocumentNode, selected: Boolean(selected), link: inheritedLink }] : [];
      });
    }
    const link = operation.kind === 'link' && node.tag === 'a' ? node.attributes : inheritedLink;
    if (!node.children.length)
      return [{ node, selected: position >= from && position < to, link }];
    const children = node.children.flatMap((child) => visit(child, link));
    if (operation.kind === 'link' && node.tag === 'a')
      return children;
    if (blocks.has(node.tag))
      return [{ node: { ...node, children: wrap(children) }, selected: false }];
    return groupPieces(children).flatMap<Piece>((group) => {
      const attrs = operation.kind === 'style' && group.selected ? withoutProperty(node.attributes, operation.property) : node.attributes;
      const content = group.pieces.map((piece) => piece.node);
      if (node.tag === 'span' && !Object.keys(attrs).length)
        return group.pieces;
      return [{ node: { ...node, attributes: attrs, children: content }, selected: group.selected, link: group.link }];
    });
  };
  return { version: 1, children: compact(wrap(document.children.flatMap((node) => visit(node)))) };
};
