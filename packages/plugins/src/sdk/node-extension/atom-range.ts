import type { AtomicContext, NativeRange } from '../internal-types.js';

const inline = new Set(['span', 'strong', 'em', 'u', 's', 'sub', 'sup', 'br']);
export const nativeRange = (root: HTMLElement): NativeRange | undefined => {
  const selection = root.ownerDocument.getSelection();
  if (selection?.rangeCount !== 1) return;
  const range = selection.getRangeAt(0).cloneRange();
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return;
  return { range, selection, backward: !range.collapsed && selection.anchorNode === range.endContainer && selection.anchorOffset === range.endOffset };
};
export const sameRange = (first: Range, second: Range): boolean => first.startContainer === second.startContainer
  && first.startOffset === second.startOffset && first.endContainer === second.endContainer && first.endOffset === second.endOffset;
export const atomAncestor = ({ editor, owns }: AtomicContext, node: Node): HTMLElement | undefined => {
  const element = node.nodeType === 1 ? node as Element : node.parentElement;
  const target = element?.closest('[data-mw-node]');
  return target && owns(target) && editor.surface.contains(target) ? target : undefined;
};
export const atomFlow = (context: AtomicContext, node: Node): HTMLElement | undefined => {
  let found: HTMLElement | undefined;
  for (let element = node.nodeType === 1 ? node as Element : node.parentElement; element && element !== context.editor.surface; element = element.parentElement) {
    if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml' || ['a', 'pre', 'code', 'figure', 'figcaption'].includes(element.localName)
      || element.hasAttribute('data-mw-node') && !context.owns(element)) return;
    if (!found && /^(p|h[1-6]|li|blockquote|td|th)$/.test(element.localName)) found = element as HTMLElement;
  }
  return found;
};
const endpoint = (range: Range, end: boolean): Range => {
  const point = range.cloneRange();
  point.collapse(!end);
  return point;
};
export const touchedAtoms = (context: AtomicContext, range: Range): HTMLElement[] => {
  if (range.collapsed) {
    const atom = atomAncestor(context, range.startContainer);
    return atom ? [atom] : [];
  }
  const start = endpoint(range, false);
  const end = endpoint(range, true);
  return [...context.editor.surface.querySelectorAll('[data-mw-node]')].filter(context.owns).filter((node) => {
    const bounds = context.editor.surface.ownerDocument.createRange();
    bounds.selectNode(node);
    return start.compareBoundaryPoints(0, endpoint(bounds, true)) < 0 && end.compareBoundaryPoints(0, endpoint(bounds, false)) > 0;
  });
};
export const expandAtoms = (context: AtomicContext, range: Range): Range => {
  const expanded = range.cloneRange();
  for (const atom of touchedAtoms(context, range)) {
    const bounds = context.editor.surface.ownerDocument.createRange();
    bounds.selectNode(atom);
    if (endpoint(expanded, false).compareBoundaryPoints(0, endpoint(bounds, false)) > 0) expanded.setStartBefore(atom);
    if (endpoint(expanded, true).compareBoundaryPoints(0, endpoint(bounds, true)) < 0) expanded.setEndAfter(atom);
  }
  return expanded;
};
export const ordinaryAtomRange = (context: AtomicContext, range: Range): HTMLElement | undefined => {
  const flow = atomFlow(context, range.startContainer);
  if (!flow || atomFlow(context, range.endContainer) !== flow) return;
  for (const node of flow.querySelectorAll('*')) {
    if (!range.intersectsNode(node) || context.owns(node)) continue;
    if (node.namespaceURI !== 'http://www.w3.org/1999/xhtml' || !inline.has(node.localName)
      || node.hasAttribute('data-mw-node') || node.getAttribute('contenteditable') === 'false') return;
  }
  return flow;
};
export const adjacentAtom = (context: AtomicContext, range: Range, direction: -1 | 1): HTMLElement | undefined => {
  const inside = atomAncestor(context, range.startContainer);
  if (inside) return inside;
  const flow = atomFlow(context, range.startContainer);
  if (!flow) return;
  for (const atom of [...flow.querySelectorAll('[data-mw-node]')].filter(context.owns)) {
    const bounds = context.editor.surface.ownerDocument.createRange();
    bounds.selectNode(atom);
    const boundary = endpoint(bounds, direction < 0);
    const relation = range.compareBoundaryPoints(0, boundary);
    if (direction < 0 ? relation < 0 : relation > 0) continue;
    const between = context.editor.surface.ownerDocument.createRange();
    if (direction < 0) {
      between.setStart(boundary.startContainer, boundary.startOffset);
      between.setEnd(range.startContainer, range.startOffset);
    }
    else {
      between.setStart(range.startContainer, range.startOffset);
      between.setEnd(boundary.startContainer, boundary.startOffset);
    }
    if (!between.toString() && ordinaryAtomRange(context, between)) return atom;
  }
};
export const applyRange = (native: Selection, range: Range, backward = false): void => {
  native.setBaseAndExtent(backward ? range.endContainer : range.startContainer, backward ? range.endOffset : range.startOffset,
    backward ? range.startContainer : range.endContainer, backward ? range.startOffset : range.endOffset);
};
