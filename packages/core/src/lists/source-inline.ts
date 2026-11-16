const inlineTags = new Set(['strong', 'em', 'u', 's', 'sub', 'sup', 'a', 'span', 'code', 'br']);

/** Editable list sources exclude images while requiring the HTML namespace at every level. */
export const sourceInlineNode = (node: Node): boolean => node.nodeType === 3 || (node instanceof HTMLElement
  && node.namespaceURI === 'http://www.w3.org/1999/xhtml' && inlineTags.has(node.localName)
  && [...node.childNodes].every(sourceInlineNode));
