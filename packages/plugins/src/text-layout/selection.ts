import type { Editor } from '@morfira-dev/wysiwyg-core';

const namespace = 'http://www.w3.org/1999/xhtml';
const leaf = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const inline = new Set(['strong', 'em', 'u', 's', 'sub', 'sup', 'a', 'span', 'code', 'br']);
const ancestors = new Set(['li', 'ul', 'ol', 'blockquote', 'td', 'th', 'tr', 'tbody', 'thead', 'tfoot', 'table']);

export const ordinaryLayoutBlock = (editor: Editor, node: Node): HTMLElement | undefined => {
  const root = editor.surface;
  let element = node.nodeType === 1 ? node as Element : node.parentElement;
  let block: HTMLElement | undefined;
  for (; element && element !== root; element = element.parentElement) {
    if (!root.contains(element) || element.namespaceURI !== namespace || element.hasAttribute('data-mw-node')) return;
    if (!block) {
      if (leaf.has(element.localName)) block = element as HTMLElement;
      else if (!inline.has(element.localName)) return;
    }
    else if (!ancestors.has(element.localName)) return;
  }
  if (!block || element !== root) return;
  for (const descendant of block.querySelectorAll('*')) {
    if (descendant.namespaceURI !== namespace || !inline.has(descendant.localName) || descendant.hasAttribute('data-mw-node') || descendant.getAttribute('contenteditable') === 'false') return;
  }
  return block;
};

export const layoutTargets = (editor: Editor): HTMLElement[] | undefined => {
  const selection = editor.surface.ownerDocument.getSelection();
  if (!selection || selection.rangeCount !== 1) return;
  const range = selection.getRangeAt(0);
  const first = ordinaryLayoutBlock(editor, range.startContainer);
  const last = ordinaryLayoutBlock(editor, range.endContainer);
  if (!first || !last || first.parentElement !== last.parentElement || first.closest('td,th') !== last.closest('td,th')) return;
  const result: HTMLElement[] = [];
  for (let node: ChildNode | null = first; node; node = node.nextSibling) {
    if (node.nodeType === 3 && /^[\t\n\f\r ]*$/.test(node.textContent ?? '')) continue;
    const block = ordinaryLayoutBlock(editor, node);
    if (block !== node) return;
    result.push(block);
    if (node === last) return result;
  }
};
