import { activeRange } from '../selection/index.js';
import type { ListItemBoundary, ListSelectionResult } from './internal-types.js';

const inlineTags = new Set(['strong', 'em', 'u', 's', 'sub', 'sup', 'a', 'span', 'code', 'br']);
const inlineNode = (node: Node): boolean => node.nodeType === 3 || (node instanceof HTMLElement && node.namespaceURI === 'http://www.w3.org/1999/xhtml' && inlineTags.has(node.localName) && [...node.childNodes].every(inlineNode));
const isList = (node: Node): node is HTMLElement => node instanceof HTMLElement && /^(ul|ol)$/.test(node.localName);
const itemAt = (root: HTMLElement, node: Node): HTMLElement | undefined => {
  const element = node.nodeType === 1 ? node as Element : node.parentElement;
  const item = element?.closest<HTMLElement>('li');
  return item && root.contains(item) ? item : undefined;
};

/** Own inline body ends before direct trailing branches; inspecting never edits DOM. */
export const inspectListItem = (root: HTMLElement, item: HTMLElement): ListItemBoundary | undefined => {
  const list = item.parentElement;
  if (item.localName !== 'li' || item.namespaceURI !== 'http://www.w3.org/1999/xhtml' || !root.contains(item) || !list || !isList(list) || item.hasAttribute('data-mw-node') || list.hasAttribute('data-mw-node')) return;
  const ownNodes: ChildNode[] = [];
  const nestedLists: HTMLElement[] = [];
  for (const node of item.childNodes) {
    if (isList(node)) nestedLists.push(node);
    else {
      // Moving text that follows a branch would silently reorder a partial shape.
      if (nestedLists.length || !inlineNode(node)) return;
      ownNodes.push(node);
    }
  }
  const ownEnd = item.ownerDocument.createRange();
  ownEnd.selectNodeContents(item);
  if (nestedLists.length) ownEnd.setEndBefore(nestedLists[0]);
  ownEnd.collapse(false);
  const breaks = ownNodes.reduce((count, node) => count + (node instanceof Element ? node.querySelectorAll('br').length + Number(node.localName === 'br') : 0), 0);
  return { item: item as HTMLLIElement, ownNodes, nestedLists, ownEnd, ownEmpty: ownNodes.every((node) => !node.textContent) && breaks <= 1 };
};

const blocked = (reason: string): ListSelectionResult => ({ status: 'blocked', reason });
const withinOwnBody = (range: Range, boundary: ListItemBoundary, end: boolean): boolean => {
  const point = range.cloneRange();
  point.collapse(!end);
  return point.compareBoundaryPoints(Range.START_TO_START, boundary.ownEnd) <= 0;
};

/** A list-owned unsupported partial shape is blocked rather than natively cut. */
export const listSelectionReplacement = (root: HTMLElement, range: Range | undefined = activeRange(root)): ListSelectionResult => {
  if (!range || range.collapsed || !root.contains(range.startContainer) || !root.contains(range.endContainer)) return { status: 'unowned' };
  const firstItem = itemAt(root, range.startContainer);
  const lastItem = itemAt(root, range.endContainer);
  if (firstItem === lastItem) return { status: 'unowned' };
  if (!firstItem || !lastItem) return blocked('A list selection cannot cross into a different block container.');
  if (firstItem.parentElement !== lastItem.parentElement) return blocked('Select sibling items in one list.');
  const first = inspectListItem(root, firstItem);
  const last = inspectListItem(root, lastItem);
  if (!first || !last || !withinOwnBody(range, first, false) || !withinOwnBody(range, last, true)) return blocked('List replacement requires direct inline item bodies.');
  const leaves: HTMLLIElement[] = [];
  const gaps: ChildNode[] = [];
  let node: ChildNode | null = first.item;
  while (node) {
    if (node.nodeType === 3 && /^[\t\n\f\r ]*$/.test(node.textContent ?? '')) gaps.push(node);
    else {
      if (!(node instanceof HTMLElement)) return blocked('Unsupported content between list items.');
      const item = inspectListItem(root, node);
      if (!item || (item.item !== last.item && item.nestedLists.length)) return blocked('A selected item contains an unsupported body or nested branch.');
      leaves.push(item.item);
      if (item.item === last.item) return { status: 'eligible', range, leaves, gaps, first, last };
    }
    node = node.nextSibling;
  }
  return blocked('Select consecutive items in one list.');
};
