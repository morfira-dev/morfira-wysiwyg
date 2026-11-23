import type { TextSelection, SelectionBookmark } from './types.js';
export type { TextSelection, SelectionBookmark } from './types.js';

/** Apply an already-owned Range; callers keep focus, validation and direction. */
export const applyNativeRange = (selection: Selection | null, range: Range): void => {
  selection?.removeAllRanges();
  selection?.addRange(range);
};
export const activeRange = (root: HTMLElement): Range | undefined => {
  const selection = root.ownerDocument.getSelection();
  if (!selection?.rangeCount)
    return;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer))
    return;
  return range.cloneRange();
};
const nodePath = (root: Node, target: Node): number[] => {
  const result: number[] = [];
  let node = target;
  while (node !== root && node.parentNode) {
    result.unshift([...node.parentNode.childNodes].indexOf(node as ChildNode));
    node = node.parentNode;
  }
  return result;
};
// Empty text nodes disappear in HTML snapshots. Persist their parent boundary.
const stableBoundary = (node: Node, offset: number): [Node, number] => {
  if (node.nodeType === 3 && node.textContent === '' && node.parentNode)
    return [node.parentNode, [...node.parentNode.childNodes].indexOf(node as ChildNode)];
  return [node, offset];
};
export const bookmark = (root: HTMLElement): SelectionBookmark | undefined => {
  const range = activeRange(root);
  if (!range)
    return;
  const selection = root.ownerDocument.getSelection()!;
  const [start, startOffset] = stableBoundary(range.startContainer, range.startOffset);
  const [end, endOffset] = stableBoundary(range.endContainer, range.endOffset);
  return { start: nodePath(root, start), startOffset, end: nodePath(root, end), endOffset, backward: !range.collapsed && selection.anchorNode === range.endContainer && selection.anchorOffset === range.endOffset };
};
/** Resolve a remembered selection without changing focus or the document selection. */
export const rangeFromBookmark = (root: HTMLElement, saved: SelectionBookmark | undefined): Range | undefined => {
  if (!saved)
    return;
  const resolve = (path: number[]) => path.reduce<Node>((node, index) => node.childNodes[index] ?? node, root);
  const start = resolve(saved.start);
  const end = resolve(saved.end);
  const limit = (node: Node, offset: number) => Math.min(offset, node.nodeType === 3 ? (node.textContent?.length ?? 0) : node.childNodes.length);
  const startOffset = limit(start, saved.startOffset);
  const endOffset = limit(end, saved.endOffset);
  const range = root.ownerDocument.createRange();
  range.setStart(start, startOffset);
  range.setEnd(end, endOffset);
  return range;
};
export const restoreBookmark = (root: HTMLElement, saved: SelectionBookmark | undefined): void => {
  const range = rangeFromBookmark(root, saved);
  const selection = root.ownerDocument.getSelection();
  if (!range || !saved || !selection) return;
  if (saved.backward)
    selection.setBaseAndExtent(range.endContainer, range.endOffset, range.startContainer, range.startOffset);
  else
    selection.setBaseAndExtent(range.startContainer, range.startOffset, range.endContainer, range.endOffset);
};
export const readTextSelection = (root: HTMLElement): TextSelection | undefined => {
  const range = activeRange(root);
  if (!range)
    return;
  const prefix = root.ownerDocument.createRange();
  prefix.selectNodeContents(root);
  prefix.setEnd(range.startContainer, range.startOffset);
  return { index: prefix.toString().length, length: range.toString().length };
};
export const selectText = (root: HTMLElement, index: number, length = 0): void => {
  if (![index, length].every((value) => Number.isInteger(value) && value >= 0))
    throw new RangeError('Selection offsets must be non-negative integers.');
  const walker = root.ownerDocument.createTreeWalker(root, 4);
  const nodes: Text[] = [];
  let current: Node | null;
  while ((current = walker.nextNode()))
    nodes.push(current as Text);
  const locate = (offset: number): [
    Node,
    number
  ] => {
    for (const node of nodes) {
      if (offset <= node.length)
        return [node, offset];
      offset -= node.length;
    }
    const last = nodes.at(-1);
    return last ? [last, last.length] : [root.querySelector('p,h1,h2,h3,h4,h5,h6,li,blockquote,pre') ?? root, 0];
  };
  const [start, startOffset] = locate(index);
  const [end, endOffset] = locate(index + length);
  const range = root.ownerDocument.createRange();
  range.setStart(start, startOffset);
  range.setEnd(end, endOffset);
  root.focus({ preventScroll: true });
  applyNativeRange(root.ownerDocument.getSelection(), range);
};
export const placeCaret = (element: HTMLElement, end = false): void => {
  const range = element.ownerDocument.createRange();
  range.selectNodeContents(element);
  range.collapse(!end);
  applyNativeRange(element.ownerDocument.getSelection(), range);
};
/** Keep actual DOM positions while moving blocks, including empty list items. */
export const preserveRange = (root: HTMLElement, mutate: () => void): void => {
  const range = activeRange(root);
  if (!range)
    return;
  const native = root.ownerDocument.getSelection()!;
  const backward = !range.collapsed && native.anchorNode === range.endContainer && native.anchorOffset === range.endOffset;
  const start = root.ownerDocument.createComment('mw-start');
  const end = range.collapsed ? undefined : root.ownerDocument.createComment('mw-end');
  if (end) {
    const tail = range.cloneRange();
    tail.collapse(false);
    tail.insertNode(end);
  }
  const head = range.cloneRange();
  head.collapse(true);
  head.insertNode(start);
  try {
    mutate();
    if (root.contains(start) && (!end || root.contains(end))) {
      const next = root.ownerDocument.createRange();
      next.setStartBefore(start);
      if (end)
        next.setEndBefore(end);
      else
        next.collapse(true);
      start.remove();
      end?.remove();
      root.normalize();
      if (backward)
        native.setBaseAndExtent(next.endContainer, next.endOffset, next.startContainer, next.startOffset);
      else applyNativeRange(native, next);
    }
  }
  finally {
    start.remove();
    end?.remove();
  }
};
