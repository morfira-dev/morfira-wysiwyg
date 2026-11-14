import { cutSelectionReplacement, ensureReplacementPlaceholder, finishSelectionReplacement, insertInlineFragment } from '../input/index.js';
import { activeRange } from '../selection/index.js';
import { listPasteSelection, listSelectionReplacement } from './selection-boundaries.js';
import { formattingWhitespace, inlinePayloadNode, isOrdinaryQuote, ordinaryPayloadBody, quoteBodyBlocks } from './paste-payload.js';
import type { ListSelectionPlan, ListSelectionResult } from './internal-types.js';

const ordinaryParagraph = (fragment: DocumentFragment): HTMLElement | undefined => {
  const node = fragment.firstChild;
  return fragment.childNodes.length === 1 && node instanceof HTMLElement && node.localName === 'p' && !node.hasAttribute('data-mw-node') && [...node.childNodes].every(inlinePayloadNode) ? node : undefined;
};
const multiBlockCandidate = (fragment: DocumentFragment): boolean => {
  const nodes = [...fragment.childNodes].filter((node) => !formattingWhitespace(node));
  return nodes.length > 1 && nodes.some((node) => !inlinePayloadNode(node));
};
const headingRoot = (fragment: DocumentFragment): Element | undefined => {
  const nodes = [...fragment.childNodes].filter((node) => !formattingWhitespace(node));
  const node = nodes[0];
  return nodes.length === 1 && node instanceof Element && /^h[1-6]$/.test(node.localName) ? node : undefined;
};
const ordinaryHeading = (fragment: DocumentFragment): HTMLElement | undefined => {
  const node = headingRoot(fragment);
  return node instanceof HTMLElement && node.namespaceURI === 'http://www.w3.org/1999/xhtml'
    && !node.hasAttribute('data-mw-node') && [...node.childNodes].every(inlinePayloadNode) ? node : undefined;
};
const quoteRoot = (fragment: DocumentFragment): Element | undefined => {
  const nodes = [...fragment.childNodes].filter((node) => !formattingWhitespace(node));
  const node = nodes[0];
  return nodes.length === 1 && node instanceof Element && node.localName === 'blockquote' ? node : undefined;
};
const ordinaryQuote = (fragment: DocumentFragment): HTMLElement | undefined => {
  const node = quoteRoot(fragment);
  return node && isOrdinaryQuote(node) ? node : undefined;
};
const blockPasteCandidate = (fragment: DocumentFragment): boolean => multiBlockCandidate(fragment)
  || Boolean(headingRoot(fragment) || quoteRoot(fragment));
const ordinaryBlocks = (fragment: DocumentFragment): HTMLElement[] | undefined => {
  const nodes = [...fragment.childNodes].filter((node) => !formattingWhitespace(node));
  return nodes.length > 1 && nodes.every(ordinaryPayloadBody) ? nodes : undefined;
};
const stripPlaceholder = (body: HTMLElement): void => {
  if (!body.textContent && !body.querySelector('img') && body.querySelectorAll('br').length <= 1) {
    for (const placeholder of body.querySelectorAll('br')) placeholder.remove();
  }
};
const ensureBodyPlaceholder = (body: HTMLElement): void => {
  const caret = body.ownerDocument.createRange();
  caret.selectNodeContents(body);
  caret.collapse(true);
  ensureReplacementPlaceholder(body, caret);
};
const requireSupported = (selected: ListSelectionResult): ListSelectionPlan | undefined => {
  if (selected.status === 'blocked') throw new RangeError(selected.reason);
  return selected.status === 'eligible' ? selected : undefined;
};

/** The transaction owner clears old caret formats only for this validated path. */
export const handlesCollapsedListBlockPaste = (root: HTMLElement, fragment: DocumentFragment, range: Range | undefined = activeRange(root)): boolean => {
  if (!range?.collapsed) return false;
  const innerPayload = Boolean(ordinaryBlocks(fragment) || ordinaryHeading(fragment));
  if (!innerPayload && !ordinaryQuote(fragment)) return false;
  const selected = listPasteSelection(root, range, true);
  return selected.status === 'eligible' && (!selected.quote || innerPayload);
};

/** Detached import preflight: an empty sanitized fragment stays a no-op for any source. */
export const prepareListSelectionPaste = (root: HTMLElement, fragment: DocumentFragment, range?: Range): void => {
  if (!fragment.childNodes.length) return;
  const blocks = ordinaryBlocks(fragment);
  const heading = ordinaryHeading(fragment);
  const quote = ordinaryQuote(fragment);
  const candidate = blockPasteCandidate(fragment);
  const selected = requireSupported(listPasteSelection(root, range, candidate));
  if (!selected) return;
  if (selected.quote && !blocks && !heading)
    throw new TypeError('Insertion inside a list quote supports multiple ordinary paragraphs/headings or one ordinary heading.');
  if (![...fragment.childNodes].every(inlinePayloadNode) && !ordinaryParagraph(fragment) && !blocks && !heading && !quote)
    throw new TypeError('List selection insertion supports inline HTML, an ordinary paragraph, heading or bounded quote, or multiple ordinary paragraphs/headings.');
  if (blocks || heading || quote) {
    for (const node of [...fragment.childNodes]) if (formattingWhitespace(node)) node.remove();
  }
  if (quote && quoteBodyBlocks(quote)) {
    for (const node of [...quote.childNodes]) if (formattingWhitespace(node)) node.remove();
  }
};

