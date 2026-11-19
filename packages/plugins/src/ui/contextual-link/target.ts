import type { Editor, ElementNode } from '@morfira-dev/wysiwyg-core';
import type { ContextualLinkTarget, ContextualLinkURL } from './internal-types.js';
import { linkRangeAnchor } from '../links/anchor.js';

export const contextualLinkURL = (editor: Editor, anchor: HTMLAnchorElement): ContextualLinkURL | undefined => {
  const href = anchor.getAttribute('href');
  if (!href) return;
  if (/^[/\\]{2}/.test(href.trim())) return;
  try {
    const document = editor.schema.validateDocument({ version: 1, children: [{ type: 'element', tag: 'a', attributes: { href }, children: [] }] });
    const clean = (document.children[0] as ElementNode).attributes.href;
    if (!clean) return;
    const url = new URL(clean, anchor.ownerDocument.baseURI);
    if (!['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol)) return;
    return { display: clean, href: url.href };
  }
  catch { return; }
};

export const ordinaryContextualAnchor = (editor: Editor, anchor: HTMLAnchorElement): boolean => {
  const root = editor.surface;
  if (!root.contains(anchor) || !anchor.textContent) return false;
  const view = root.ownerDocument.defaultView!;
  for (let node: Element | null = anchor; node; node = node.parentElement) {
    if (node.namespaceURI !== 'http://www.w3.org/1999/xhtml' || node.hasAttribute('hidden')) return false;
    if (node !== root && root.contains(node) && node.hasAttribute('data-mw-node')) return false;
    const style = view.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
  }
  return true;
};

export const contextualLinkTarget = (editor: Editor, range: Range): ContextualLinkTarget | undefined => {
  const root = editor.surface;
  if (range.startContainer === root || !root.contains(range.startContainer)) return;
  const element = range.startContainer.nodeType === 1 ? range.startContainer as Element : range.startContainer.parentElement;
  const anchor = linkRangeAnchor(root, range);
  if (!anchor || !ordinaryContextualAnchor(editor, anchor)) return;
  for (let node = element; node && node !== anchor; node = node.parentElement)
    if (node.namespaceURI !== 'http://www.w3.org/1999/xhtml' || node.hasAttribute('data-mw-node')) return;
  const url = contextualLinkURL(editor, anchor);
  return url ? { anchor, range: range.cloneRange(), url } : undefined;
};

export const nativeContextualLink = (editor: Editor): ContextualLinkTarget | undefined => {
  const selection = editor.surface.ownerDocument.getSelection();
  return selection?.rangeCount === 1 ? contextualLinkTarget(editor, selection.getRangeAt(0)) : undefined;
};

export const contextualLinkRange = (anchor: HTMLAnchorElement): Range => {
  const range = anchor.ownerDocument.createRange();
  range.selectNodeContents(anchor);
  return range;
};
