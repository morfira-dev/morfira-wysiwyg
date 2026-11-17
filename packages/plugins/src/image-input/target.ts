import type { Editor } from '@morfira-dev/wysiwyg-core';
import type { CaretPointDocument } from './internal-types.js';

const elementOf = (node: Node) => node.nodeType === 1 ? node as Element : node.parentElement;
const unsafe = 'figure,figcaption,img,table,ul,ol,[data-mw-node],[contenteditable="false"]';
const block = 'p,h1,h2,h3,h4,h5,h6,pre,blockquote,li,td,th';

export const validInputRange = (editor: Editor, range: Range): boolean => {
  const root = editor.surface;
  if (!root.isConnected || range.startContainer.ownerDocument !== root.ownerDocument ||
      !root.contains(range.startContainer) || !root.contains(range.endContainer)) return false;
  for (const point of [range.startContainer, range.endContainer]) {
    for (let element = elementOf(point); element && element !== root; element = element.parentElement) {
      if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml' ||
          element.matches('figure,figcaption,[data-mw-node],[contenteditable="false"]')) return false;
    }
  }
  const start = elementOf(range.startContainer)?.closest(block);
  if (!start || start === root || start !== elementOf(range.endContainer)?.closest(block)) return false;
  const fragment = range.cloneContents();
  return !fragment.querySelector(`${unsafe},${block}`) &&
    [...fragment.querySelectorAll('*')].every((element) => element.namespaceURI === 'http://www.w3.org/1999/xhtml');
};

const checkedInputRange = (editor: Editor, range: Range): Range | undefined => {
  const root = editor.surface;
  const body = root.firstElementChild;
  if (range.collapsed && range.startContainer === root && root.childNodes.length === 1 &&
      body?.matches('p,h1,h2,h3,h4,h5,h6') &&
      [...body.childNodes].every((node) => node.nodeType === 3 ? node.textContent === '' :
        node.nodeType === 1 && (node as Element).namespaceURI === 'http://www.w3.org/1999/xhtml' &&
        (node as Element).tagName === 'BR' && !(node as Element).attributes.length && !node.childNodes.length)) {
    range.selectNodeContents(body);
    range.collapse(true);
  }
  return validInputRange(editor, range) ? range : undefined;
};

export const currentInputRange = (editor: Editor): Range | undefined => {
  const selection = editor.surface.ownerDocument.getSelection();
  if (selection?.rangeCount !== 1) return;
  const range = selection.getRangeAt(0).cloneRange();
  return checkedInputRange(editor, range);
};

export const dropInputRange = (editor: Editor, event: DragEvent): Range | undefined => {
  const owner = editor.surface.ownerDocument as CaretPointDocument;
  const target = event.target;
  if (!(target instanceof Node) || !editor.surface.contains(target) || elementOf(target)?.closest('figure,figcaption,[data-mw-node],[contenteditable="false"]')) return;
  let range = owner.caretRangeFromPoint?.(event.clientX, event.clientY) ?? undefined;
  if (!range) {
    const point = owner.caretPositionFromPoint?.(event.clientX, event.clientY);
    if (point) {
      range = owner.createRange();
      range.setStart(point.offsetNode, point.offset);
      range.collapse(true);
    }
  }
  if (!range) return;
  range = range.cloneRange();
  range.collapse(true);
  return checkedInputRange(editor, range);
};
