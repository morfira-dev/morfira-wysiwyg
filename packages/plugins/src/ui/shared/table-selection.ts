import type { Editor } from '@morfira-dev/wysiwyg-core';
import type { TableSelectionState } from '../../tables/types.js';

export const sameTableRegion = (left: TableSelectionState, right: TableSelectionState): boolean => left.table === right.table
  && left.cells.length === right.cells.length && left.cells.every((cell, index) => cell === right.cells[index])
  && left.rectangle.top === right.rectangle.top && left.rectangle.left === right.rectangle.left
  && left.rectangle.bottom === right.rectangle.bottom && left.rectangle.right === right.rectangle.right;

/** Link/image owners retain their dedicated context; don't infer selections from marker attributes. */
export const ordinaryTableRange = (editor: Editor, range: Range): boolean => {
  const surface = editor.surface;
  if (!surface.contains(range.startContainer) || !surface.contains(range.endContainer)) return false;
  if (range.startContainer === range.endContainer && range.endOffset === range.startOffset + 1
    && range.startContainer.childNodes[range.startOffset]?.nodeName === 'IMG') return false;
  for (const boundary of [range.startContainer, range.endContainer]) {
    let node = boundary.nodeType === 1 ? boundary as Element : boundary.parentElement;
    for (; node && node !== surface; node = node.parentElement) {
      if (node.namespaceURI !== 'http://www.w3.org/1999/xhtml' || node.hasAttribute('data-mw-node')
        || ['A', 'CAPTION', 'FIGCAPTION'].includes(node.tagName)) return false;
    }
  }
  return true;
};
