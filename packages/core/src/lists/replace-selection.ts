import { cutSelectionReplacement, finishSelectionReplacement, insertInlineFragment } from '../input/index.js';
import { listSelectionReplacement } from './selection-boundaries.js';
import type { ListSelectionPlan, ListSelectionResult } from './internal-types.js';

const inlineTags = new Set(['strong', 'em', 'u', 's', 'sub', 'sup', 'a', 'span', 'code', 'br', 'img']);
const inlinePayloadNode = (node: Node): boolean => node.nodeType === 3 || (node instanceof HTMLElement && node.namespaceURI === 'http://www.w3.org/1999/xhtml' && inlineTags.has(node.localName) && [...node.childNodes].every(inlinePayloadNode));
const ordinaryParagraph = (fragment: DocumentFragment): HTMLElement | undefined => {
  const node = fragment.firstChild;
  return fragment.childNodes.length === 1 && node instanceof HTMLElement && node.localName === 'p' && !node.hasAttribute('data-mw-node') && [...node.childNodes].every(inlinePayloadNode) ? node : undefined;
};
const requireSupported = (selected: ListSelectionResult): ListSelectionPlan | undefined => {
  if (selected.status === 'blocked') throw new RangeError(selected.reason);
  return selected.status === 'eligible' ? selected : undefined;
};

/** Detached import preflight: an empty sanitized fragment stays a no-op for any source. */
export const prepareListSelectionPaste = (root: HTMLElement, fragment: DocumentFragment, range?: Range): void => {
  if (!fragment.childNodes.length) return;
  const selected = requireSupported(listSelectionReplacement(root, range));
  if (!selected) return;
  if (![...fragment.childNodes].every(inlinePayloadNode) && !ordinaryParagraph(fragment))
    throw new TypeError('List selection insertion supports inline HTML or one ordinary paragraph.');
};

const cutListSelection = (selected: ListSelectionPlan) => {
  const sameItem = selected.first.item === selected.last.item;
  const startIndex = selected.first.bodies.indexOf(selected.startBody);
  const endIndex = selected.last.bodies.indexOf(selected.endBody);
  const following = selected.last.bodies.slice(endIndex + 1);
  const branches = selected.last.nestedLists;
  // Keep unselected branches out of the generic cut: for a direct empty LI,
  // their placeholders must not be mistaken for the own-body placeholder.
  for (const branch of branches) branch.remove();
  for (const body of following) body.remove();
  const leaves = sameItem ? selected.first.bodies.slice(startIndex, endIndex + 1) : selected.leaves;
  const cut = cutSelectionReplacement({ range: selected.range, leaves, contentRoots: { left: selected.startBody, right: selected.endBody } });
  if (!sameItem) {
    for (const body of selected.first.bodies.slice(startIndex + 1)) body.remove();
  }
  // A direct-inline start needs a wrapper only when surviving following blocks
  // would otherwise create a mixed inline/block item. Keep actual descendants.
  if (cut.left === selected.first.item && following.length) {
    const container = cut.caret.startContainer;
    const offset = cut.caret.startOffset;
    const paragraph = cut.left.ownerDocument.createElement('p');
    paragraph.append(...cut.left.childNodes);
    cut.left.append(paragraph);
    cut.caret.setStart(container === cut.left ? paragraph : container, offset);
    cut.caret.collapse(true);
    cut.left = paragraph;
  }
  for (const gap of selected.gaps) gap.remove();
  return { ...cut, following, branches };
};

/** Called only inside the editor transaction after native ownership was chosen. */
export const replaceListSelection = (root: HTMLElement, text: string): boolean => {
  const selected = requireSupported(listSelectionReplacement(root));
  if (!selected) return false;
  const { left, tail, caret, following, branches } = cutListSelection(selected);
  if (text) {
    const inserted = root.ownerDocument.createTextNode(text);
    caret.insertNode(inserted);
    caret.setStart(inserted, inserted.length);
    caret.collapse(true);
  }
  left.append(tail);
  finishSelectionReplacement(left, caret);
  selected.first.item.append(...following, ...branches);
  return true;
};

/** Recheck the live range; trusted focus callbacks may have changed ownership. */
export const replaceListSelectionWithFragment = (root: HTMLElement, fragment: DocumentFragment): boolean => {
  if (!fragment.childNodes.length) return false;
  const selected = requireSupported(listSelectionReplacement(root));
  if (!selected) return false;
  prepareListSelectionPaste(root, fragment, selected.range);
  const paragraph = ordinaryParagraph(fragment);
  const { left, tail, caret, following, branches } = cutListSelection(selected);
  if (paragraph) fragment.replaceChildren(...paragraph.childNodes);
  insertInlineFragment(left, caret, fragment);
  left.append(tail);
  finishSelectionReplacement(left, caret);
  selected.first.item.append(...following, ...branches);
  return true;
};
