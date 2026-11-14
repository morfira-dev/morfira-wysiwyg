import type { DocumentTag } from '../document/index.js';
import { parseHTML, renderDocument } from '../document/index.js';
import { selectText } from '../selection/index.js';
import { inlineDocument } from './inline-document.js';

const leaves = 'p,h1,h2,h3,h4,h5,h6';
const inlineTags = new Set(['strong', 'em', 'u', 's', 'sub', 'sup', 'a', 'span', 'code']);
const structuralAncestors = new Set(['blockquote', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th']);
const elementAt = (node: Node): Element | null => node.nodeType === 1 ? node as Element : node.parentElement;
const isInlineTree = (parent: Element): boolean => {
  for (const node of parent.childNodes) {
    if (node.nodeType === 3) continue;
    if (node.nodeType !== 1) return false;
    const element = node as Element;
    if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml' || !inlineTags.has(element.localName) || !isInlineTree(element)) return false;
  }
  return true;
};

/** Transform one schema-validated leaf while keeping unrelated editor DOM connected. */
export const applyLocalInline = (root: HTMLElement, range: Range, tag: DocumentTag, enabled: boolean): boolean => {
  const block = elementAt(range.startContainer)?.closest<HTMLElement>(leaves);
  if (!block || !root.contains(block) || block.namespaceURI !== 'http://www.w3.org/1999/xhtml') return false;
  if (elementAt(range.endContainer)?.closest(leaves) !== block || !isInlineTree(block)) return false;
  for (let parent = block.parentElement; parent && parent !== root; parent = parent.parentElement) {
    if (parent.namespaceURI !== 'http://www.w3.org/1999/xhtml' || !structuralAncestors.has(parent.localName)) return false;
  }

  const prefix = root.ownerDocument.createRange();
  prefix.selectNodeContents(block);
  prefix.setEnd(range.startContainer, range.startOffset);
  const from = prefix.toString().length;
  const length = range.toString().length;
  if (!length || from + length > (block.textContent?.length ?? 0)) return false;
  const native = root.ownerDocument.getSelection();
  const backward = native?.anchorNode === range.endContainer && native.anchorOffset === range.endOffset;
  const content = inlineDocument(parseHTML(block.outerHTML), from, from + length, tag, enabled);
  const fragment = renderDocument(content);
  const replacement = fragment.firstElementChild;
  if (fragment.childNodes.length !== 1 || !(replacement instanceof HTMLElement) || replacement.localName !== block.localName) return false;

  // HTML history replay merges adjacent text nodes; capture the same local node shape.
  replacement.normalize();
  if (replacement.outerHTML === block.outerHTML) return true;

  block.replaceWith(fragment);
  selectText(replacement, from, length);
  root.focus({ preventScroll: true });
  if (backward && native?.rangeCount) {
    const selected = native.getRangeAt(0);
    native.setBaseAndExtent(selected.endContainer, selected.endOffset, selected.startContainer, selected.startOffset);
  }
  return true;
};
