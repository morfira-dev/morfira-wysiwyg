import type { Editor } from '@morfira-dev/wysiwyg-core';
import type { ContextualImageTarget } from './internal-types.js';

/** Only the existing plugin's simple figure ownership is eligible for contextual edits. */
const simpleFigure = (editor: Editor, image: HTMLImageElement): boolean => {
  const figure = image.closest('figure');
  if (!figure || !editor.surface.contains(figure)) return true;
  if (figure !== image.parentElement || figure.children.length > 2) return false;
  let images = 0;
  let captions = 0;
  for (const child of figure.childNodes) {
    if (child === image) { images++; continue; }
    if (child.nodeType !== 1) {
      if (child.textContent?.trim()) return false;
      continue;
    }
    const element = child as Element;
    if (element.localName !== 'figcaption' || element.namespaceURI !== 'http://www.w3.org/1999/xhtml' || ++captions > 1) return false;
    for (const owned of [element, ...element.querySelectorAll('*')])
      if (owned.namespaceURI !== 'http://www.w3.org/1999/xhtml' || owned.hasAttribute('data-mw-node')
        || owned.getAttribute('contenteditable') === 'false' || owned.localName === 'img') return false;
  }
  return images === 1;
};

export const ordinaryContextualImage = (editor: Editor, image: HTMLImageElement): boolean => {
  const root = editor.surface;
  if (!root.isConnected || root.ownerDocument !== editor.element.ownerDocument || !editor.element.isConnected
    || !editor.element.contains(root) || !root.contains(image) || !simpleFigure(editor, image)) return false;
  const view = root.ownerDocument.defaultView!;
  for (let node: Element | null = image; node; node = node.parentElement) {
    if (node.namespaceURI !== 'http://www.w3.org/1999/xhtml' || node.hasAttribute('hidden')) return false;
    if (node !== root && root.contains(node) && (node.hasAttribute('data-mw-node') || node.getAttribute('contenteditable') === 'false')) return false;
    const style = view.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
  }
  return true;
};

export const contextualImageTarget = (editor: Editor, range: Range): ContextualImageTarget | undefined => {
  const root = editor.surface;
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return;
  const element = range.startContainer.nodeType === 1 ? range.startContainer as Element : range.startContainer.parentElement;
  let image: HTMLImageElement | undefined;
  if (range.collapsed) {
    const caption = element?.closest('figcaption');
    const figure = caption?.parentElement;
    if (!caption || figure?.localName !== 'figure') return;
    const view = root.ownerDocument.defaultView!;
    for (let node: Element | null = element; node && node !== figure; node = node.parentElement) {
      if (node.namespaceURI !== 'http://www.w3.org/1999/xhtml' || node.matches('a,code,pre,[data-mw-node],[contenteditable="false"],[hidden]')) return;
      const style = view.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return;
    }
    image = [...figure.children].find((child) => child.localName === 'img') as HTMLImageElement | undefined;
  }
  else {
    if (range.startContainer !== range.endContainer || range.startContainer.nodeType !== 1
      || range.endOffset !== range.startOffset + 1) return;
    const node = range.startContainer.childNodes[range.startOffset];
    if (node?.nodeType !== 1) return;
    const selected = node as Element;
    if (selected.localName === 'img') image = selected as HTMLImageElement;
    else if (selected.localName === 'figure') {
      const view = root.ownerDocument.defaultView!;
      // This new range owns the whole figure, including its caption descendants.
      // An IMG-only selection deliberately retains its existing eligibility.
      for (const owned of [selected, ...selected.querySelectorAll('*')]) {
        const style = view.getComputedStyle(owned);
        if (owned.hasAttribute('hidden') || style.display === 'none'
          || style.visibility === 'hidden' || style.visibility === 'collapse') return;
      }
      image = [...selected.children].find((child) => child.localName === 'img') as HTMLImageElement | undefined;
    }
    else return;
  }
  if (!image || image.namespaceURI !== 'http://www.w3.org/1999/xhtml' || !ordinaryContextualImage(editor, image)) return;
  const placementRange = root.ownerDocument.createRange();
  placementRange.selectNode(image);
  return { image, range: range.cloneRange(), placementRange };
};

export const nativeContextualImage = (editor: Editor): ContextualImageTarget | undefined => {
  const selection = editor.surface.ownerDocument.getSelection();
  return selection?.rangeCount === 1 ? contextualImageTarget(editor, selection.getRangeAt(0)) : undefined;
};
