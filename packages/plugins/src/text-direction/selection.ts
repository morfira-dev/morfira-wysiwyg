import type { Editor } from '@morfira-dev/wysiwyg-core';

const namespace = 'http://www.w3.org/1999/xhtml';
const blocks = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'blockquote', 'li', 'td', 'th']);
const inline = new Set(['strong', 'em', 'u', 's', 'sub', 'sup', 'a', 'span', 'code', 'br', 'img']);

/** Only inspect endpoint ancestors and the local sibling interval, never bodies. */
export const directionTargets = (editor: Editor): HTMLElement[] | undefined => {
  const root = editor.surface;
  const selection = root.ownerDocument.getSelection();
  if (!selection || selection.rangeCount !== 1) return;
  const range = selection.getRangeAt(0);
  const at = (node: Node): HTMLElement | undefined => {
    let element = node.nodeType === 1 ? node as Element : node.parentElement;
    if (!element || element === root || !root.contains(element)) return;
    let target: HTMLElement | undefined;
    const cell = element.closest('td,th');
    for (; element && element !== root; element = element.parentElement) {
      if (element.namespaceURI !== namespace || element.hasAttribute('data-mw-node')) return;
      if (!target) {
        if (blocks.has(element.localName)) target = element as HTMLElement;
        else if (!inline.has(element.localName)) return;
      }
    }
    return target && target.closest('td,th') === cell ? target : undefined;
  };
  const first = at(range.startContainer);
  const last = at(range.endContainer);
  if (!first || !last || first.parentElement !== last.parentElement) return;
  const cell = first.closest('td,th');
  if (last.closest('td,th') !== cell) return;
  const result: HTMLElement[] = [];
  for (let node: ChildNode | null = first; node; node = node.nextSibling) {
    if (node.nodeType === 3 && /^[\t\n\f\r ]*$/.test(node.textContent ?? '')) continue;
    if (node.nodeType !== 1) return;
    const block = node as HTMLElement;
    if (block.namespaceURI !== namespace || !blocks.has(block.localName) || block.hasAttribute('data-mw-node') || block.closest('td,th') !== cell) return;
    result.push(block);
    if (node === last) return result;
  }
};
