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
  let body = item;
  for (const node of item.childNodes) {
    if (isList(node)) nestedLists.push(node);
    else {
      // Moving text that follows a branch would silently reorder a partial shape.
      if (nestedLists.length || body !== item) return;
      if (node instanceof HTMLElement && /^(p|h[1-6])$/.test(node.localName) && node.namespaceURI === item.namespaceURI && !node.hasAttribute('data-mw-node') && !ownNodes.length && [...node.childNodes].every(inlineNode)) {
        body = node;
        ownNodes.push(...node.childNodes);
      } else {
        if (!inlineNode(node)) return;
        ownNodes.push(node);
      }
    }
  }
  const ownStart = item.ownerDocument.createRange();
  ownStart.selectNodeContents(body);
  ownStart.collapse(true);
  const ownEnd = item.ownerDocument.createRange();
  ownEnd.selectNodeContents(body);
  if (body === item && nestedLists.length) ownEnd.setEndBefore(nestedLists[0]);
  ownEnd.collapse(false);
  const breaks = ownNodes.reduce((count, node) => count + (node instanceof Element ? node.querySelectorAll('br').length + Number(node.localName === 'br') : 0), 0);
  return { item: item as HTMLLIElement, body, ownNodes, nestedLists, ownStart, ownEnd, ownEmpty: ownNodes.every((node) => !node.textContent) && breaks <= 1 };
};

const blocked = (reason: string): ListSelectionResult => ({ status: 'blocked', reason });
/** Translate only unambiguous item-level edges; never mutate the active Range. */
export const normalizeListBodyRange = (range: Range, boundary: ListItemBoundary, end: boolean): Range | undefined => {
  const point = range.cloneRange();
  point.collapse(!end);
  if (boundary.body !== boundary.item && point.startContainer === boundary.item) {
    if (point.startOffset > 1) return;
    const edge = point.startOffset === 0 ? boundary.ownStart : boundary.ownEnd;
    point.setStart(edge.startContainer, edge.startOffset);
    point.collapse(true);
  }
  if (point.compareBoundaryPoints(Range.START_TO_START, boundary.ownStart) < 0 || point.compareBoundaryPoints(Range.START_TO_START, boundary.ownEnd) > 0) return;
  return point;
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
  const start = first && normalizeListBodyRange(range, first, false);
  const end = last && normalizeListBodyRange(range, last, true);
  if (!first || !last || !start || !end) return blocked('List replacement requires inline content or one ordinary paragraph/heading body.');
  const workingRange = range.cloneRange();
  workingRange.setStart(start.startContainer, start.startOffset);
  workingRange.setEnd(end.startContainer, end.startOffset);
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
      if (item.item === last.item) return { status: 'eligible', range: workingRange, leaves, gaps, first, last };
    }
    node = node.nextSibling;
  }
  return blocked('Select consecutive items in one list.');
};
