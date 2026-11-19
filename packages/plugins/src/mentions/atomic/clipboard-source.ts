import { atomicFlow, validAtomicMention } from './selection.js';

const inline = new Set(['span', 'strong', 'em', 'u', 's', 'sub', 'sup', 'br']);
export const ordinaryClipboardLeaf = (element: Element): element is HTMLElement => element.namespaceURI === 'http://www.w3.org/1999/xhtml'
  && /^(p|h[1-6])$/.test(element.localName) && !element.hasAttribute('data-mw-node');

const supported = (root: HTMLElement, flow: HTMLElement, range?: Range): boolean => {
  for (const child of flow.querySelectorAll('*')) {
    if (range && !range.intersectsNode(child)) continue;
    if (validAtomicMention(root, child)) continue;
    if (child.namespaceURI !== 'http://www.w3.org/1999/xhtml'
      || child.hasAttribute('data-mw-node') || !inline.has(child.localName)) return false;
  }
  return true;
};

/** Same-flow edits retain their old profile; splitting/crossing requires safe ordinary leaves. */
export const clipboardLeaves = (root: HTMLElement, range: Range, split = false): HTMLElement[] | undefined => {
  const first = atomicFlow(root, range.startContainer);
  const last = atomicFlow(root, range.endContainer);
  if (!first || !last) return;
  if (first === last && !split) return supported(root, first, range) ? [first] : undefined;
  const parent = first.parentElement;
  if (!parent || last.parentElement !== parent || (parent !== root && (!['blockquote', 'td', 'th', 'li'].includes(parent.localName)
    || parent.hasAttribute('data-mw-node')))) return;
  const leaves: HTMLElement[] = [];
  for (let node: ChildNode | null = first; node; node = node.nextSibling) {
    if (node.nodeType === 3 && /^[\t\n\f\r ]*$/.test(node.textContent ?? '')) continue;
    if (node.nodeType !== 1 || !ordinaryClipboardLeaf(node as Element) || !supported(root, node as HTMLElement)) return;
    leaves.push(node as HTMLElement);
    if (node === last) return leaves;
  }
};
