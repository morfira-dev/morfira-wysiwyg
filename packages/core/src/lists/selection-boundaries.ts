import { activeRange } from '../selection/index.js';
import { isOrdinaryQuote } from './paste-payload.js';
import type { ListItemBoundary, ListSelectionOptions, ListSelectionResult } from './internal-types.js';

const inlineTags = new Set(['strong', 'em', 'u', 's', 'sub', 'sup', 'a', 'span', 'code', 'br']);
const inlineNode = (node: Node): boolean => node.nodeType === 3 || (node instanceof HTMLElement && node.namespaceURI === 'http://www.w3.org/1999/xhtml' && inlineTags.has(node.localName) && [...node.childNodes].every(inlineNode));
const isList = (node: Node): node is HTMLElement => node instanceof HTMLElement && /^(ul|ol)$/.test(node.localName);
const itemAt = (root: HTMLElement, node: Node): HTMLElement | undefined => {
  const element = node.nodeType === 1 ? node as Element : node.parentElement;
  const item = element?.closest<HTMLElement>('li');
  return item && root.contains(item) ? item : undefined;
};

/** Own inline body ends before direct trailing branches; inspecting never edits DOM. */
const inspectItem = (root: HTMLElement, item: HTMLElement, preserveQuotes: boolean): ListItemBoundary | undefined => {
  const list = item.parentElement;
  if (item.localName !== 'li' || item.namespaceURI !== 'http://www.w3.org/1999/xhtml' || !root.contains(item) || !list || !isList(list) || item.hasAttribute('data-mw-node') || list.hasAttribute('data-mw-node')) return;
  const ownNodes: ChildNode[] = [];
  const bodies: HTMLElement[] = [];
  const nestedLists: HTMLElement[] = [];
  for (const node of item.childNodes) {
    if (isList(node)) nestedLists.push(node);
    else {
      // Moving text that follows a branch would silently reorder a partial shape.
      if (nestedLists.length) return;
      const paragraph = node instanceof HTMLElement && /^(p|h[1-6])$/.test(node.localName)
        && node.namespaceURI === item.namespaceURI && !node.hasAttribute('data-mw-node') && [...node.childNodes].every(inlineNode);
      const quote = preserveQuotes && isOrdinaryQuote(node);
      if (node instanceof HTMLElement && (paragraph || quote) && (!ownNodes.length || bodies.length)) {
        bodies.push(node);
        ownNodes.push(...node.childNodes);
      } else {
        if (bodies.length || !inlineNode(node)) return;
        ownNodes.push(node);
      }
    }
  }
  if (!bodies.length) bodies.push(item);
  const body = bodies[0];
  const ownStart = item.ownerDocument.createRange();
  ownStart.selectNodeContents(body);
  ownStart.collapse(true);
  const ownEnd = item.ownerDocument.createRange();
  ownEnd.selectNodeContents(bodies[bodies.length - 1]);
  if (body === item && nestedLists.length) ownEnd.setEndBefore(nestedLists[0]);
  ownEnd.collapse(false);
  const breaks = ownNodes.reduce((count, node) => count + (node instanceof Element ? node.querySelectorAll('br').length + Number(node.localName === 'br') : 0), 0);
  return { item: item as HTMLLIElement, body, bodies, ownNodes, nestedLists, ownStart, ownEnd, ownEmpty: ownNodes.every((node) => !node.textContent) && breaks <= 1 };
};

/** Native/boundary callers deliberately keep the ordinary inline/p/h profile. */
export const inspectListItem = (root: HTMLElement, item: HTMLElement): ListItemBoundary | undefined => inspectItem(root, item, false);

