import type { DocumentNode, EditorDocument, ElementNode } from '@morfira-dev/wysiwyg-core';
import { mentionNodeName } from '../persistence.js';

const inline = new Set(['span', 'strong', 'em', 'u', 's', 'sub', 'sup', 'br']);
const gap = (node: DocumentNode): boolean => node.type === 'text' && /^[\t\n\f\r ]*$/.test(node.text);

export const clipboardListPayload = (value?: EditorDocument): ElementNode | undefined => {
  const node = value?.children[0];
  return value?.children.length === 1 && node?.type === 'element' && ['ul', 'ol'].includes(node.tag) ? node : undefined;
};

/** Flat list bodies only; nested branches and task/foreign ownership remain separate profiles. */
export const normalizeClipboardList = (value: EditorDocument): EditorDocument | undefined => {
  const roots = value.children.filter((node) => !gap(node));
  if (roots.length !== 1 || roots[0].type !== 'element' || !['ul', 'ol'].includes(roots[0].tag)) return;
  const list = roots[0];
  if (list.attributes['data-mw-node']) return;
  let visits = 0;
  const supported = (node: DocumentNode, depth: number): boolean => {
    if (++visits > 100_000 || depth > 100) return false;
    return node.type === 'text' || (inline.has(node.tag)
      && (!node.attributes['data-mw-node'] || node.attributes['data-mw-node'] === mentionNodeName)
      && node.children.every((child) => supported(child, depth + 1)));
  };
  const items = list.children.filter((node) => !gap(node));
  if (!items.length) return;
  for (const node of items) {
    if (++visits > 100_000 || node.type !== 'element' || node.tag !== 'li'
      || node.attributes['data-mw-node'] || node.attributes['data-checklist-checked'] !== undefined) return;
    const wrapped = node.children.some((child) => child.type === 'element' && /^(p|h[1-6])$/.test(child.tag));
    if (wrapped) {
      const bodies = node.children.filter((child) => !gap(child));
      if (!bodies.length || !bodies.every((body) => ++visits <= 100_000 && body.type === 'element'
        && /^(p|h[1-6])$/.test(body.tag) && !body.attributes['data-mw-node']
        && body.children.every((child) => supported(child, 3)))) return;
      node.children = bodies;
    }
    else if (!node.children.every((child) => supported(child, 2))) return;
  }
  list.children = items;
  return { version: 1, children: [list] };
};
