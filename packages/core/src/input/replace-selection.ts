import { ordinaryLeafTags as leafTags, ordinaryLeafSelector } from './leaf-tags.js';
import { inlineSourceChildren as inlineTree } from './inline-source.js';
import { applyNativeRange, activeRange } from '../selection/index.js';
import { quoteSelectionReplacement } from './quote-selection.js';
import type { SelectionReplacement, CutSelectionReplacement } from './internal-types.js';


const ordinaryLeaf = (root: HTMLElement, node: Node): HTMLElement | undefined => {
  const parent = node.nodeType === 1 ? node as Element : node.parentElement;
  const leaf = parent?.closest<HTMLElement>(ordinaryLeafSelector);
  if (!(leaf instanceof HTMLElement) || !root.contains(leaf) || leaf.hasAttribute('data-mw-node') || leaf.closest('li,figure,pre') || !inlineTree(leaf)) return;
  if (leaf.parentElement !== root && !['blockquote', 'td', 'th'].includes(leaf.parentElement?.localName ?? '')) return;
  return leaf;
};

const selectedLeaves = (root: HTMLElement, range: Range): HTMLElement[] | undefined => {
  const left = ordinaryLeaf(root, range.startContainer);
  const right = ordinaryLeaf(root, range.endContainer);
  if (!left || !right || left === right || left.parentElement !== right.parentElement) return;
  const leaves = [left];
  let next: ChildNode | null = left.nextSibling;
  while (next) {
    if (!(next instanceof HTMLElement) || !leafTags.has(next.localName) || ordinaryLeaf(root, next) !== next) return;
    leaves.push(next);
    if (next === right) return leaves;
    next = next.nextSibling;
  }
  return;
};

export const handlesSelectionReplacement = (root: HTMLElement, inputType: string, data: string | null): boolean => {
  if (inputType !== 'deleteContentBackward' && inputType !== 'deleteContentForward' && !(inputType === 'insertText' && typeof data === 'string')) return false;
  return Boolean(nativeSelectionReplacement(root));
};

export const selectionReplacement = (root: HTMLElement, range: Range | undefined = activeRange(root)): SelectionReplacement | undefined => {
  const leaves = range && !range.collapsed ? selectedLeaves(root, range) : undefined;
  return range && leaves ? { range, leaves } : undefined;
};

const nativeSelectionReplacement = (root: HTMLElement): SelectionReplacement | undefined => {
  const range = activeRange(root);
  if (!range || range.collapsed) return;
  return selectionReplacement(root, range) ?? quoteSelectionReplacement(root, range);
};

/** Shared live cut, called only after eligibility and detached import validation. */
export const cutSelectionReplacement = ({ range, leaves, contentRoots, emptyContainers }: SelectionReplacement): CutSelectionReplacement => {
  const left = contentRoots?.left ?? leaves[0];
  const right = contentRoots?.right ?? leaves[leaves.length - 1];
  const document = left.ownerDocument;
  const emptyLeft = !left.textContent && left.querySelectorAll('br').length <= 1;
  const emptyRight = !right.textContent && right.querySelectorAll('br').length <= 1;
  // deleteContents may collapse its own range outside a partially selected mark.
  // A separate collapsed range retains the actual starting inline context.
  const caret = range.cloneRange();
  caret.collapse(true);

  const tailRange = document.createRange();
  tailRange.selectNodeContents(right);
  tailRange.setStart(range.endContainer, range.endOffset);
  const tail = tailRange.extractContents();
  if (emptyRight) {
    for (const placeholder of tail.querySelectorAll('br')) placeholder.remove();
  }

  const cut = document.createRange();
  cut.selectNodeContents(left);
  cut.setStart(range.startContainer, range.startOffset);
  cut.deleteContents();
  if (emptyLeft) {
    // Remove only the placeholder, keeping an empty starting mark/link as text affinity.
    for (const placeholder of left.querySelectorAll('br')) placeholder.remove();
  }
  for (const leaf of leaves.slice(1)) leaf.remove();
  for (const container of emptyContainers ?? []) {
    if (!container.hasChildNodes()) container.remove();
  }
  return { left, right, tail, caret };
};

export const ensureReplacementPlaceholder = (leaf: HTMLElement, caret: Range): void => {
  if (!leaf.textContent && !leaf.querySelector('br,img')) {
    // An empty semantic inline still owns metadata; keep it and its insertion context.
    const placeholder = leaf.ownerDocument.createElement('br');
    caret.insertNode(placeholder);
    caret.setStartBefore(placeholder);
    caret.collapse(true);
  }
};

export const finishSelectionReplacement = (leaf: HTMLElement, caret: Range): void => {
  ensureReplacementPlaceholder(leaf, caret);
  leaf.normalize();
  applyNativeRange(leaf.ownerDocument.getSelection(), caret);
};

/** Replace an accepted native leaf interval inside the editor's validated transaction. */
export const replaceSelection = (root: HTMLElement, text: string): void => {
  const selected = nativeSelectionReplacement(root);
  if (!selected) return;
  const { left, tail, caret } = cutSelectionReplacement(selected);
  if (text) {
    const inserted = root.ownerDocument.createTextNode(text);
    caret.insertNode(inserted);
    caret.setStart(inserted, inserted.length);
    caret.collapse(true);
  }
  left.append(tail);
  finishSelectionReplacement(left, caret);
};
