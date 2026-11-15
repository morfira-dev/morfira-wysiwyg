import { activeRange, placeCaret } from '../selection/index.js';
import { copyDirection } from '../document/direction.js';

const blockTags = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const inlineTags = new Set(['strong', 'em', 'u', 's', 'sub', 'sup', 'a', 'span', 'code', 'br']);
const inlineTree = (element: Element): boolean => [...element.childNodes].every((node) => node.nodeType === 3 || (node instanceof HTMLElement && inlineTags.has(node.localName) && inlineTree(node)));
const parentOf = (node: Node): Element | null => node.nodeType === 1 ? node as Element : node.parentElement;
const editableBlock = (root: HTMLElement, node: Node): HTMLElement | undefined => {
  const block = parentOf(node)?.closest<HTMLElement>('p,h1,h2,h3,h4,h5,h6');
  if (!(block instanceof HTMLElement) || block.namespaceURI !== 'http://www.w3.org/1999/xhtml' || !root.contains(block) || block.closest('li,figure,pre') || !inlineTree(block)) return;
  const parent = block.parentElement;
  if (parent !== root && !['blockquote', 'td', 'th'].includes(parent?.localName ?? '')) return;
  return block;
};
const hasContent = (fragment: DocumentFragment): boolean => Boolean(fragment.textContent || fragment.querySelector('br'));
const selectedBlock = (root: HTMLElement): HTMLElement | undefined => {
  const range = activeRange(root);
  if (!range) return;
  const block = editableBlock(root, range.startContainer);
  return block && editableBlock(root, range.endContainer) === block ? block : undefined;
};
const atEdge = (block: HTMLElement, range: Range, end: boolean): boolean => {
  if (!block.textContent && block.querySelectorAll('br').length <= 1) return true;
  const remainder = block.ownerDocument.createRange();
  remainder.selectNodeContents(block);
  if (end) remainder.setStart(range.endContainer, range.endOffset);
  else remainder.setEnd(range.startContainer, range.startOffset);
  // An actual line break is content even though Range.toString omits it.
  const fragment = remainder.cloneContents();
  return !hasContent(fragment);
};
const siblingBlock = (root: HTMLElement, block: HTMLElement, forward: boolean): HTMLElement | undefined => {
  if (block.hasAttribute('data-mw-node')) return;
  const sibling = forward ? block.nextSibling : block.previousSibling;
  return sibling instanceof HTMLElement && !sibling.hasAttribute('data-mw-node') && blockTags.has(sibling.localName) && editableBlock(root, sibling) === sibling ? sibling : undefined;
};

export const handlesBlockInput = (root: HTMLElement, inputType: string): boolean => {
  const block = selectedBlock(root);
  const range = activeRange(root);
  if (!block || !range) return false;
  if (inputType === 'insertParagraph' || inputType === 'insertLineBreak') return true;
  if (!range.collapsed) return false;
  if (inputType === 'deleteContentBackward') return atEdge(block, range, false);
  if (inputType === 'deleteContentForward') return atEdge(block, range, true);
  return false;
};

/** Called inside the editor's existing transaction after handlesBlockInput succeeds. */
export const editBlockInput = (root: HTMLElement, inputType: string): void => {
  const block = selectedBlock(root);
  const range = activeRange(root);
  if (!block || !range || !handlesBlockInput(root, inputType)) return;
  const document = root.ownerDocument;
  if (inputType === 'insertParagraph') {
    range.deleteContents();
    const tailRange = document.createRange();
    tailRange.selectNodeContents(block);
    tailRange.setStart(range.startContainer, range.startOffset);
    const tail = tailRange.extractContents();
    const emptyHeading = block.localName !== 'p' && !block.textContent && !tail.textContent && block.querySelectorAll('br').length + tail.querySelectorAll('br').length <= 1;
    const headingEnd = block.localName !== 'p' && (!hasContent(tail) || emptyHeading);
    if (emptyHeading && !block.hasAttribute('data-mw-node')) {
      const paragraph = document.createElement('p');
      for (const attribute of block.attributes)
        if (attribute.name !== 'dir') paragraph.setAttribute(attribute.name, attribute.value);
      copyDirection(block, paragraph);
      paragraph.append(document.createElement('br'));
      block.replaceWith(paragraph);
      placeCaret(paragraph);
      return;
    }
    const next = headingEnd ? document.createElement('p') : block.cloneNode(false) as HTMLElement;
    if (headingEnd) {
      // A semantic identity is valid only on its declared wrapper, never on an exit paragraph.
      for (const attribute of block.attributes) {
        if (!attribute.name.startsWith('data-') && attribute.name !== 'dir') next.setAttribute(attribute.name, attribute.value);
      }
      copyDirection(block, next);
    }
    next.append(tail);
    if (!next.textContent && !next.querySelector('br')) next.replaceChildren(document.createElement('br'));
    if (!block.textContent && !block.querySelector('br')) block.replaceChildren(document.createElement('br'));
    block.after(next);
    placeCaret(next);
    return;
  }
  if (inputType === 'insertLineBreak') {
    range.deleteContents();
    if (!block.textContent && block.querySelectorAll('br').length <= 1) {
      block.replaceChildren();
      range.selectNodeContents(block);
      range.collapse(true);
    }
    const terminal = atEdge(block, range, true);
    const lineBreak = document.createElement('br');
    range.insertNode(lineBreak);
    if (terminal) lineBreak.after(document.createElement('br'));
    const caret = document.createRange();
    caret.setStartAfter(lineBreak);
    caret.collapse(true);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(caret);
    return;
  }
  const forward = inputType === 'deleteContentForward';
  const sibling = siblingBlock(root, block, forward);
  if (!sibling) return;
  const left = forward ? block : sibling;
  const right = forward ? sibling : block;
  if (!left.textContent && left.childNodes.length === 1 && left.firstChild instanceof HTMLBRElement) left.replaceChildren();
  if (!right.textContent && right.childNodes.length === 1 && right.firstChild instanceof HTMLBRElement) right.replaceChildren();
  const join = document.createRange();
  join.selectNodeContents(left);
  join.collapse(false);
  left.append(...right.childNodes);
  right.remove();
  if (!left.childNodes.length) left.append(document.createElement('br'));
  left.normalize();
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(join);
};
