import { selectionReplacement, cutSelectionReplacement, ensureReplacementPlaceholder, finishSelectionReplacement } from './replace-selection.js';
import { insertInlineFragment } from './inline-fragment.js';

const inlineTags = new Set(['strong', 'em', 'u', 's', 'sub', 'sup', 'a', 'span', 'code', 'br', 'img']);
const leafTags = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const blockTags = new Set([...leafTags, 'blockquote', 'pre', 'hr', 'ul', 'ol', 'table', 'figure']);
const inlineNode = (node: Node): boolean => node.nodeType === 3 || (node instanceof HTMLElement && inlineTags.has(node.localName));
const ordinaryPayloadLeaf = (node: Node): node is HTMLElement => node instanceof HTMLElement && leafTags.has(node.localName) && !node.hasAttribute('data-mw-node') && [...node.childNodes].every(inlineNode);
const stripPlaceholder = (element: HTMLElement): void => {
  if (!element.textContent && element.querySelectorAll('br').length <= 1 && !element.querySelector('img')) {
    for (const placeholder of element.querySelectorAll('br')) placeholder.remove();
  }
};

/** Validate/normalize a detached payload only when the new sibling-range path owns it. */
export const prepareSelectionPaste = (root: HTMLElement, fragment: DocumentFragment, range?: Range): void => {
  const selected = selectionReplacement(root, range);
  if (!selected) return;
  if (fragment.querySelector('table table') || (selected.leaves[0].closest('td,th') && fragment.querySelector('table')))
    throw new TypeError('Nested table insertion is unsupported for this selection.');
  for (const node of fragment.childNodes) {
    if (!inlineNode(node) && (!(node instanceof HTMLElement) || !blockTags.has(node.localName)))
      throw new TypeError('Unsupported root structure for sibling selection insertion.');
  }
  for (const element of fragment.querySelectorAll('*')) {
    if ((inlineTags.has(element.localName) || leafTags.has(element.localName)) && ![...element.childNodes].every(inlineNode))
      throw new TypeError('A phrasing wrapper cannot contain pasted blocks.');
  }
  const hasBlocks = [...fragment.childNodes].some((node) => !inlineNode(node));
  if (hasBlocks) {
    for (const node of [...fragment.childNodes]) {
      if (node.nodeType === 3 && /^[\t\n\f\r ]*$/.test(node.textContent ?? '')) node.remove();
    }
  }
};

const placeholderAtStart = (leaf: HTMLElement): Range => {
  const caret = leaf.ownerDocument.createRange();
  caret.selectNodeContents(leaf);
  caret.collapse(true);
  ensureReplacementPlaceholder(leaf, caret);
  return caret;
};

const meaningfulTail = (tail: DocumentFragment): boolean => Boolean(tail.textContent) || [...tail.querySelectorAll('*')].some((node) => node.attributes.length || ['br', 'img'].includes(node.localName));

/** A validated fragment replaces only the accepted ordinary sibling range. */
export const replaceSelectionWithFragment = (root: HTMLElement, fragment: DocumentFragment): boolean => {
  const selected = selectionReplacement(root);
  if (!selected) return false;
  // Trusted focus listeners may have changed the context since detached preflight.
  prepareSelectionPaste(root, fragment, selected.range);
  const nodes = [...fragment.childNodes];
  const singleParagraph = nodes.length === 1 && ordinaryPayloadLeaf(nodes[0]) && nodes[0].localName === 'p';
  const inline = nodes.every(inlineNode) || singleParagraph;
  const leaves = nodes.length > 1 && nodes.every(ordinaryPayloadLeaf);
  const { left, right, tail, caret } = cutSelectionReplacement(selected);
  if (inline) {
    if (singleParagraph) fragment.replaceChildren(...nodes[0].childNodes);
    insertInlineFragment(left, caret, fragment);
    left.append(tail);
    finishSelectionReplacement(left, caret);
    return true;
  }
  if (leaves) {
    const first = nodes[0] as HTMLElement;
    const last = nodes[nodes.length - 1] as HTMLElement;
    stripPlaceholder(first);
    const prefix = root.ownerDocument.createDocumentFragment();
    prefix.append(...first.childNodes);
    first.remove();
    insertInlineFragment(left, caret, prefix);
    left.after(fragment);
    ensureReplacementPlaceholder(left, caret);
    left.normalize();
    for (const middle of nodes.slice(1, -1)) placeholderAtStart(middle as HTMLElement);
    stripPlaceholder(last);
    const end = root.ownerDocument.createRange();
    end.selectNodeContents(last);
    end.collapse(false);
    last.append(tail);
    finishSelectionReplacement(last, end);
    return true;
  }
  // Mixed root inline runs become proper sibling paragraphs, never children of a mark.
  let paragraph: HTMLParagraphElement | undefined;
  for (const node of [...fragment.childNodes]) {
    if (inlineNode(node)) {
      if (!paragraph) {
        paragraph = root.ownerDocument.createElement('p');
        fragment.insertBefore(paragraph, node);
      }
      paragraph.append(node);
    }
    else paragraph = undefined;
  }
  const last = fragment.lastChild!;
  const inserted = [...fragment.childNodes];
  left.after(fragment);
  ensureReplacementPlaceholder(left, caret);
  left.normalize();
  for (const node of inserted) {
    if (node instanceof HTMLElement && leafTags.has(node.localName)) placeholderAtStart(node);
  }
  const suffix = meaningfulTail(tail) ? right : root.ownerDocument.createElement('p');
  suffix.replaceChildren(tail);
  last.after(suffix);
  finishSelectionReplacement(suffix, placeholderAtStart(suffix));
  return true;
};
