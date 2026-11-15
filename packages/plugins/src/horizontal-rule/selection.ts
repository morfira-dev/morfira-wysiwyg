import type { Editor } from '@morfira-dev/wysiwyg-core';
import type { HorizontalRuleTarget } from './internal-types.js';

const namespace = 'http://www.w3.org/1999/xhtml';
const unsupported = '[data-mw-node],p,h1,h2,h3,h4,h5,h6,blockquote,pre,ul,ol,li,table,caption,colgroup,col,thead,tbody,tfoot,tr,td,th,figure,figcaption,hr,img';

/** Resolve an ordinary root block without broadening native Range boundaries. */
export const horizontalRuleTarget = (editor: Editor, savedRange?: Range): HorizontalRuleTarget | undefined => {
  const root = editor.surface;
  const selection = savedRange ? undefined : root.ownerDocument.getSelection();
  if (!savedRange && (!selection || selection.rangeCount !== 1)) return;
  const range = savedRange ?? selection!.getRangeAt(0);
  const blockAt = (node: Node): HTMLElement | undefined => {
    const element = node.nodeType === 1 ? node as Element : node.parentElement;
    if (!element || !root.contains(element)) return;
    const block = element.closest<HTMLElement>('p,h1,h2,h3,h4,h5,h6');
    if (!block || block.parentElement !== root || block.namespaceURI !== namespace
      || block.hasAttribute('data-mw-node') || block.querySelector(unsupported)) return;
    return block;
  };

  const block = blockAt(range.startContainer);
  if (!block || block !== blockAt(range.endContainer)) return;
  return { block, range: range.cloneRange() };
};

const fillEmptyEdge = (block: HTMLElement): void => {
  block.normalize();
  if (!block.textContent && !block.querySelector('br,img'))
    block.append(block.ownerDocument.createElement('br'));
};

/** Build both retained edges before touching live DOM; HR is never an inline child. */
export const insertHorizontalRule = ({ block, range }: HorizontalRuleTarget): void => {
  const document = block.ownerDocument;
  const prefixRange = document.createRange();
  prefixRange.selectNodeContents(block);
  prefixRange.setEnd(range.startContainer, range.startOffset);
  const suffixRange = document.createRange();
  suffixRange.selectNodeContents(block);
  suffixRange.setStart(range.endContainer, range.endOffset);

  const prefix = block.cloneNode(false) as HTMLElement;
  const suffix = block.cloneNode(false) as HTMLElement;
  prefix.append(prefixRange.cloneContents());
  suffix.append(suffixRange.cloneContents());
  fillEmptyEdge(prefix);
  fillEmptyEdge(suffix);

  block.replaceWith(prefix, document.createElement('hr'), suffix);
  const caret = document.createRange();
  caret.selectNodeContents(suffix);
  caret.collapse(true);
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(caret);
};
