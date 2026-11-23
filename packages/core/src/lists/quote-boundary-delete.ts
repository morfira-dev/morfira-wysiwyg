import { activeRange } from '../selection/index.js';
import { joinListBodies } from './join-bodies.js';
import { finishSelectionReplacement } from '../input/replace-selection.js';
import { sourceInlineNode } from './source-inline.js';
import { formattingWhitespace } from './paste-payload.js';
import { quoteEndpointPoint, quoteSourceBodies } from './quote-selection.js';
import type { ListQuoteDeleteInspection } from './quote-boundary-delete.types.js';

const leafTag = (node: Element): boolean => /^(p|h[1-6])$/.test(node.localName);
const sibling = (node: Node, forward: boolean): ChildNode | null => {
  let next = forward ? node.nextSibling : node.previousSibling;
  while (next && formattingWhitespace(next)) next = forward ? next.nextSibling : next.previousSibling;
  return next;
};
const ordinary = (node: HTMLElement): boolean => node.namespaceURI === 'http://www.w3.org/1999/xhtml'
  && !node.matches('[data-mw-node],[contenteditable=false]')
  && !node.querySelector('[data-mw-node],[contenteditable=false]') && [...node.childNodes].every(sourceInlineNode);
const edge = (body: HTMLElement, point: Range, forward: boolean): boolean => {
  if (!body.textContent && body.querySelectorAll('br').length <= 1) return true;
  const rest = body.ownerDocument.createRange();
  rest.selectNodeContents(body);
  if (forward) rest.setStart(point.startContainer, point.startOffset);
  else rest.setEnd(point.startContainer, point.startOffset);
  const fragment = rest.cloneContents();
  return !fragment.textContent && !fragment.querySelector('br,img,table,figure,pre,ul,ol');
};
const quoteLeaves = (quote: HTMLElement): HTMLElement[] | undefined => !quote.matches('[data-mw-node],[contenteditable=false]')
  && !quote.querySelector('[data-mw-node],[contenteditable=false]') ? quoteSourceBodies(quote) : undefined;

/** Inspect only actual adjacent bodies; a branch is never a transparent gap. */
export const inspectListQuoteDelete = (root: HTMLElement, forward: boolean): ListQuoteDeleteInspection => {
  const selected = activeRange(root);
  if (!selected?.collapsed) return;
  const element = selected.startContainer instanceof Element ? selected.startContainer : selected.startContainer.parentElement;
  const item = element?.closest('li');
  if (!(item instanceof HTMLElement) || !root.contains(item) || ![...item.children].some((child) => child.localName === 'blockquote')) return;
  let point = selected.cloneRange();
  let node = element;
  if (point.startContainer === item) {
    let previous: ChildNode | undefined = item.childNodes[point.startOffset - 1];
    let next: ChildNode | undefined = item.childNodes[point.startOffset];
    while (previous && formattingWhitespace(previous)) previous = previous.previousSibling ?? undefined;
    while (next && formattingWhitespace(next)) next = next.nextSibling ?? undefined;
    const candidate = forward ? previous ?? next : next ?? previous;
    if (!(candidate instanceof HTMLElement) || !leafTag(candidate) && candidate.localName !== 'blockquote') return 'blocked';
    point.selectNodeContents(candidate);
    point.collapse(forward ? !previous : Boolean(next));
    node = candidate;
  }
  const foundQuote = node?.closest('blockquote');
  const quote = foundQuote && item.contains(foundQuote) ? foundQuote : undefined;
  let current: HTMLElement | undefined;
  if (quote?.parentElement === item) {
    const normalized = quoteEndpointPoint(quote, point, forward);
    if (normalized) { current = normalized.body; point = normalized.range; }
    else {
      if (point.startContainer === quote) return 'blocked';
      current = node?.closest<HTMLElement>('p,h1,h2,h3,h4,h5,h6') ?? quote;
    }
  }
  else current = node?.closest<HTMLElement>('p,h1,h2,h3,h4,h5,h6') ?? undefined;
  if (!current || !edge(current, point, forward)) return;
  for (let ancestor: Element | null = current; ancestor && ancestor !== root; ancestor = ancestor.parentElement)
    if (ancestor.namespaceURI !== 'http://www.w3.org/1999/xhtml' || ancestor.matches('[data-mw-node],[contenteditable=false]')) return 'blocked';
  if (!/^(ul|ol)$/.test(item.parentElement?.localName ?? '') || !ordinary(current)
    || current !== quote && !leafTag(current)) return 'blocked';
  if (quote && (quote.parentElement !== item || !quoteLeaves(quote))) return 'blocked';
  let adjacent = sibling(current, forward);
  if (!adjacent && quote && current !== quote) adjacent = sibling(quote, forward);
  // Preserve the established whole-item lift/join owner at its absolute start.
  if (!adjacent && !forward && ![...item.children].some(leafTag)) return;
  if (!(adjacent instanceof HTMLElement)) return 'blocked';
  let other = adjacent;
  let otherQuote: HTMLElement | undefined;
  if (adjacent.localName === 'blockquote') {
    if (adjacent.parentElement !== item) return 'blocked';
    const bodies = quoteLeaves(adjacent);
    if (!bodies) return 'blocked';
    otherQuote = adjacent;
    other = bodies[forward ? 0 : bodies.length - 1];
  }
  if (!ordinary(other) || other !== otherQuote && !leafTag(other)
    || other.parentElement !== item && other.parentElement !== quote && other.parentElement !== otherQuote) return 'blocked';
  const left = forward ? current : other;
  const right = forward ? other : current;
  return { left, right, rightQuote: forward ? otherQuote : quote ?? undefined };
};

/** Consume only the synchronous inspection from inside the guarded input transaction. */
export const editListQuoteDelete = (plan: ListQuoteDeleteInspection): boolean => {
  if (!plan || plan === 'blocked') return false;
  const { left, right, rightQuote } = plan;
  const join = joinListBodies(left, right);
  if (rightQuote && rightQuote !== left && [...rightQuote.childNodes].every(formattingWhitespace)) rightQuote.remove();
  finishSelectionReplacement(left, join);
  return true;
};
