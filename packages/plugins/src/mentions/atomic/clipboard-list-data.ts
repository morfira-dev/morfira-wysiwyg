import type { DocumentNode, EditorDocument, ElementNode } from '@morfira-dev/wysiwyg-core';
import { mentionNodeName } from '../persistence.js';
import type { AtomicClipboardListNode } from './types.js';

const inline = new Set(['span', 'strong', 'em', 'u', 's', 'sub', 'sup', 'br']);
const gap = (node: DocumentNode): boolean => node.type === 'text' && /^[\t\n\f\r ]*$/.test(node.text);
export const clipboardListNode = (node: DocumentNode): node is AtomicClipboardListNode => node.type === 'element' && ['ul', 'ol'].includes(node.tag);
export const clipboardListPayload = (value?: EditorDocument): ElementNode | undefined => {
  const node = value?.children[0];
  return value?.children.length === 1 && node && clipboardListNode(node) ? node : undefined;
};

/** One recursive grammar owns both reconstructed source branches and incoming lists. */
export const normalizeClipboardList = (value: EditorDocument): EditorDocument | undefined => {
  const roots = value.children.filter((node) => !gap(node));
  if (roots.length !== 1 || !clipboardListNode(roots[0])) return;
  let visits = 0;
  const ordinary = (node: ElementNode): boolean => !node.attributes['data-mw-node']
    && node.attributes['data-checklist-checked'] === undefined;
  const supported = (node: DocumentNode, depth: number): boolean => {
    if (++visits > 100_000 || depth > 100) return false;
    return node.type === 'text' || (inline.has(node.tag)
      && node.attributes['data-checklist-checked'] === undefined
      && (!node.attributes['data-mw-node'] || node.attributes['data-mw-node'] === mentionNodeName)
      && node.children.every((child) => supported(child, depth + 1)));
  };
  const editable = (nodes: readonly DocumentNode[]): boolean => nodes.some((node) => node.type === 'text'
    ? !!node.text : node.tag === 'br' || editable(node.children));
  const ensurePlaceholder = (nodes: DocumentNode[], depth: number): boolean => {
    if (!editable(nodes)) {
      if (++visits > 100_000 || depth > 100) return false;
      nodes.push({ type: 'element', tag: 'br', attributes: {}, children: [] });
    }
    return true;
  };
  const list = (node: ElementNode, depth: number): boolean => {
    if (++visits > 100_000 || depth > 100 || !ordinary(node)) return false;
    const items = node.children.filter((child) => !gap(child));
    if (!items.length) return false;
    for (const item of items) {
      if (++visits > 100_000 || depth + 1 > 100 || item.type !== 'element' || item.tag !== 'li' || !ordinary(item)) return false;
      const own: DocumentNode[] = [];
      const branches: ElementNode[] = [];
      for (const child of item.children) {
        if (clipboardListNode(child)) branches.push(child);
        else if (branches.length) { if (!gap(child)) return false; }
        else own.push(child);
      }
      const wrapped = own.some((child) => child.type === 'element' && /^(p|h[1-6])$/.test(child.tag));
      const bodies = wrapped ? own.filter((child) => !gap(child)) : own;
      if (wrapped) {
        if (!bodies.length || !bodies.every((body) => ++visits <= 100_000 && depth + 2 <= 100 && body.type === 'element'
          && /^(p|h[1-6])$/.test(body.tag) && ordinary(body)
          && body.children.every((child) => supported(child, depth + 3)) && ensurePlaceholder(body.children, depth + 3))) return false;
      }
      else if (!bodies.every((child) => supported(child, depth + 2)) || !ensurePlaceholder(bodies, depth + 2)) return false;
      for (const branch of branches) if (!list(branch, depth + 2)) return false;
      item.children = [...bodies, ...branches];
    }
    node.children = items;
    return true;
  };
  return list(roots[0], 0) ? { version: 1, children: roots } : undefined;
};

const inlineText = (nodes: readonly DocumentNode[]): string => nodes.map((node) => node.type === 'text'
  ? node.text : node.tag === 'br' ? '\n' : inlineText(node.children)).join('');
const ownText = (nodes: readonly DocumentNode[]): string => nodes.length === 1 && nodes[0].type === 'element' && nodes[0].tag === 'br'
  ? '' : inlineText(nodes);
export const clipboardListText = (list: ElementNode): string => list.children.map((node) => {
  const item = node as ElementNode;
  const own = item.children.filter((child) => !clipboardListNode(child));
  const parts = own.some((child) => child.type === 'element' && /^(p|h[1-6])$/.test(child.tag))
    ? own.map((body) => body.type === 'element' ? ownText(body.children) : body.text) : [ownText(own)];
  for (const branch of item.children) if (clipboardListNode(branch)) parts.push(clipboardListText(branch));
  return parts.join('\n');
}).join('\n');
