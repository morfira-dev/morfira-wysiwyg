import { maximumDepth, maximumNodes } from '../budget.js';
import type { OfficeListItem, OfficeListLevel } from './types.js';

const htmlNamespace = 'http://www.w3.org/1999/xhtml';
const htmlElement = (element: Element): boolean => element.namespaceURI === htmlNamespace;
const declaration = (element: Element, property: string): string | undefined => {
  let result: string | undefined;
  for (const part of (element.getAttribute('style') ?? '').split(';')) {
    const separator = part.indexOf(':');
    if (part.slice(0, separator).trim().toLowerCase() === property)
      result = part.slice(separator + 1).trim().toLowerCase();
  }
  return result;
};

const listItem = (element: Element): OfficeListItem | undefined => {
  if (!htmlElement(element) || element.localName !== 'p'
    || element.closest('[data-mw-node]') || element.querySelector('[data-mw-node]')) return;
  const metadata = /^l(\d{1,9})\s+level([1-9])\s+lfo(\d{1,9})$/.exec(declaration(element, 'mso-list') ?? '');
  if (!metadata) return;
  const markers = [...element.querySelectorAll('span')].filter((span) => htmlElement(span) && declaration(span, 'mso-list') === 'ignore');
  if (markers.length !== 1) return;
  const marker = markers[0];
  // A marker is text-only metadata, never authority to discard application content.
  if ([...marker.querySelectorAll('*')].some((child) => !htmlElement(child)
    || !['span', 'b', 'i', 'strong', 'em', 'u', 's', 'sub', 'sup'].includes(child.localName))) return;
  const text = (marker.textContent ?? '').trim();
  const numbered = /^(\d{1,9})[.)]$/.exec(text);
  const number = numbered ? Number(numbered[1]) : 0;
  if (!numbered && !/^[·•○▪■o]$/.test(text)) return;
  if (numbered && (!Number.isSafeInteger(number) || number < 1)) return;
  return { paragraph: element as HTMLParagraphElement, marker, identity: `${metadata[1]}:${metadata[3]}`, level: Number(metadata[2]), kind: numbered ? 'ol' : 'ul', number };
};

const normalizeLists = (parent: ParentNode): void => {
  let identity: string | undefined;
  let levels: OfficeListLevel[] = [];
  for (const node of [...parent.childNodes]) {
    if (node.nodeType === 8 || (node.nodeType === 3 && !(node.textContent ?? '').trim())) continue;
    const item = node.nodeType === 1 ? listItem(node as Element) : undefined;
    if (!item || (item.identity !== identity && item.level !== 1) || item.level > levels.length + 1) {
      identity = undefined;
      levels = [];
      continue;
    }
    if (item.identity !== identity) {
      identity = item.identity;
      levels = [];
    }
    levels = levels.slice(0, item.level);
    let current = levels[item.level - 1];
    if (!current || current.list.localName !== item.kind || (item.kind === 'ol' && current.nextNumber !== item.number)) {
      const list = node.ownerDocument!.createElement(item.kind);
      if (item.kind === 'ol' && item.number !== 1) list.setAttribute('start', String(item.number));
      if (item.level === 1) parent.insertBefore(list, node);
      else levels[item.level - 2].lastItem.append(list);
      current = { list, lastItem: node.ownerDocument!.createElement('li'), nextNumber: item.number };
      levels[item.level - 1] = current;
    }
    item.marker.remove();
    const li = node.ownerDocument!.createElement('li');
    li.append(item.paragraph);
    current.list.append(li);
    current.lastItem = li;
    current.nextNumber = item.number + 1;
  }
};

/** Normalize a narrow Office subset while its source still belongs to an inert template. */
export const normalizeOfficeHTML = (root: DocumentFragment): void => {
  const elements: Element[] = [];
  const stack = [...root.childNodes].map((node) => ({ node, depth: 0 }));
  let count = 0;
  while (stack.length) {
    const entry = stack.pop()!;
    if (++count > maximumNodes || entry.depth > maximumDepth)
      throw new RangeError('Office HTML exceeds structural limits.');
    if (entry.node.nodeType === 1) elements.push(entry.node as Element);
    for (const child of entry.node.childNodes) stack.push({ node: child, depth: entry.depth + 1 });
  }
  for (const element of elements) {
    if (htmlElement(element) && element.localName === 'b'
      && element.id.startsWith('docs-internal-guid-')
      && element.id.length > 'docs-internal-guid-'.length
      && ['normal', '400'].includes(declaration(element, 'font-weight') ?? '')
      && !element.closest('[data-mw-node]') && !element.querySelector('[data-mw-node]')) {
      while (element.firstChild) element.parentNode!.insertBefore(element.firstChild, element);
      element.remove();
    }
  }
  // Each original parent owns its sibling sequence; nested lists never cross containers.
  for (const element of elements) if (htmlElement(element)) normalizeLists(element);
  normalizeLists(root);
};
