import { formattingWhitespace, isOrdinaryQuote } from './paste-payload.js';
import type { QuoteBodyPoint, QuotePasteContext } from './internal-types.js';

const inlineTags = new Set(['strong', 'em', 'u', 's', 'sub', 'sup', 'a', 'span', 'code', 'br']);
const sourceInlineNode = (node: Node): boolean => node.nodeType === 3 || (node instanceof HTMLElement
  && node.namespaceURI === 'http://www.w3.org/1999/xhtml' && inlineTags.has(node.localName)
  && [...node.childNodes].every(sourceInlineNode));
const sourceBody = (node: Node): node is HTMLElement => node instanceof HTMLElement
  && node.namespaceURI === 'http://www.w3.org/1999/xhtml' && /^(p|h[1-6])$/.test(node.localName)
  && !node.hasAttribute('data-mw-node') && [...node.childNodes].every(sourceInlineNode);

/** Only a quote owned directly by this item can form the bounded inner scope. */
export const directQuoteAt = (item: HTMLElement, node: Node): HTMLElement | undefined => {
  const element = node instanceof Element ? node : node.parentElement;
  const quote = element?.closest('blockquote');
  return quote instanceof HTMLElement && quote.parentElement === item ? quote : undefined;
};

const quoteBodyPoint = (quote: HTMLElement, bodies: HTMLElement[], range: Range, end: boolean): QuoteBodyPoint | undefined => {
  const point = range.cloneRange();
  point.collapse(!end);
  const node = point.startContainer;
  if (bodies[0] === quote) return { body: quote, range: point };
  const contained = bodies.find((body) => body === node || body.contains(node));
  if (contained) return { body: contained, range: point };
  const children = [...quote.childNodes];
  let offset: number;
  if (node === quote) offset = point.startOffset;
  else if (node.parentNode === quote && formattingWhitespace(node)) offset = children.indexOf(node as ChildNode);
  else return;
  const next = children.slice(offset).find((child): child is HTMLElement => bodies.includes(child as HTMLElement));
  const previous = children.slice(0, offset).reverse().find((child): child is HTMLElement => bodies.includes(child as HTMLElement));
  const body = end ? previous ?? bodies[0] : next ?? bodies[bodies.length - 1];
  point.selectNodeContents(body);
  point.collapse(end ? !previous : Boolean(next));
  return { body, range: point };
};

/** Inspect without normalizing the actual quote or changing the active selection. */
export const quotePasteContext = (quote: HTMLElement, range: Range): QuotePasteContext | undefined => {
  if (!isOrdinaryQuote(quote) || !quote.contains(range.startContainer) || !quote.contains(range.endContainer)) return;
  const children = [...quote.childNodes];
  const inline = children.every(sourceInlineNode);
  const blocks = children.filter((node) => !formattingWhitespace(node));
  if (!inline && (!blocks.length || !blocks.every(sourceBody))) return;
  const bodies = inline ? [quote] : blocks as HTMLElement[];
  const start = quoteBodyPoint(quote, bodies, range, false);
  const end = range.collapsed ? start : quoteBodyPoint(quote, bodies, range, true);
  if (!start || !end) return;
  const normalized = range.cloneRange();
  normalized.setStart(start.range.startContainer, start.range.startOffset);
  normalized.setEnd(end.range.startContainer, end.range.startOffset);
  const from = bodies.indexOf(start.body);
  const to = bodies.indexOf(end.body);
  // A noncollapsed formatting-gap selection may resolve to reversed body edges.
  if (from > to || start.range.compareBoundaryPoints(Range.START_TO_START, end.range) > 0) return;
  const gaps = children.filter((node) => {
    if (!formattingWhitespace(node)) return false;
    const gap = quote.ownerDocument.createRange();
    gap.selectNode(node);
    return normalized.compareBoundaryPoints(Range.START_TO_START, gap) <= 0
      && normalized.compareBoundaryPoints(Range.END_TO_END, gap) >= 0;
  });
  return { container: quote, bodies, range: normalized, startBody: start.body, endBody: end.body, gaps };
};