const cutListSelection = (selected: ListSelectionPlan, forceParagraph = false) => {
  const context = selected.quote;
  const container = context?.container ?? selected.first.item;
  const sameItem = selected.first.item === selected.last.item;
  const firstBodies = context?.bodies ?? selected.first.bodies;
  const lastBodies = context?.bodies ?? selected.last.bodies;
  const startIndex = firstBodies.indexOf(selected.startBody);
  const endIndex = lastBodies.indexOf(selected.endBody);
  const following: ChildNode[] = context ? [] : lastBodies.slice(endIndex + 1);
  if (context && selected.endBody !== container) {
    let node = selected.endBody.nextSibling;
    while (node) {
      following.push(node);
      node = node.nextSibling;
    }
  }
  const branches = context ? [] : selected.last.nestedLists;
  // Keep unselected branches out of the generic cut: for a direct empty LI,
  // their placeholders must not be mistaken for the own-body placeholder.
  for (const branch of branches) branch.remove();
  for (const body of following) body.remove();
  const leaves = context || sameItem ? firstBodies.slice(startIndex, endIndex + 1) : selected.leaves;
  const cut = cutSelectionReplacement({ range: selected.range, leaves, contentRoots: { left: selected.startBody, right: selected.endBody } });
  if (!context && !sameItem) {
    for (const body of selected.first.bodies.slice(startIndex + 1)) body.remove();
  }
  // A direct-inline start needs a wrapper when surviving or incoming blocks
  // would otherwise create a mixed inline/block item. Keep actual descendants.
  if (cut.left === container && (following.length || forceParagraph)) {
    const caretContainer = cut.caret.startContainer;
    const offset = cut.caret.startOffset;
    const paragraph = cut.left.ownerDocument.createElement('p');
    paragraph.append(...cut.left.childNodes);
    cut.left.append(paragraph);
    cut.caret.setStart(caretContainer === cut.left ? paragraph : caretContainer, offset);
    cut.caret.collapse(true);
    cut.left = paragraph;
  }
  for (const gap of context?.gaps ?? selected.gaps) gap.remove();
  return { ...cut, following, branches, container };
};

/** Called only inside the editor transaction after native ownership was chosen. */
export const replaceListSelection = (root: HTMLElement, text: string): boolean => {
  const selected = requireSupported(listSelectionReplacement(root));
  if (!selected) return false;
  const { left, tail, caret, following, branches, container } = cutListSelection(selected);
  if (text) {
    const inserted = root.ownerDocument.createTextNode(text);
    caret.insertNode(inserted);
    caret.setStart(inserted, inserted.length);
    caret.collapse(true);
  }
  left.append(tail);
  finishSelectionReplacement(left, caret);
  container.append(...following, ...branches);
  return true;
};

/** Recheck the live range; trusted focus callbacks may have changed ownership. */
export const replaceListSelectionWithFragment = (root: HTMLElement, fragment: DocumentFragment): boolean => {
  if (!fragment.childNodes.length) return false;
  const blocks = ordinaryBlocks(fragment);
  const heading = ordinaryHeading(fragment);
  const quote = ordinaryQuote(fragment);
  const standalone = heading ?? quote;
  const candidate = blockPasteCandidate(fragment);
  const selected = requireSupported(listPasteSelection(root, undefined, candidate));
  if (!selected) return false;
  prepareListSelectionPaste(root, fragment, selected.range);
  const paragraph = ordinaryParagraph(fragment);
  // Keep the original end wrapper before a direct start is promoted by the cut.
  const suffix = standalone ? (selected.endBody === (selected.quote?.container ?? selected.last.item)
    ? root.ownerDocument.createElement('p') : selected.endBody.cloneNode(false) as HTMLElement) : undefined;
  const { left, tail, caret, following, branches, container } = cutListSelection(selected, Boolean(blocks || standalone));
  if (standalone && suffix) {
    left.after(standalone, suffix);
    ensureReplacementPlaceholder(left, caret);
    left.normalize();
    const quoteBlocks = quote && quoteBodyBlocks(quote);
    if (quoteBlocks) {
      for (const body of quoteBlocks) ensureBodyPlaceholder(body);
    }
    else ensureBodyPlaceholder(standalone);
    suffix.append(tail);
    const end = root.ownerDocument.createRange();
    end.selectNodeContents(suffix);
    end.collapse(true);
    finishSelectionReplacement(suffix, end);
    container.append(...following, ...branches);
    return true;
  }
  if (blocks) {
    const first = blocks[0];
    const last = blocks[blocks.length - 1];
    stripPlaceholder(first);
    const prefix = root.ownerDocument.createDocumentFragment();
    prefix.append(...first.childNodes);
    first.remove();
    insertInlineFragment(left, caret, prefix);
    left.after(...blocks.slice(1));
    ensureReplacementPlaceholder(left, caret);
    left.normalize();
    for (const middle of blocks.slice(1, -1)) ensureBodyPlaceholder(middle);
    stripPlaceholder(last);
    const end = root.ownerDocument.createRange();
    end.selectNodeContents(last);
    end.collapse(false);
    last.append(tail);
    finishSelectionReplacement(last, end);
    container.append(...following, ...branches);
    return true;
  }
  if (paragraph) fragment.replaceChildren(...paragraph.childNodes);
  insertInlineFragment(left, caret, fragment);
  left.append(tail);
  finishSelectionReplacement(left, caret);
  container.append(...following, ...branches);
  return true;
};
