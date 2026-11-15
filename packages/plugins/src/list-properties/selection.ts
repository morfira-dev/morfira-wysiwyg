import type { Editor } from '@morfira-dev/wysiwyg-core';

const namespace = 'http://www.w3.org/1999/xhtml';

/** Resolve owners from endpoints only; nested item bodies remain opaque. */
export const selectedPropertyList = (editor: Editor): HTMLElement | undefined => {
  const root = editor.surface;
  const selection = root.ownerDocument.getSelection();
  if (!selection || selection.rangeCount !== 1) return;
  const range = selection.getRangeAt(0);
  const at = (node: Node): HTMLElement | undefined => {
    const element = node.nodeType === 1 ? node as Element : node.parentElement;
    if (!element || element === root || !root.contains(element)) return;
    for (let ancestor: Element | null = element; ancestor && ancestor !== root; ancestor = ancestor.parentElement)
      if (ancestor.namespaceURI !== namespace || ancestor.hasAttribute('data-mw-node')) return;
    const list = element.closest<HTMLElement>('ul,ol');
    if (!list || !root.contains(list) || element.closest('td,th') !== list.closest('td,th')) return;
    return list;
  };
  const list = at(range.startContainer);
  if (!list || list !== at(range.endContainer)) return;
  for (const child of list.childNodes) {
    if (child.nodeType === 3 && /^[\t\n\f\r ]*$/.test(child.textContent ?? '')) continue;
    if (child.nodeType !== 1) return;
    const element = child as Element;
    if (element.namespaceURI !== namespace || element.localName !== 'li' || element.hasAttribute('data-mw-node')) return;
  }
  return list;
};
