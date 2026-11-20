const inline = new Set(['span', 'strong', 'em', 'u', 's', 'sub', 'sup', 'a', 'code', 'br']);
const resources = new Set(['img', 'table', 'figure', 'figcaption', 'hr', 'input', 'iframe', 'video', 'audio']);
const body = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,td,th,pre';
const elementFor = (node: Node): Element | null => node.nodeType === 1 ? node as Element : node.parentElement;
const protectedElement = (element: Element): boolean => element.namespaceURI !== 'http://www.w3.org/1999/xhtml'
  || element.hasAttribute('data-mw-node') || element.getAttribute('contenteditable')?.toLowerCase() === 'false';

/** Deliberately accept one ordinary own text flow, never a structural replacement. */
export const ordinaryCharacterRange = (root: HTMLElement, range: Range): boolean => {
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return false;
  const first = elementFor(range.startContainer)?.closest(body);
  const last = elementFor(range.endContainer)?.closest(body);
  if (!first || first !== last || !root.contains(first)) return false;
  for (const endpoint of [range.startContainer, range.endContainer]) {
    for (let element = elementFor(endpoint); element && element !== root; element = element.parentElement) {
      // Owning table containers are compatible with an ordinary cell text range;
      // selecting a table node or an explicit logical rectangle is not.
      if (protectedElement(element) || (resources.has(element.localName) && element.localName !== 'table')) return false;
    }
  }
  for (const element of first.querySelectorAll('*')) {
    if (!range.intersectsNode(element)) continue;
    if (protectedElement(element) || resources.has(element.localName) || !inline.has(element.localName)) return false;
  }
  return true;
};
