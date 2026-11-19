import type { Editor } from '@morfira-dev/wysiwyg-core';

export const validContextualRange = (editor: Editor, range: Range, checkText = true): boolean => {
  const root = editor.surface;
  if (range.collapsed || range.startContainer === root || range.endContainer === root
    || !root.contains(range.startContainer) || !root.contains(range.endContainer) || (checkText && !range.toString())) return false;
  for (const node of [range.startContainer, range.endContainer]) {
    let element = node.nodeType === 1 ? node as Element : node.parentElement;
    for (; element && element !== root; element = element.parentElement)
      if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml' || element.hasAttribute('data-mw-node')) return false;
  }
  return true;
};

export const nativeContextualRange = (editor: Editor): Range | undefined => {
  const selection = editor.surface.ownerDocument.getSelection();
  if (!selection || selection.rangeCount !== 1) return;
  const range = selection.getRangeAt(0);
  return validContextualRange(editor, range) ? range.cloneRange() : undefined;
};

export { sameContextualRange } from '../shared/range.js';