const blocked = (reason: string): ListSelectionResult => ({ status: 'blocked', reason });
/** Resolve an inline body or an unambiguous edge between direct body blocks. */
export const listBodyAt = (range: Range, boundary: ListItemBoundary, end: boolean): HTMLElement | undefined => {
  const node = end ? range.endContainer : range.startContainer;
  const offset = end ? range.endOffset : range.startOffset;
  if (boundary.body === boundary.item) return boundary.item;
  if (node === boundary.item) {
    if (offset > boundary.bodies.length) return;
    const index = end ? Math.max(0, offset - 1) : Math.min(offset, boundary.bodies.length - 1);
    return boundary.bodies[index];
  }
  return boundary.bodies.find((body) => body === node || body.contains(node));
};
/** Translate only unambiguous item-level edges; never mutate the active Range. */
export const normalizeListBodyRange = (range: Range, boundary: ListItemBoundary, end: boolean): Range | undefined => {
  const body = listBodyAt(range, boundary, end);
  if (!body) return;
  const point = range.cloneRange();
  point.collapse(!end);
  if (boundary.body !== boundary.item && point.startContainer === boundary.item) {
    const atStart = point.startOffset === 0 || (!end && point.startOffset < boundary.bodies.length);
    point.selectNodeContents(body);
    point.collapse(atStart);
  }
  if (point.compareBoundaryPoints(Range.START_TO_START, boundary.ownStart) < 0 || point.compareBoundaryPoints(Range.START_TO_START, boundary.ownEnd) > 0) return;
  return point;
};

/** A list-owned unsupported partial shape is blocked rather than natively cut. */
const selectionPlan = (root: HTMLElement, range: Range | undefined, options: ListSelectionOptions): ListSelectionResult => {
  const { includeSameBody, includeCollapsed, preserveQuotes } = options;
  if (!range || (range.collapsed && !includeCollapsed) || !root.contains(range.startContainer) || !root.contains(range.endContainer)) return { status: 'unowned' };
  const firstItem = itemAt(root, range.startContainer);
  const lastItem = itemAt(root, range.endContainer);
  if (!firstItem && !lastItem) return { status: 'unowned' };
  if (!firstItem || !lastItem) return blocked('A list selection cannot cross into a different block container.');
  if (firstItem.parentElement !== lastItem.parentElement) return blocked('Select sibling items in one list.');
  const first = inspectItem(root, firstItem, preserveQuotes);
  const last = inspectItem(root, lastItem, preserveQuotes);
  const start = first && normalizeListBodyRange(range, first, false);
  const startBody = first && listBodyAt(range, first, false);
  // A collapsed li-level point between blocks denotes the next body's start.
  // Resolving its end independently would instead pick the preceding body.
  const end = range.collapsed ? start : last && normalizeListBodyRange(range, last, true);
  const endBody = range.collapsed ? startBody : last && listBodyAt(range, last, true);
  if (!first || !last || !start || !end || !startBody || !endBody) {
    // Preserve legacy same-item paths except an explicitly block-shaped source.
    if (!includeSameBody && firstItem === lastItem && ![...firstItem.children].some((node) => /^(p|h[1-6])$/.test(node.localName))) return { status: 'unowned' };
    return blocked('List replacement requires inline content or ordinary paragraph/heading bodies.');
  }
  if (preserveQuotes && (startBody.localName === 'blockquote' || endBody.localName === 'blockquote'))
    return blocked('A block insertion endpoint cannot enter an existing quote.');
  if (!includeSameBody && firstItem === lastItem && startBody === endBody) return { status: 'unowned' };
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
      const item = inspectItem(root, node, preserveQuotes);
      if (!item || (item.item !== last.item && item.nestedLists.length)) return blocked('A selected item contains an unsupported body or nested branch.');
      if (preserveQuotes) {
        const from = item.item === first.item ? item.bodies.indexOf(startBody) : 0;
        const to = item.item === last.item ? item.bodies.indexOf(endBody) : item.bodies.length - 1;
        if (item.bodies.slice(from, to + 1).some((body) => body.localName === 'blockquote'))
          return blocked('A block insertion cannot cover or cross an existing quote.');
      }
      leaves.push(item.item);
      if (item.item === last.item) return { status: 'eligible', range: workingRange, leaves, gaps, first, last, startBody, endBody };
    }
    node = node.nextSibling;
  }
  return blocked('Select consecutive items in one list.');
};

/** Existing callers keep their earlier native and ordinary insertion ownership. */
export const listSelectionReplacement = (root: HTMLElement, range: Range | undefined = activeRange(root), includeSameBody = false, includeCollapsed = false): ListSelectionResult => selectionPlan(root, range, { includeSameBody, includeCollapsed, preserveQuotes: false });

/** Only block payload candidates may preserve opaque quotes beside their range. */
export const listPasteSelection = (root: HTMLElement, range: Range | undefined = activeRange(root), blockCandidate = false): ListSelectionResult => selectionPlan(root, range, {
  includeSameBody: blockCandidate,
  includeCollapsed: blockCandidate,
  preserveQuotes: blockCandidate,
});
