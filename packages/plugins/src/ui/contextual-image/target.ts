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
      if (owned.namespaceURI !== 'http://www.w3.org/1999/xhtml' || owned.hasAttribute('data-mw-node') || owned.localName === 'img') return false;
  }
  return images === 1;
};

export const ordinaryContextualImage = (editor: Editor, image: HTMLImageElement): boolean => {
  const root = editor.surface;
  if (!root.contains(image) || !simpleFigure(editor, image)) return false;
  const view = root.ownerDocument.defaultView!;
  for (let node: Element | null = image; node; node = node.parentElement) {
    if (node.namespaceURI !== 'http://www.w3.org/1999/xhtml' || node.hasAttribute('hidden')) return false;
    if (node !== root && root.contains(node) && node.hasAttribute('data-mw-node')) return false;
    const style = view.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
  }
  return true;
};

export const contextualImageTarget = (editor: Editor, range: Range): ContextualImageTarget | undefined => {
  if (range.collapsed || range.startContainer !== range.endContainer || range.startContainer.nodeType !== 1
    || range.endOffset !== range.startOffset + 1 || !editor.surface.contains(range.startContainer)) return;
  const node = range.startContainer.childNodes[range.startOffset];
  if (node?.nodeType !== 1) return;
  const image = node as HTMLImageElement;
  if (image.localName !== 'img' || image.namespaceURI !== 'http://www.w3.org/1999/xhtml' || !ordinaryContextualImage(editor, image)) return;
  return { image, range: range.cloneRange() };
};

export const nativeContextualImage = (editor: Editor): ContextualImageTarget | undefined => {
  const selection = editor.surface.ownerDocument.getSelection();
  return selection?.rangeCount === 1 ? contextualImageTarget(editor, selection.getRangeAt(0)) : undefined;
};
