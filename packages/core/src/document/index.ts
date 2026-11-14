import { safeURL } from './security.js';
import type { DocumentAttributeResolver } from './internal-types.js';
import type { DocumentTag, TextNode, ElementNode, DocumentNode, EditorDocument } from './types.js';
export type { DocumentTag, TextNode, ElementNode, DocumentNode, EditorDocument } from './types.js';
/** Versioned, framework-independent document tree. Only supported HTML semantics are stored. */
export const documentTags = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 'strong', 'em', 'u', 's', 'sub', 'sup', 'a', 'span', 'br', 'hr', 'ul', 'ol', 'li', 'img', 'figure', 'figcaption', 'table', 'caption', 'colgroup', 'col', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th'] as const;
const tags = new Set<string>(documentTags);
const omitted = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template', 'form', 'input', 'button', 'textarea', 'select', 'noscript', 'link', 'meta', 'base']);
const aliases: Record<string, string> = { b: 'strong', i: 'em', strike: 's', div: 'p' };
const MAX_NODES = 100000;
const MAX_DEPTH = 100;
const safeStyle = (value: string): string => {
  const result: string[] = [];
  for (const declaration of value.split(';')) {
    const separator = declaration.indexOf(':');
    if (separator < 0)
      continue;
    const property = declaration.slice(0, separator).trim().toLowerCase();
    const content = declaration.slice(separator + 1).trim().toLowerCase();
    const color = /^(#[a-f\d]{3,8}|[a-z]{1,24}|(?:rgb|rgba|hsl|hsla)\([\d\s.,%+-]+\))$/;
    const length = /^(?:\d{1,4}(?:\.\d{1,3})?)(?:px|%|em|rem)$/;
    const valid = ['color', 'background-color', 'border-color'].includes(property) ? color.test(content)
      : ['width', 'height', 'font-size'].includes(property) ? length.test(content)
        : property === 'text-align' ? ['left', 'center', 'right', 'justify'].includes(content)
          : property === 'font-weight' ? /^(bold|normal|[1-9]00)$/.test(content)
            : property === 'font-style' ? ['italic', 'normal'].includes(content)
              : property === 'text-decoration' ? /^(underline|line-through|none)$/.test(content)
                : false;
    if (valid)
      result.push(`${property}: ${content}`);
  }
  return result.join('; ');
};
const attributesFor = (tag: DocumentTag, input: Record<string, unknown>, source: 'html' | 'json', resolve?: DocumentAttributeResolver, originalTag?: string): Record<string, string> => {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value !== 'string' || value.length > 20000)
      continue;
    if (key === 'style') {
      const clean = safeStyle(value);
      if (clean)
        output.style = clean;
    }
    else if (key === 'title' || (tag === 'img' && key === 'alt'))
      output[key] = value;
    else if ((tag === 'a' && key === 'href') || (tag === 'img' && key === 'src')) {
      const clean = safeURL(value, tag === 'img');
      if (clean)
        output[key] = clean;
    }
    else if ((['td', 'th'].includes(tag) && ['rowspan', 'colspan'].includes(key)) || (['img', 'col', 'table'].includes(tag) && ['width', 'height', 'span'].includes(key))) {
      if (/^\d{1,4}$/.test(value) && Number(value) > 0 && Number(value) <= 1000)
        output[key] = value;
    }
    else if (tag === 'a' && key === 'target' && ['_self', '_blank'].includes(value))
      output.target = value;
    else if (tag === 'a' && key === 'rel') {
      const tokens = [...new Set(value.toLowerCase().split(/\s+/).filter((token) => ['noopener', 'noreferrer'].includes(token)))];
      if (tokens.length)
        output.rel = tokens.join(' ');
    }
    else if (tag === 'th' && key === 'scope' && ['row', 'col', 'rowgroup', 'colgroup'].includes(value))
      output[key] = value;
  }
  if (tag === 'img' && (output.width || output.height)) {
    const dimensions = ['width', 'height'].filter((key) => output[key]);
    const styles = (output.style ?? '').split(';').map((part) => part.trim()).filter((part) => part && !dimensions.includes(part.slice(0, part.indexOf(':')).trim()));
    output.style = [...styles, ...dimensions.map((key) => `${key}: ${output[key]}px`)].join('; ');
  }
  if (tag === 'a' && output.target === '_blank')
    output.rel = 'noopener noreferrer';
  if (resolve) Object.assign(output, resolve(tag, input, source, originalTag));
  else if (source === 'json' && Object.hasOwn(input, 'data-mw-node'))
    throw new TypeError('Unregistered schema node.');
  return output;
};
const readDOM = (node: Node, depth: number, budget: {
  count: number;
}, resolve?: DocumentAttributeResolver): DocumentNode[] => {
  if (++budget.count > MAX_NODES || depth > MAX_DEPTH)
    throw new RangeError('Document exceeds structural limits.');
  if (node.nodeType === 3)
    return [{ type: 'text', text: node.textContent ?? '' }];
  if (node.nodeType !== 1)
    return [];
  const element = node as Element;
  const original = element.localName.toLowerCase();
  if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml' || omitted.has(original))
    return [];
  const children = [...element.childNodes].flatMap((child) => readDOM(child, depth + 1, budget, resolve));
  const tag = aliases[original] ?? original;
  if (!tags.has(tag)) {
    if (resolve && element.hasAttribute('data-mw-node'))
      resolve(tag, Object.fromEntries([...element.attributes].map((attr) => [attr.name, attr.value])), 'html', original);
    return children;
  }
  const attributes = attributesFor(tag as DocumentTag, Object.fromEntries([...element.attributes].map((attr) => [attr.name, attr.value])), 'html', resolve, original);
  if (tag === 'img' && !attributes.src)
    return [];
  return [{ type: 'element', tag: tag as DocumentTag, attributes, children }];
};
export const parseHTML = (html: string, resolve?: DocumentAttributeResolver): EditorDocument => {
  if (html.length > 5000000)
    throw new RangeError('HTML exceeds the document size limit.');
  // A template is inert: script execution and active resource loading are never used for import.
  const template = document.createElement('template');
  template.innerHTML = html;
  const budget = { count: 0 };
  return { version: 1, children: [...template.content.childNodes].flatMap((node) => readDOM(node, 0, budget, resolve)) };
};
export const validateDocument = (input: unknown, resolve?: DocumentAttributeResolver): EditorDocument => {
  if (!input || typeof input !== 'object' || !('version' in input) || input.version !== 1 || !('children' in input) || !Array.isArray(input.children))
    throw new TypeError('Expected a version 1 document.');
  let count = 0;
  let textLength = 0;
  const visit = (value: unknown, depth: number): DocumentNode => {
    if (++count > MAX_NODES || depth > MAX_DEPTH)
      throw new RangeError('Document exceeds structural limits.');
    if (!value || typeof value !== 'object' || !('type' in value))
      throw new TypeError('Invalid document node.');
    if (value.type === 'text' && 'text' in value && typeof value.text === 'string') {
      textLength += value.text.length;
      if (textLength > 5000000)
        throw new RangeError('Document text exceeds size limit.');
      return { type: 'text', text: value.text };
    }
    if (value.type !== 'element' || !('tag' in value) || typeof value.tag !== 'string' || !tags.has(value.tag) || !('children' in value) || !Array.isArray(value.children))
      throw new TypeError('Invalid document element.');
    const attrs = 'attributes' in value && value.attributes && typeof value.attributes === 'object' && !Array.isArray(value.attributes) ? value.attributes : {};
    return { type: 'element', tag: value.tag as DocumentTag, attributes: attributesFor(value.tag as DocumentTag, attrs as Record<string, unknown>, 'json', resolve), children: value.children.map((child) => visit(child, depth + 1)) };
  };
  return { version: 1, children: input.children.map((child) => visit(child, 0)) };
};
export const renderDocument = (value: EditorDocument): DocumentFragment => {
  const fragment = document.createDocumentFragment();
  const append = (parent: Node, node: DocumentNode) => {
    if (node.type === 'text') {
      parent.appendChild(document.createTextNode(node.text));
      return;
    }
    const element = document.createElement(node.tag);
    for (const [key, value] of Object.entries(node.attributes))
      element.setAttribute(key, value);
    for (const child of node.children)
      append(element, child);
    parent.appendChild(element);
  };
  for (const node of value.children)
    append(fragment, node);
  return fragment;
};
export const documentHTML = (value: EditorDocument): string => {
  const container = document.createElement('div');
  container.append(renderDocument(value));
  return container.innerHTML;
};
export const sanitizeHTML = (html: string): string => { return documentHTML(parseHTML(html)); };
