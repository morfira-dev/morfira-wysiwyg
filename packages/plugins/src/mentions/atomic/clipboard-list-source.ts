import { atomicFlow, validAtomicMention } from './selection.js';
import type { AtomicClipboardListItem, AtomicClipboardListSelection } from './types.js';

const namespace = 'http://www.w3.org/1999/xhtml';
const inline = new Set(['span', 'strong', 'em', 'u', 's', 'sub', 'sup', 'br']);
const whitespace = (node: Node): boolean => node.nodeType === 3 && /^[\t\n\f\r ]*$/.test(node.textContent ?? '');
const ordinary = (node: Element): boolean => node.namespaceURI === namespace && !node.hasAttribute('data-mw-node')
  && !node.hasAttribute('data-checklist-checked');
const inlineTree = (root: HTMLElement, node: Node, depth: number, budget: { count: number }): boolean => {
  if (++budget.count > 100_000 || depth > 100) return false;
  return node.nodeType === 3 || (node.nodeType === 1
    && (validAtomicMention(root, node as Element) || (ordinary(node as Element) && inline.has((node as Element).localName)
      && [...node.childNodes].every((child) => inlineTree(root, child, depth + 1, budget)))));
};

/** Branch descendants remain opaque: only unselected actual branch roots may move. */
export const clipboardListItem = (root: HTMLElement, item: Element): AtomicClipboardListItem | undefined => {
  if (!ordinary(item) || item.localName !== 'li') return;
  const own: Node[] = [];
  const branches: HTMLElement[] = [];
  const budget = { count: 0 };
  for (const node of item.childNodes) {
    if (own.length + branches.length >= 100_000) return;
    if (node.nodeType === 1 && ['ul', 'ol'].includes((node as Element).localName)) {
      if (!ordinary(node as Element)) return;
      branches.push(node as HTMLElement);
    }
    else if (branches.length) { if (!whitespace(node)) return; }
    else own.push(node);
  }
  if (own.every((node) => inlineTree(root, node, 0, budget)))
    return { item: item as HTMLLIElement, bodies: [item as HTMLElement], branches, direct: true };
  const bodies = own.filter((node) => !whitespace(node));
  budget.count = 0;
  if (!bodies.length || !bodies.every((node) => node.nodeType === 1 && ordinary(node as Element)
    && /^(p|h[1-6])$/.test((node as Element).localName) && [...node.childNodes].every((child) => inlineTree(root, child, 1, budget)))) return;
  return { item: item as HTMLLIElement, bodies: bodies as HTMLElement[], branches, direct: false };
};

const endpoint = (root: HTMLElement, node: Node, offset: number): { profile: AtomicClipboardListItem; body: HTMLElement } | undefined => {
  const element = node.nodeType === 1 ? node as Element : node.parentElement;
  const item = element?.closest('li');
  const flow = atomicFlow(root, node);
  if (!item || !flow) return;
  const profile = clipboardListItem(root, item);
  if (!profile) return;
  const body = profile.bodies.find((candidate) => candidate === node || candidate.contains(node));
  if (!body) return;
  if (profile.direct && node === item && profile.branches.length
    && offset > [...item.childNodes].indexOf(profile.branches[0])) return;
  return { profile, body };
};

export const clipboardListSelection = (root: HTMLElement, range: Range): AtomicClipboardListSelection | undefined => {
  const first = endpoint(root, range.startContainer, range.startOffset);
  const last = endpoint(root, range.endContainer, range.endOffset);
  const list = first?.profile.item.parentElement;
  if (!first || !last || !list || !ordinary(list) || !['ul', 'ol'].includes(list.localName)
    || last.profile.item.parentElement !== list || !root.contains(list)) return;
  const items: AtomicClipboardListItem[] = [];
  for (let node: ChildNode | null = first.profile.item; node; node = node.nextSibling) {
    if (whitespace(node)) continue;
    if (node.nodeType !== 1) return;
    const profile = clipboardListItem(root, node as Element);
    if (!profile) return;
    items.push(profile);
    if (node === last.profile.item) return { list, items, firstBody: first.body, lastBody: last.body };
    if (profile.branches.length) return;
  }
};

export const clipboardListLeaves = (selected: AtomicClipboardListSelection): HTMLElement[] => selected.items.flatMap((profile, index) => {
  const start = index === 0 ? profile.bodies.indexOf(selected.firstBody) : 0;
  const end = index === selected.items.length - 1 ? profile.bodies.indexOf(selected.lastBody) + 1 : profile.bodies.length;
  return profile.bodies.slice(start, end);
});

export const sameClipboardList = (a: AtomicClipboardListSelection | undefined, b: AtomicClipboardListSelection | undefined): boolean => {
  if (!a || !b) return a === b;
  return a.list === b.list && a.firstBody === b.firstBody && a.lastBody === b.lastBody && a.items.length === b.items.length
    && a.items.every((item, index) => item.item === b.items[index].item && item.bodies.length === b.items[index].bodies.length
      && item.bodies.every((body, at) => body === b.items[index].bodies[at]) && item.branches.length === b.items[index].branches.length
      && item.branches.every((branch, at) => branch === b.items[index].branches[at]));
};
