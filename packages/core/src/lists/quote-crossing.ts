import { ensureReplacementPlaceholder, finishSelectionReplacement } from '../input/replace-selection.js';
import { quoteBodyBlocks } from './paste-payload.js';
import { directQuoteAt, quoteEndpointPoint, quoteSourceBodies } from './quote-selection.js';
import type { ListItemBoundary, QuoteCrossingContext } from './internal-types.js';

/** Read-only inspection of ordinary quotes in one item's selected body interval. */
export const quoteCrossingContext = (boundary: ListItemBoundary, range: Range, startRoot: HTMLElement, endRoot: HTMLElement,
  start: Range, end: Range): QuoteCrossingContext | undefined => {
  if (range.collapsed) return;
  const from = boundary.bodies.indexOf(startRoot);
  const to = boundary.bodies.indexOf(endRoot);
  if (from < 0 || to <= from) return;
  const covered = boundary.bodies.slice(from + 1, to);
  const quotes = boundary.bodies.slice(from, to + 1).filter((body) => body.localName === 'blockquote');
  if (!quotes.length || !quotes.every((quote) => quoteSourceBodies(quote))) return;
  const startQuoted = startRoot.localName === 'blockquote';
  const endQuoted = endRoot.localName === 'blockquote';
  if ((startQuoted && directQuoteAt(boundary.item, range.startContainer) !== startRoot)
    || (endQuoted && directQuoteAt(boundary.item, range.endContainer) !== endRoot)) return;
  const startPoint = startQuoted ? quoteEndpointPoint(startRoot, range, false) : undefined;
  const endPoint = endQuoted ? quoteEndpointPoint(endRoot, range, true) : undefined;
  if ((startQuoted && !startPoint) || (endQuoted && !endPoint)) return;
  const normalized = range.cloneRange();
  const left = startPoint?.range ?? start;
  const right = endPoint?.range ?? end;
  if (left.compareBoundaryPoints(Range.START_TO_START, right) > 0) return;
  normalized.setStart(left.startContainer, left.startOffset);
  normalized.setEnd(right.startContainer, right.startOffset);
  return { startRoot, endRoot, startQuoteBody: startPoint?.body, endQuoteBody: endPoint?.body,
    range: normalized, covered };
};

const ensureBody = (body: HTMLElement): void => {
  const point = body.ownerDocument.createRange();
  point.selectNodeContents(body);
  point.collapse(true);
  ensureReplacementPlaceholder(body, point);
};

/** Payload/source were fully validated before this transaction-owned mutation. */
export const replaceQuoteCrossing = (context: QuoteCrossingContext, roots: HTMLElement[]): void => {
  const { startRoot, endRoot, range, covered, startQuoteBody, endQuoteBody } = context;
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
  const caret = document.createRange();
  caret.selectNodeContents(caretBody);
  caret.collapse(true);
  finishSelectionReplacement(caretBody, caret);
};
