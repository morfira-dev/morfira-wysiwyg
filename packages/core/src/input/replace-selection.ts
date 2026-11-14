import { activeRange } from '../selection/index.js';

const leafTags = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const inlineTags = new Set(['strong', 'em', 'u', 's', 'sub', 'sup', 'a', 'span', 'code', 'br']);
const inlineTree = (element: Element): boolean => [...element.childNodes].every((node) => node.nodeType === 3 || (node instanceof HTMLElement && inlineTags.has(node.localName) && inlineTree(node)));
const ordinaryLeaf = (root: HTMLElement, node: Node): HTMLElement | undefined => {
  const parent = node.nodeType === 1 ? node as Element : node.parentElement;
  const leaf = parent?.closest<HTMLElement>('p,h1,h2,h3,h4,h5,h6');
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
  const range = activeRange(root);
  return Boolean(range && !range.collapsed && selectedLeaves(root, range));
};

/** Replace only ordinary sibling leaves inside the editor's validated transaction. */
export const replaceSelection = (root: HTMLElement, text: string): void => {
  const range = activeRange(root);
  const leaves = range && !range.collapsed ? selectedLeaves(root, range) : undefined;
  if (!range || !leaves) return;
  const left = leaves[0];
  const right = leaves[leaves.length - 1];
  const document = root.ownerDocument;
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

  if (text) {
    const inserted = document.createTextNode(text);
    caret.insertNode(inserted);
    caret.setStart(inserted, inserted.length);
    caret.collapse(true);
  }
  left.append(tail);
  if (!left.textContent && !left.querySelector('br')) {
    // An empty semantic inline still owns metadata; keep it and its insertion context.
    const placeholder = document.createElement('br');
    caret.insertNode(placeholder);
    caret.setStartBefore(placeholder);
    caret.collapse(true);
  }
  left.normalize();
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(caret);
};
