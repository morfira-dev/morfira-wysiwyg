import type { Editor, ElementNode } from '@morfira-dev/wysiwyg-core';
import type { ContextualLinkTarget, ContextualLinkURL } from './internal-types.js';
import { selectedLinkAnchors } from '../links/selection.js';
import { sameContextualRange } from '../shared/range.js';
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

const flows = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,td,th';
const forbidden = 'img,figure,figcaption,pre,code,table,thead,tbody,tfoot,tr,td,th,ul,ol,li,blockquote,hr,[data-mw-node],[contenteditable="false"]';
const elementAt = (node: Node): Element | null => node.nodeType === 1 ? node as Element : node.parentElement;

export const contextualLinkTarget = (editor: Editor, range: Range): ContextualLinkTarget | undefined => {
  const root = editor.surface;
  if (!root.isConnected || !editor.element.contains(root) || !root.contains(range.startContainer) || !root.contains(range.endContainer)) return;
  const element = elementAt(range.startContainer);
  const anchor = linkRangeAnchor(root, range);
  const enclosing = element?.closest('a');
  if (enclosing?.contains(range.endContainer) && !anchor) return;
  if (anchor && ordinaryContextualAnchor(editor, anchor)) {
    for (let node = element; node && node !== anchor; node = node.parentElement)
      if (node.namespaceURI !== 'http://www.w3.org/1999/xhtml' || node.hasAttribute('data-mw-node')) return;
    const url = contextualLinkURL(editor, anchor);
    return url ? { kind: 'anchor', anchor, range: range.cloneRange(), url } : undefined;
  }
  if (range.collapsed || !range.toString()) return;
  const flow = element?.closest<HTMLElement>(flows);
  if (!flow || flow === root || flow !== elementAt(range.endContainer)?.closest(flows)) return;
  for (const point of [range.startContainer, range.endContainer]) {
    for (let node = elementAt(point); node && node !== root; node = node.parentElement) {
      if (node.namespaceURI !== 'http://www.w3.org/1999/xhtml' || node.matches('figure,figcaption,pre,code,[data-mw-node],[contenteditable="false"]')) return;
      const style = root.ownerDocument.defaultView!.getComputedStyle(node);
      if (node.hasAttribute('hidden') || style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return;
    }
  }
  // Inspect actual nodes before any fragment cloning: IMG must stay observational.
  for (const node of flow.querySelectorAll('*')) {
    if (!range.intersectsNode(node)) continue;
    const style = root.ownerDocument.defaultView!.getComputedStyle(node);
    if (node.namespaceURI !== 'http://www.w3.org/1999/xhtml' || node.matches(forbidden)
      || node.hasAttribute('hidden') || style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return;
  }
  const anchors = selectedLinkAnchors(root, range);
  if (!anchors.length || anchors.some((node) => !ordinaryContextualAnchor(editor, node) || !contextualLinkURL(editor, node))) return;
  return { kind: 'range', flow, anchors, range: range.cloneRange() };
};

export const sameLinkTarget = (left: ContextualLinkTarget | undefined, right: ContextualLinkTarget | undefined): boolean => {
  if (!left || !right || left.kind !== right.kind || !sameContextualRange(left.range, right.range)) return false;
  if (left.kind === 'anchor' && right.kind === 'anchor') return left.anchor === right.anchor;
  return left.kind === 'range' && right.kind === 'range' && left.flow === right.flow
    && left.anchors.length === right.anchors.length && left.anchors.every((node, index) => node === right.anchors[index]);
};
export const linkTargetRange = (target: ContextualLinkTarget): Range => target.kind === 'anchor' ? contextualLinkRange(target.anchor) : target.range;
export const linkTargetNodes = (target: ContextualLinkTarget): HTMLElement[] => target.kind === 'anchor' ? [target.anchor] : [target.flow, ...target.anchors];

export const nativeContextualLink = (editor: Editor): ContextualLinkTarget | undefined => {
  const selection = editor.surface.ownerDocument.getSelection();
  return selection?.rangeCount === 1 ? contextualLinkTarget(editor, selection.getRangeAt(0)) : undefined;
};

export const contextualLinkRange = (anchor: HTMLAnchorElement): Range => {
  const range = anchor.ownerDocument.createRange();
  range.selectNodeContents(anchor);
  return range;
};
