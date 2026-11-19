import { mentionIDAttribute, mentionNodeName, validMentionID } from '../persistence.js';
import type { AtomicPoint, AtomicSelection } from './types.js';

const elementFor = (node: Node): Element | null => node.nodeType === 1 ? node as Element : node.parentElement;
const selector = `span[data-mw-node="${mentionNodeName}"]`;
const inline = new Set(['span', 'strong', 'em', 'u', 's', 'sub', 'sup']);

export const validAtomicMention = (root: HTMLElement, element: Element): element is HTMLSpanElement => {
  if (!root.contains(element) || element.namespaceURI !== 'http://www.w3.org/1999/xhtml'
    || element.localName !== 'span' || element.getAttribute('data-mw-node') !== mentionNodeName
    || !validMentionID(element.getAttribute(mentionIDAttribute))) return false;
  const text = element.textContent ?? '';
  return text.length >= 1 && text.length <= 201 && !/[\u0000-\u001f\u007f\u2028\u2029]/.test(text)
    && [...element.childNodes].every((child) => child.nodeType === 3);
};
export const atomicAncestor = (root: HTMLElement, node: Node): HTMLSpanElement | undefined => {
  const element = elementFor(node)?.closest(selector);
  return element && validAtomicMention(root, element) ? element : undefined;
};
export const atomicBoundary = (element: HTMLElement, after: boolean): AtomicPoint => ({
  node: element.parentNode!, offset: [...element.parentNode!.childNodes].indexOf(element) + Number(after),
});
export const atomicOffset = (element: HTMLElement, node: Node, offset: number): number => {
  const prefix = element.ownerDocument.createRange();
  prefix.selectNodeContents(element);
  prefix.setEnd(node, offset);
  return prefix.toString().length;
};
export const atomicNativeSelection = (root: HTMLElement): AtomicSelection | undefined => {
  const native = root.ownerDocument.getSelection();
  if (!native || native.rangeCount !== 1) return;
  const range = native.getRangeAt(0).cloneRange();
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return;
  return { range, native, backward: !range.collapsed && native.anchorNode === range.endContainer && native.anchorOffset === range.endOffset };
};
export const setAtomicSelection = (native: Selection, range: Range, backward = false): void => {
  native.setBaseAndExtent(backward ? range.endContainer : range.startContainer, backward ? range.endOffset : range.startOffset,
    backward ? range.startContainer : range.endContainer, backward ? range.startOffset : range.endOffset);
};
export const expandedAtomicRange = (root: HTMLElement, range: Range): Range => {
  const next = range.cloneRange();
  const start = atomicAncestor(root, range.startContainer);
  const end = atomicAncestor(root, range.endContainer);
  if (start) {
    const point = atomicBoundary(start, atomicOffset(start, range.startContainer, range.startOffset) === start.textContent!.length);
    next.setStart(point.node, point.offset);
  }
  if (end) {
    const point = atomicBoundary(end, atomicOffset(end, range.endContainer, range.endOffset) !== 0);
    next.setEnd(point.node, point.offset);
  }
  return next;
};
export const atomicFlow = (root: HTMLElement, node: Node): HTMLElement | undefined => {
  let flow: HTMLElement | undefined;
  for (let element = elementFor(node); element && element !== root; element = element.parentElement) {
    if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml' || ['a', 'code', 'pre', 'figure', 'figcaption'].includes(element.localName)
      || (element.hasAttribute('data-mw-node') && !validAtomicMention(root, element))) return;
    if (!flow && /^(p|h[1-6]|li|blockquote|td|th)$/.test(element.localName)) flow = element as HTMLElement;
  }
  return flow;
};
export const adjacentAtomicMention = (root: HTMLElement, point: AtomicPoint, direction: -1 | 1): HTMLSpanElement | undefined => {
  const flow = atomicFlow(root, point.node);
  if (!flow) return;
  let node = point.node;
  if (node.nodeType === 3) {
    if (direction < 0 ? point.offset > 0 : point.offset < (node.textContent?.length ?? 0)) return;
  }
  else {
    const child = node.childNodes[point.offset - (direction < 0 ? 1 : 0)];
    if (child) node = child;
    else if (node === flow) return;
  }
  let inspect = node !== point.node;
  for (let visits = 0; visits < 2048; visits++) {
    if (inspect) {
      if (node.nodeType === 3) {
        if (node.textContent) return;
      }
      else if (node.nodeType === 1) {
        const element = node as Element;
        if (validAtomicMention(root, element)) return element;
        if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml' || !inline.has(element.localName)
          || element.hasAttribute('data-mw-node')) return;
        const child = direction < 0 ? node.lastChild : node.firstChild;
        if (child) { node = child; continue; }
      }
    }
    if (node === flow) return;
    const sibling = direction < 0 ? node.previousSibling : node.nextSibling;
    if (sibling) { node = sibling; inspect = true; continue; }
    if (!node.parentNode || node.parentNode === flow) return;
    node = node.parentNode;
    inspect = false;
  }
};
export const atomsInRange = (root: HTMLElement, range: Range): HTMLSpanElement[] => {
  const common = elementFor(range.commonAncestorContainer);
  if (!common) return [];
  const elements = [common, ...common.querySelectorAll(selector)];
  return elements.filter((element): element is HTMLSpanElement => validAtomicMention(root, element) && range.intersectsNode(element));
};
