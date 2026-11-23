import type { DocumentSchema } from '../schema/types.js';

/** Validate one small semantic span; never rescan the entire editor per atom. */
export const semanticPresentationTarget = (surface: HTMLElement, schema: DocumentSchema, node: HTMLElement): boolean => {
  if (!node || node.nodeType !== 1 || node.namespaceURI !== 'http://www.w3.org/1999/xhtml'
    || node.localName !== 'span' || !surface.contains(node) || !node.isConnected || node.hasAttribute('is')) return false;
  const name = node.getAttribute('data-mw-node');
  const text = node.textContent ?? '';
  if (!name || !text.length || text.length > 2048 || /[\u0000-\u001f\u007f\u2028\u2029]/.test(text)
    || [...node.childNodes].some((child) => child.nodeType !== 3)) return false;
  const attributes = Object.fromEntries([...node.attributes].filter((attribute) => attribute.name !== 'contenteditable')
    .map((attribute) => [attribute.name, attribute.value]));
  try {
    const checked = schema.validateDocument({ version: 1, children: [
      { type: 'element', tag: 'span', attributes, children: [{ type: 'text', text }] },
    ] });
    const child = checked.children[0];
    return child?.type === 'element' && child.tag === 'span' && child.attributes['data-mw-node'] === name
      && Object.keys(child.attributes).length === Object.keys(attributes).length
      && Object.entries(attributes).every(([key, value]) => child.attributes[key] === value);
  }
  catch {
    return false;
  }
};
