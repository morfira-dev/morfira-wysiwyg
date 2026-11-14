const inlineTags = new Set(['strong', 'em', 'u', 's', 'sub', 'sup', 'a', 'span', 'code', 'br', 'img']);

export const inlinePayloadNode = (node: Node): boolean => node.nodeType === 3 || (node instanceof HTMLElement && node.namespaceURI === 'http://www.w3.org/1999/xhtml' && inlineTags.has(node.localName) && [...node.childNodes].every(inlinePayloadNode));

export const formattingWhitespace = (node: Node): boolean => node.nodeType === 3 && /^[\t\n\f\r ]*$/.test(node.textContent ?? '');

export const ordinaryPayloadBody = (node: Node): node is HTMLElement => node instanceof HTMLElement
  && node.namespaceURI === 'http://www.w3.org/1999/xhtml'
  && /^(p|h[1-6])$/.test(node.localName) && !node.hasAttribute('data-mw-node')
  && [...node.childNodes].every(inlinePayloadNode);

export const quoteBodyBlocks = (quote: HTMLElement): HTMLElement[] | undefined => {
  const nodes = [...quote.childNodes].filter((node) => !formattingWhitespace(node));
  return nodes.length > 0 && nodes.every(ordinaryPayloadBody) ? nodes : undefined;
};

/** Read-only validation shared by detached payloads and opaque paste sources. */
export const isOrdinaryQuote = (node: Node): node is HTMLElement => node instanceof HTMLElement
  && node.namespaceURI === 'http://www.w3.org/1999/xhtml' && node.localName === 'blockquote'
  && !node.hasAttribute('data-mw-node')
  && ([...node.childNodes].every(inlinePayloadNode) || Boolean(quoteBodyBlocks(node)));
