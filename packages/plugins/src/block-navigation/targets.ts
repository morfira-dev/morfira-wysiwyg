import type { Editor } from '@morfira-dev/wysiwyg-core';
import type { BlockGap } from './internal-types.js';

const namespace = 'http://www.w3.org/1999/xhtml';
const leafTags = /^(p|h[1-6])$/;
const forbiddenInline = 'img,figure,figcaption,hr,pre,ul,ol,li,table,blockquote,p,h1,h2,h3,h4,h5,h6,[data-mw-node],[contenteditable="false"]';

export const ordinaryLeaf = (root: HTMLElement, node: Node | null): HTMLElement | undefined => {
  if (!node) return;
  const element = node.nodeType === 1 ? node as Element : node.parentElement;
  const leaf = element?.closest<HTMLElement>('p,h1,h2,h3,h4,h5,h6');
  if (leaf && leaf.parentElement === root && leaf.namespaceURI === namespace
    && leafTags.test(leaf.localName) && !leaf.hasAttribute('data-mw-node') && !leaf.querySelector(forbiddenInline)
    && [...leaf.querySelectorAll('*')].every((child) => child.namespaceURI === namespace)) return leaf;
};

export const supportedObject = (editor: Editor, node: Node | null): node is HTMLElement => {
  const root = editor.surface;
  if (!node || node.nodeType !== 1 || node.parentNode !== root) return false;
  const element = node as HTMLElement;
  if (element.namespaceURI !== namespace) return false;
  if (element.hasAttribute('data-mw-node')) {
    if (element.localName !== 'figure' || [...element.childNodes].some((child) => child.nodeType !== 3)) return false;
    // Imported semantic identity must be owned by this editor's compiled schema.
    return editor.schema.sanitizeHTML(element.outerHTML) === element.outerHTML;
  }
  if (element.localName === 'hr' || element.localName === 'img') return true;
  if (element.localName !== 'figure' || element.querySelector('[data-mw-node],[contenteditable="false"]')) return false;
  const children = [...element.childNodes];
  const image = children[0];
  if (image?.nodeType !== 1 || (image as Element).localName !== 'img' || (image as Element).namespaceURI !== namespace) return false;
  if (children.length === 1) return true;
  const caption = children[1];
  return children.length === 2 && caption?.nodeType === 1 && (caption as Element).localName === 'figcaption'
    && (caption as Element).namespaceURI === namespace && !(caption as Element).querySelector(forbiddenInline)
    && [...(caption as Element).querySelectorAll('*')].every((child) => child.namespaceURI === namespace);
};

export const ownedRange = (root: HTMLElement): Range | undefined => {
  const selection = root.ownerDocument.getSelection();
  if (!selection || selection.rangeCount !== 1) return;
  const range = selection.getRangeAt(0);
  if ((range.startContainer === root || root.contains(range.startContainer))
    && (range.endContainer === root || root.contains(range.endContainer))) return range;
};

export const selectedObject = (editor: Editor, range = ownedRange(editor.surface)): HTMLElement | undefined => {
  const root = editor.surface;
  if (!range || range.startContainer !== root || range.endContainer !== root || range.endOffset !== range.startOffset + 1) return;
  const node = root.childNodes[range.startOffset];
  if (supportedObject(editor, node)) return node;
};

export const rootGap = (editor: Editor, range: Range, direction?: -1 | 1): BlockGap | undefined => {
  const root = editor.surface;
  const selected = selectedObject(editor, range);
  if (selected) return { index: range.startOffset + (direction === 1 ? 1 : 0), selected };
  if (!range.collapsed) return;
  if (range.startContainer === root) return { index: range.startOffset };
  if (direction === undefined) return;
  const leaf = ordinaryLeaf(root, range.startContainer);
  if (!leaf) return;
  const edge = root.ownerDocument.createRange();
  edge.selectNodeContents(leaf);
  if (direction === -1) edge.setEnd(range.startContainer, range.startOffset);
  else edge.setStart(range.startContainer, range.startOffset);
  const placeholder = leaf.childNodes.length === 1 && leaf.firstElementChild?.localName === 'br';
  if (edge.toString().length || (!placeholder && edge.cloneContents().querySelector('br'))) return;
  const index = [...root.childNodes].indexOf(leaf);
  return { index: index + (direction === 1 ? 1 : 0) };
};

export const applyRange = (range: Range): void => {
  const selection = range.startContainer.ownerDocument?.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
};
