import { safeURL } from './security.js';
import { normalizeFontFamily } from './font-family.js';
import { normalizeListMarker } from './list-marker.js';
import { normalizeDirection } from './direction.js';
import { normalizeCellBoxStyle, normalizeCellBorder } from './cell-box.js';
import { countText, countElement, maximumHTMLLength, maximumNodes, maximumDepth } from './budget.js';
import type { DocumentAttributeResolver, DocumentBudget } from './internal-types.js';
import type { DocumentTag, TextNode, ElementNode, DocumentNode, EditorDocument } from './types.js';
export type { DocumentTag, TextNode, ElementNode, DocumentNode, EditorDocument } from './types.js';
/** Versioned, framework-independent document tree. Only supported HTML semantics are stored. */
export const documentTags = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 'strong', 'em', 'u', 's', 'sub', 'sup', 'a', 'span', 'br', 'hr', 'ul', 'ol', 'li', 'img', 'figure', 'figcaption', 'table', 'caption', 'colgroup', 'col', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th'] as const;
const tags = new Set<string>(documentTags);
const omitted = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template', 'form', 'input', 'button', 'textarea', 'select', 'noscript', 'link', 'meta', 'base']);
const aliases: Record<string, string> = { b: 'strong', i: 'em', strike: 's', div: 'p' };
const safeStyle = (tag: DocumentTag, value: string): string => {
  const result: string[] = [];
  for (const declaration of value.split(';')) {
    const separator = declaration.indexOf(':');
    if (separator < 0)
      continue;
    const property = declaration.slice(0, separator).trim().toLowerCase();
    if (property === 'list-style-type') {
      const marker = normalizeListMarker(tag, declaration.slice(separator + 1));
      if (marker) result.push(`list-style-type: ${marker}`);
      continue;
    }
    if (property === 'font-family') {
      const family = normalizeFontFamily(declaration.slice(separator + 1).trim());
      if (family) result.push(`font-family: ${family}`);
      continue;
    }
    const content = declaration.slice(separator + 1).trim().toLowerCase();
    if (property === 'border') {
      const clean = normalizeCellBorder(tag, content);
      if (clean) result.push(clean);
      continue;
    }
    if (['padding', 'border-width', 'border-style'].includes(property)) {
      const clean = normalizeCellBoxStyle(tag, property, content);
      if (clean) result.push(`${property}: ${clean}`);
      continue;
    }
    const color = /^(#[a-f\d]{3,8}|[a-z]{1,24}|(?:rgb|rgba|hsl|hsla)\([\d\s.,%+-]+\))$/;
    const length = /^(?:\d{1,4}(?:\.\d{1,3})?)(?:px|%|em|rem)$/;
    const valid = ['color', 'background-color', 'border-color'].includes(property) ? color.test(content)
      : ['width', 'height', 'font-size'].includes(property) ? length.test(content)
        : property === 'vertical-align' ? ['td', 'th'].includes(tag) && ['top', 'middle', 'bottom'].includes(content)
          : property === 'margin-left' || property === 'margin-right' ? ['table', 'img'].includes(tag) && ['0px', 'auto'].includes(content)
            : property === 'display' ? tag === 'img' && content === 'block'
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
/** Keep ordered-list numbering within the signed DOM integer range. */
const orderedListStart = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || value.length > 20000 || !/^[+-]?\d+$/.test(value.trim())) return;
  const number = Number(value);
  if (Number.isSafeInteger(number) && number >= -2147483648 && number <= 2147483647) return String(number);
};
const attributesFor = (tag: DocumentTag, input: Record<string, unknown>, source: 'html' | 'json', resolve?: DocumentAttributeResolver, originalTag?: string): Record<string, string> => {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === 'dir') {
      const direction = normalizeDirection(tag, value, source === 'json');
      if (direction) output.dir = direction;
      else if (source === 'json') throw new TypeError('Direction must be canonical ltr or rtl on a supported block.');
      continue;
    }
    if (key === 'start') {
      const clean = tag === 'ol' ? orderedListStart(value) : undefined;
      if (clean !== undefined) output.start = clean;
      else if (source === 'json') throw new TypeError('Ordered-list start must be a signed 32-bit decimal integer string on ol.');
      continue;
    }
    if (key === 'reversed') {
      if (tag === 'ol' && (source === 'html' || value === '')) output.reversed = '';
      else if (source === 'json') throw new TypeError('Reversed must be an empty string on ol.');
      continue;
    }
    if (typeof value !== 'string' || value.length > 20000)
      continue;
    if (key === 'style') {
      const clean = safeStyle(tag, value);
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
  if (output.style && output.style.length > 20000) throw new RangeError('Normalized style exceeds the attribute length limit.');
  return output;
};
const readDOM = (node: Node, depth: number, budget: DocumentBudget, resolve?: DocumentAttributeResolver): DocumentNode[] => {
  if (++budget.count > maximumNodes || depth > maximumDepth)
    throw new RangeError('Document exceeds structural limits.');
  if (node.nodeType === 3) {
    const text = node.textContent ?? '';
    countText(budget, text);
    return [{ type: 'text', text }];
  }
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
  countElement(budget, tag, attributes);
  return [{ type: 'element', tag: tag as DocumentTag, attributes, children }];
};
export const parseHTML = (html: string, resolve?: DocumentAttributeResolver): EditorDocument => {
  if (html.length > maximumHTMLLength)
    throw new RangeError('HTML exceeds the document size limit.');
  // A template is inert: script execution and active resource loading are never used for import.
  const template = document.createElement('template');
  template.innerHTML = html;
  const budget: DocumentBudget = { count: 0, htmlLength: 0 };
  return { version: 1, children: [...template.content.childNodes].flatMap((node) => readDOM(node, 0, budget, resolve)) };
};
export const validateDocument = (input: unknown, resolve?: DocumentAttributeResolver): EditorDocument => {
  if (!input || typeof input !== 'object' || !('version' in input) || input.version !== 1 || !('children' in input) || !Array.isArray(input.children))
    throw new TypeError('Expected a version 1 document.');
  const budget: DocumentBudget = { count: 0, htmlLength: 0 };
  const visit = (value: unknown, depth: number): DocumentNode => {
    if (++budget.count > maximumNodes || depth > maximumDepth)
      throw new RangeError('Document exceeds structural limits.');
    if (!value || typeof value !== 'object' || !('type' in value))
      throw new TypeError('Invalid document node.');
    if (value.type === 'text' && 'text' in value && typeof value.text === 'string') {
      countText(budget, value.text);
      return { type: 'text', text: value.text };
    }
    if (value.type !== 'element' || !('tag' in value) || typeof value.tag !== 'string' || !tags.has(value.tag) || !('children' in value) || !Array.isArray(value.children))
      throw new TypeError('Invalid document element.');
    const attrs = 'attributes' in value && value.attributes && typeof value.attributes === 'object' && !Array.isArray(value.attributes) ? value.attributes : {};
    const attributes = attributesFor(value.tag as DocumentTag, attrs as Record<string, unknown>, 'json', resolve);
    countElement(budget, value.tag, attributes);
    return { type: 'element', tag: value.tag as DocumentTag, attributes, children: children(value.children, depth + 1) };
  };
  const children = (values: unknown[], depth: number): DocumentNode[] => {
    if (values.length > maximumNodes) throw new RangeError('Document children exceed node limit.');
    const output: DocumentNode[] = [];
    for (let index = 0; index < values.length; index++) {
      if (!Object.hasOwn(values, index)) throw new TypeError('Document children must be dense arrays.');
      output.push(visit(values[index], depth));
    }
    return output;
  };
  return { version: 1, children: children(input.children, 0) };
};
export const renderDocument = (value: EditorDocument, owner: Document = document): DocumentFragment => {
  const fragment = owner.createDocumentFragment();
  const append = (parent: Node, node: DocumentNode) => {
    if (node.type === 'text') {
      parent.appendChild(owner.createTextNode(node.text));
      return;
    }
    const element = owner.createElement(node.tag);
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
  const container = document.createElement('template');
  container.content.append(renderDocument(value, container.content.ownerDocument));
  return container.innerHTML;
};
export const sanitizeHTML = (html: string): string => { return documentHTML(parseHTML(html)); };
