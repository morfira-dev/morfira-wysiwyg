import { ensureReplacementPlaceholder, finishSelectionReplacement } from '../input/replace-selection.js';
import { quoteBodyBlocks } from './paste-payload.js';
import { directQuoteAt, quoteEndpointPoint, quoteSourceBodies } from './quote-selection.js';
import type { ListItemBoundary, QuoteCrossingContext } from './internal-types.js';

/** Read-only inspection; only one quote in one item's selected body interval is owned. */
export const quoteCrossingContext = (boundary: ListItemBoundary, range: Range, startRoot: HTMLElement, endRoot: HTMLElement,
  start: Range, end: Range): QuoteCrossingContext | undefined => {
  if (range.collapsed) return;
  const from = boundary.bodies.indexOf(startRoot);
  const to = boundary.bodies.indexOf(endRoot);
  if (from < 0 || to <= from) return;
  const covered = boundary.bodies.slice(from + 1, to);
  const quotes = boundary.bodies.slice(from, to + 1).filter((body) => body.localName === 'blockquote');
  if (quotes.length !== 1) return;
  const quote = quotes[0];
  if (!quoteSourceBodies(quote)) return;
  const entering = endRoot === quote;
  const exiting = startRoot === quote;
  if ((entering && directQuoteAt(boundary.item, range.endContainer) !== quote)
    || (exiting && directQuoteAt(boundary.item, range.startContainer) !== quote)) return;
  const endpoint = entering ? quoteEndpointPoint(quote, range, true)
    : exiting ? quoteEndpointPoint(quote, range, false) : undefined;
  if ((entering || exiting) && !endpoint) return;
  const normalized = range.cloneRange();
  const left = exiting && endpoint ? endpoint.range : start;
  const right = entering && endpoint ? endpoint.range : end;
  if (left.compareBoundaryPoints(Range.START_TO_START, right) > 0) return;
  normalized.setStart(left.startContainer, left.startOffset);
  normalized.setEnd(right.startContainer, right.startOffset);
  return { kind: entering ? 'enter' : exiting ? 'exit' : 'cover', quote, startRoot, endRoot,
    quoteEndpointBody: endpoint?.body, range: normalized, covered };
};

const ensureBody = (body: HTMLElement): void => {
  const point = body.ownerDocument.createRange();
  point.selectNodeContents(body);
  point.collapse(true);
  ensureReplacementPlaceholder(body, point);
};

/** Payload/source were fully validated before this transaction-owned mutation. */
export const replaceQuoteCrossing = (context: QuoteCrossingContext, roots: HTMLElement[]): void => {
  const { startRoot, endRoot, range, covered, quoteEndpointBody } = context;
  const document = startRoot.ownerDocument;
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
  if (quoteEndpointBody) ensureBody(quoteEndpointBody);
  if (context.kind !== 'exit') ensureBody(startRoot);
  for (const root of roots) {
    const quoteBodies = root.localName === 'blockquote' && quoteBodyBlocks(root);
    if (quoteBodies) for (const body of quoteBodies) ensureBody(body);
    else ensureBody(root);
  }
  const caretBody = context.kind === 'enter' ? document.createElement('p') : endRoot;
  if (context.kind === 'enter') {
    ensureBody(caretBody);
    startRoot.after(...roots, caretBody);
  } else startRoot.after(...roots);
  const caret = document.createRange();
  caret.selectNodeContents(caretBody);
  caret.collapse(true);
  finishSelectionReplacement(caretBody, caret);
};
