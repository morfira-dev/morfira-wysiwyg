import { ensureReplacementPlaceholder, finishSelectionReplacement } from '../input/replace-selection.js';
import { quoteBodyBlocks } from './paste-payload.js';
import { directQuoteAt, quoteEndpointPoint, quoteSourceBodies } from './quote-selection.js';
import type { ListItemBoundary, QuoteCrossingContext } from './internal-types.js';

/** Read-only inspection of the selected body interval in consecutive inspected items. */
export const quoteCrossingContext = (boundaries: ListItemBoundary[], range: Range, startRoot: HTMLElement, endRoot: HTMLElement,
  start: Range, end: Range, gaps: ChildNode[] = []): QuoteCrossingContext | undefined => {
  if (range.collapsed) return;
  const first = boundaries[0];
  const last = boundaries[boundaries.length - 1];
  const from = first.bodies.indexOf(startRoot);
  const to = last.bodies.indexOf(endRoot);
  if (from < 0 || to < 0 || (first === last && to <= from)) return;
  const affected = boundaries.flatMap((boundary, index) => boundary.bodies.slice(index === 0 ? from : 0,
    index === boundaries.length - 1 ? to + 1 : undefined));
  const quotes = affected.filter((body) => body.localName === 'blockquote');
  if (!quotes.length || !quotes.every((quote) => quoteSourceBodies(quote))) return;
  const startQuoted = startRoot.localName === 'blockquote';
  const endQuoted = endRoot.localName === 'blockquote';
  if ((startQuoted && directQuoteAt(first.item, range.startContainer) !== startRoot)
    || (endQuoted && directQuoteAt(last.item, range.endContainer) !== endRoot)) return;
  const startPoint = startQuoted ? quoteEndpointPoint(startRoot, range, false) : undefined;
  const endPoint = endQuoted ? quoteEndpointPoint(endRoot, range, true) : undefined;
  if ((startQuoted && !startPoint) || (endQuoted && !endPoint)) return;
  const normalized = range.cloneRange();
  const left = startPoint?.range ?? start;
  const right = endPoint?.range ?? end;
  if (left.compareBoundaryPoints(Range.START_TO_START, right) > 0) return;
  normalized.setStart(left.startContainer, left.startOffset);
  normalized.setEnd(right.startContainer, right.startOffset);
  const siblings = boundaries.length > 1 ? {
    container: first.item,
    removedItems: boundaries.slice(1).map((boundary) => boundary.item),
    following: last.bodies.slice(to + 1),
    branches: boundaries.flatMap((boundary) => boundary.nestedLists),
    gaps,
    directStart: startRoot === first.item,
    directEnd: endRoot === last.item,
  } : undefined;
  return { startRoot, endRoot, startQuoteBody: startPoint?.body, endQuoteBody: endPoint?.body,
    range: normalized, covered: affected.slice(1, -1), siblings };
};

const ensureBody = (body: HTMLElement): void => {
  const point = body.ownerDocument.createRange();
  point.selectNodeContents(body);
  point.collapse(true);
  ensureReplacementPlaceholder(body, point);
};

/** Move actual retained inline descendants into a body, keeping the source item as owner. */
const promoteInlineBody = (item: HTMLElement): HTMLElement => {
  const body = item.ownerDocument.createElement('p');
  body.append(...item.childNodes);
  item.append(body);
  return body;
};

/** Payload/source were fully validated before this transaction-owned mutation. */
export const replaceQuoteCrossing = (context: QuoteCrossingContext, roots: HTMLElement[]): void => {
  const { range, covered, startQuoteBody, endQuoteBody, siblings } = context;
  let { startRoot, endRoot } = context;
  const document = startRoot.ownerDocument;
  // Preserve every branch before trimming direct-inline bodies or removing covered items.
  for (const branch of siblings?.branches ?? []) branch.remove();
  // Separate local ranges preserve both actual endpoint wrappers and all untouched
  // quote children/gaps; a cross-container delete would unwrap selected ancestry.
  const suffixCut = document.createRange();
  suffixCut.selectNodeContents(endRoot);
  suffixCut.setEnd(range.endContainer, range.endOffset);
  const prefixCut = document.createRange();
  prefixCut.selectNodeContents(startRoot);
  prefixCut.setStart(range.startContainer, range.startOffset);
  suffixCut.deleteContents();
  prefixCut.deleteContents();
  for (const body of covered) body.remove();
  if (siblings?.directStart) startRoot = promoteInlineBody(startRoot);
  if (siblings?.directEnd) endRoot = promoteInlineBody(endRoot);
  ensureBody(startQuoteBody ?? startRoot);
  if (endQuoteBody) ensureBody(endQuoteBody);
  for (const root of roots) {
    const quoteBodies = root.localName === 'blockquote' && quoteBodyBlocks(root);
    if (quoteBodies) for (const body of quoteBodies) ensureBody(body);
    else ensureBody(root);
  }
  const caretBody = endQuoteBody ? document.createElement('p') : endRoot;
  if (endQuoteBody) {
    ensureBody(caretBody);
    startRoot.after(...roots, caretBody);
  } else startRoot.after(...roots);
  if (siblings) {
    const destination = endQuoteBody ? caretBody : roots[roots.length - 1];
    destination.after(endRoot);
    siblings.container.append(...siblings.following, ...siblings.branches);
    for (const item of siblings.removedItems) item.remove();
    for (const gap of siblings.gaps) gap.remove();
  }
  const caret = document.createRange();
  caret.selectNodeContents(caretBody);
  caret.collapse(true);
  finishSelectionReplacement(caretBody, caret);
};
