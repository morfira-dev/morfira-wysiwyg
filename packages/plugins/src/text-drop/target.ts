import type { Editor } from '@morfira-dev/wysiwyg-core';
import type { CaretPointDocument } from './internal-types.js';

const flows = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,td,th';
const protectedOwner = 'img,figure,figcaption,pre,code,video,audio,source,track,canvas,iframe,object,embed,script,style,[data-mw-node],[contenteditable="false"]';
const inlineTags = new Set(['strong', 'em', 'u', 's', 'sub', 'sup', 'a', 'span', 'br']);
export const elementAt = (node: Node): Element | null => node.nodeType === 1 ? node as Element : node.parentElement;
export const editorOwned = (editor: Editor): boolean => {
  const root = editor.surface;
  return root.isConnected && editor.element.isConnected && editor.element.contains(root)
    && root.ownerDocument === editor.element.ownerDocument;
};
export const inlineFragment = (fragment: ParentNode): boolean => [...fragment.querySelectorAll('*')].every((element) =>
  element.namespaceURI === 'http://www.w3.org/1999/xhtml' && inlineTags.has(element.localName)
  && !element.matches(protectedOwner));
export const flowAt = (editor: Editor, range: Range): HTMLElement | undefined => {
  const root = editor.surface;
  if (!editorOwned(editor) || range.startContainer.ownerDocument !== root.ownerDocument
    || !root.contains(range.startContainer) || !root.contains(range.endContainer)) return;
  for (const point of [range.startContainer, range.endContainer]) {
    for (let element = elementAt(point); element && element !== root; element = element.parentElement) {
      if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml' || element.matches(protectedOwner)) return;
    }
  }
  const flow = elementAt(range.startContainer)?.closest<HTMLElement>(flows);
  if (!flow || flow === root || !root.contains(flow) || flow !== elementAt(range.endContainer)?.closest(flows)) return;
  if (!range.collapsed) {
    // Inspect live nodes first: cloning a selected IMG may start resource work.
    for (const element of flow.querySelectorAll('*')) {
      if (range.intersectsNode(element) && (element.namespaceURI !== 'http://www.w3.org/1999/xhtml'
        || !inlineTags.has(element.localName) || element.matches(protectedOwner))) return;
    }
  }
  return flow;
};
export const validDragTarget = (editor: Editor, target: EventTarget | null, range: Range, flow: HTMLElement): boolean => {
  const root = editor.surface;
  const view = root.ownerDocument.defaultView!;
  if (!(target instanceof view.Node) || !root.contains(target)) return false;
  if (target === root) return true;
  return !elementAt(target)?.closest(protectedOwner) && flow.contains(target) && range.intersectsNode(target);
};
export const dropRange = (editor: Editor, event: DragEvent): Range | undefined => {
  const root = editor.surface;
  const owner = root.ownerDocument as CaretPointDocument;
  const view = owner.defaultView!;
  if (!(event.target instanceof view.Node) || !root.contains(event.target)
    || elementAt(event.target)?.closest(protectedOwner)) return;
  let result = owner.caretRangeFromPoint?.(event.clientX, event.clientY) ?? undefined;
  if (!result) {
    const point = owner.caretPositionFromPoint?.(event.clientX, event.clientY);
    if (point) {
      result = owner.createRange();
      result.setStart(point.offsetNode, point.offset);
      result.collapse(true);
    }
  }
  if (!result) return;
  const range = result.cloneRange();
  range.collapse(true);
  if (range.startContainer === root) {
    const candidate = root.childNodes[range.startOffset] ?? root.childNodes[range.startOffset - 1];
    if (candidate?.nodeType === 1 && (candidate as Element).matches('p,h1,h2,h3,h4,h5,h6')
      && !candidate.textContent && !((candidate as Element).querySelector(':not(br)'))) {
      range.selectNodeContents(candidate);
      range.collapse(true);
    }
  }
  return flowAt(editor, range) ? range : undefined;
};
export const selectRange = (editor: Editor, range: Range, backward = false): void => {
  const selection = editor.surface.ownerDocument.getSelection();
  if (!selection) throw new Error('Text drop requires an available selection.');
  if (backward) selection.setBaseAndExtent(range.endContainer, range.endOffset, range.startContainer, range.startOffset);
  else {
    selection.removeAllRanges();
    selection.addRange(range);
  }
};
export const containsPoint = (source: Range, point: Range): boolean => source.comparePoint(point.startContainer, point.startOffset) === 0;
export const normalizeFlow = (flow: HTMLElement): void => {
  flow.normalize();
  if (flow.localName === 'li') {
    const branch = [...flow.children].find((child) => child.matches('ul,ol'));
    if (branch && flow.firstChild === branch) flow.insertBefore(flow.ownerDocument.createElement('br'), branch);
  }
  // Non-text survivors (including empty semantic/inline owners) are still data.
  if (!flow.childNodes.length) flow.append(flow.ownerDocument.createElement('br'));
};

const atWrapperEnd = (range: Range, wrapper: Element): boolean => {
  let node = range.startContainer;
  const length = node.nodeType === 3 ? node.textContent!.length : node.childNodes.length;
  if (range.startOffset !== length) return false;
  while (node !== wrapper) {
    for (let next = node.nextSibling; next; next = next.nextSibling) {
      if (next.nodeType !== 3 || next.textContent) return false;
    }
    if (!node.parentNode) return false;
    node = node.parentNode;
  }
  return true;
};

/** New content must not make subsequent typing inherit its trailing wrappers. */
export const restoreDropCaret = (editor: Editor, flow: HTMLElement, originalAncestors: ReadonlySet<Element>, formats: Readonly<Record<string, unknown>>): void => {
  const selection = editor.surface.ownerDocument.getSelection();
  if (!selection || selection.rangeCount !== 1) throw new Error('Text drop lost its final caret.');
  const range = selection.getRangeAt(0).cloneRange();
  if (!range.collapsed || !flow.contains(range.startContainer)) throw new Error('Text drop lost its final caret.');
  let element = elementAt(range.startContainer);
  while (element && element !== flow && !originalAncestors.has(element) && inlineTags.has(element.localName)) {
    if (!atWrapperEnd(range, element)) break;
    range.setStartAfter(element);
    range.collapse(true);
    element = elementAt(range.startContainer);
  }
  selectRange(editor, range);
  // Explicit destination affinity survives history. Native browsers may otherwise
  // extend a trailing mark even when the restored Range is just after that mark.
  for (const name of ['bold', 'italic', 'underline', 'strike', 'code', 'subscript', 'superscript']) editor.format(name, Boolean(formats[name]));
  for (const name of ['color', 'background', 'fontFamily', 'fontSize']) editor.format(name, typeof formats[name] === 'string' ? formats[name] : false);
};
