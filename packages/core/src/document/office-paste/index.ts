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

export const normalizePointSize = (element: Element): void => {
  if (!htmlElement(element)) return;
  const style = element.getAttribute('style');
  if (!style || style.length > 20000 || !/pt/i.test(style)
    || element.closest('[data-mw-node]')) return;
  let changed = false;
  const declarations = style.split(';').map((part) => {
    const separator = part.indexOf(':');
    if (part.slice(0, separator).trim().toLowerCase() !== 'font-size') return part;
    const point = /^(\d{1,4}(?:\.\d{1,3})?)pt$/i.exec(part.slice(separator + 1).trim());
    if (!point) return part;
    const pixels = Math.round(Number(point[1]) * 4 / 3 * 1000) / 1000;
    if (pixels > 9999.999) return part;
    changed = true;
    return `font-size: ${pixels}px`;
  });
  if (changed) element.setAttribute('style', declarations.join(';'));
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
  const wingdingsBullet = text === '§' && (() => {
    for (let current: Element | null = marker; current && current !== element; current = current.parentElement) {
      if (current.localName !== 'span') continue;
      const family = declaration(current, 'font-family');
      if (family !== undefined) return /^(?:wingdings|"wingdings"|'wingdings')$/.test(family);
    }
    return false;
  })();
  if (!numbered && !/^[·•○▪■o]$/.test(text) && !wingdingsBullet) return;
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
    if (htmlElement(element) && element.localName === 'td'
      && element.parentElement?.localName === 'tr' && htmlElement(element.parentElement)
      && (element.getAttribute('style')?.length ?? 0) <= 20000
      && declaration(element, 'mso-ignore') === 'colspan'
      && !element.closest('[data-mw-node]') && !element.querySelector('[data-mw-node]')
      && (!element.hasAttribute('rowspan') || element.getAttribute('rowspan') === '1')) {
      const value = element.getAttribute('colspan') ?? '';
      const span = /^\d{1,4}$/.test(value) ? Number(value) : 0;
      if (span >= 2 && span <= 1000) {
        count += span - 1;
        if (count > maximumNodes) throw new RangeError('Office HTML exceeds structural limits.');
        element.removeAttribute('colspan');
        const reference = element.nextSibling;
        for (let index = 1; index < span; index++)
          element.parentNode!.insertBefore(element.ownerDocument.createElement('td'), reference);
      }
    }
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
