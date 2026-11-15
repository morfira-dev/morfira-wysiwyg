import type { DocumentSchema } from '../schema/types.js';
import type { DocumentTag } from '../document/index.js';
import { documentHTML, parseHTML } from '../document/index.js';
import { normalizeFontFamily } from '../document/font-family.js';
import { copyDirection } from '../document/direction.js';
import { activeRange, readTextSelection, selectText, preserveRange } from '../selection/index.js';
import { inlineStyles, normalizeInlineStyle, transformInlineAttributes } from './inline-attributes.js';
import { applyLink } from './links.js';
import { inlineDocument } from './inline-document.js';
import { applyLocalInline } from './local-inline.js';
import { applyList, indentList, listState, selectedBlocks } from '../lists/index.js';
export const inlineFormats: Record<string, DocumentTag> = { bold: 'strong', italic: 'em', underline: 'u', strike: 's', code: 'code', subscript: 'sub', superscript: 'sup' };

const closestElement = (node: Node): Element | null => { return node.nodeType === 1 ? node as Element : node.parentElement; };
const formatsAt = (root: HTMLElement, node: Node): Record<string, unknown> => {
  let element = closestElement(node);
  const formats: Record<string, unknown> = {};
  while (element && element !== root) {
    for (const [name, tag] of Object.entries(inlineFormats))
      if (element.localName === tag)
        formats[name] = true;
    if (/^h[1-6]$/.test(element.localName) && formats.header === undefined)
      formats.header = Number(element.localName[1]);
    if (element.localName === 'blockquote')
      formats.blockquote = true;
    if (element.localName === 'pre')
      formats['code-block'] = true;
    if ((element.localName === 'ul' || element.localName === 'ol') && formats.list === undefined)
      formats.list = element.localName === 'ul' ? 'bullet' : 'ordered';
    if (element.localName === 'a' && formats.link === undefined) {
      formats.link = element.getAttribute('href');
      formats.linkTitle = element.getAttribute('title') ?? '';
      formats.linkTarget = element.getAttribute('target') ?? '_self';
    }
    if (element instanceof HTMLElement)
      for (const [name, property] of Object.entries(inlineStyles)) {
        const value = element.style.getPropertyValue(property);
        if (formats[name] === undefined && value)
          formats[name] = name === 'fontFamily' ? normalizeFontFamily(value) ?? value : value;
      }
    if (element instanceof HTMLElement && element.style.textAlign && formats.align === undefined)
      formats.align = element.style.textAlign;
    element = element.parentElement;
  }
  return formats;
};
export const readFormats = (root: HTMLElement): Record<string, unknown> => {
  const range = activeRange(root);
  if (!range)
    return {};
  let formats = formatsAt(root, range.startContainer);
  const mixed = new Set<string>();
  if (!range.collapsed) {
    const { index, length } = readTextSelection(root)!;
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let position = 0;
    let node: Node | null;
    const samples: Record<string, unknown>[] = [];
    while ((node = walker.nextNode())) {
      const end = position + node.textContent!.length;
      if (end > index && position < index + length)
        samples.push(formatsAt(root, node));
      position = end;
    }
    if (samples.length)
      formats = samples[0];
    const keys = [...Object.keys(inlineFormats), ...Object.keys(inlineStyles), 'header', 'list', 'blockquote', 'code-block', 'link', 'linkTitle', 'linkTarget', 'align'];
    const normalized = (sample: Record<string, unknown>, key: string) => sample[key] ?? (key === 'align' ? 'left' : key === 'header' ? 0 : false);
    for (const key of keys)
      if (samples.some((sample) => normalized(sample, key) !== normalized(samples[0], key)))
        mixed.add(key);
  }
  return { ...formats, align: formats.align ?? 'left', mixed: [...mixed], ...listState(root) };
};
export const applyFormat = (root: HTMLElement, name: string, value: unknown, schema?: DocumentSchema): void => {
  const range = activeRange(root);
  if (!range)
    return;
  const tag = inlineFormats[name];
  if (tag && !range.collapsed && applyLocalInline(root, range, tag, Boolean(value), schema))
    return;
  const selection = readTextSelection(root)!;
  if (name === 'list') {
    applyList(root, value);
    return;
  }
  if (name === 'indent') {
    indentList(root, value);
    return;
  }
  if (name === 'clear') {
    if (value !== true || !selection.length)
      return;
    let content = (schema?.parseHTML ?? parseHTML)(root.innerHTML);
    for (const tag of [...Object.values(inlineFormats), 'a', 'span'] as DocumentTag[])
      content = inlineDocument(content, selection.index, selection.index + selection.length, tag, false);
    root.innerHTML = (schema?.documentHTML ?? documentHTML)(content);
    selectText(root, selection.index, selection.length);
    return;
  }
  if (tag) {
    if (range.collapsed)
      return;
    root.innerHTML = (schema?.documentHTML ?? documentHTML)(inlineDocument((schema?.parseHTML ?? parseHTML)(root.innerHTML), selection.index, selection.index + selection.length, tag, Boolean(value)));
    selectText(root, selection.index, selection.length);
    return;
  }
  if (name === 'link') {
    applyLink(root, value, schema);
    return;
  }
  if (Object.hasOwn(inlineStyles, name)) {
    const style = normalizeInlineStyle(name, value);
    if (!selection.length)
      return;
    root.innerHTML = (schema?.documentHTML ?? documentHTML)(transformInlineAttributes((schema?.parseHTML ?? parseHTML)(root.innerHTML), selection.index, selection.index + selection.length, { kind: 'style', property: inlineStyles[name], value: style }));
    selectText(root, selection.index, selection.length);
    return;
  }
  let blocks = selectedBlocks(root, range, false);
  if (!blocks.length) {
    const paragraph = document.createElement('p');
    paragraph.append(range.extractContents());
    if (!paragraph.childNodes.length)
      paragraph.append(document.createElement('br'));
    range.insertNode(paragraph);
    blocks = [paragraph];
  }
  preserveRange(root, () => {
    for (const block of blocks) {
      if (name === 'align' && ['left', 'center', 'right', 'justify', false].includes(value as string | false)) {
        block.style.textAlign = value ? String(value) : '';
        continue;
      }
      const nextTag = name === 'header' ? (Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 6 ? `h${value}` : 'p')
        : name === 'blockquote' ? (value ? 'blockquote' : 'p')
          : name === 'code-block' ? (value ? 'pre' : 'p') : undefined;
      if (nextTag) {
        if (block.hasAttribute('data-mw-node') && block.localName !== nextTag)
          throw new RangeError('Cannot change the tag of a registered semantic node.');
        const replacement = document.createElement(nextTag);
        if (block.localName === 'li') {
          const content = [...block.childNodes].filter((node) => !(node instanceof Element && /^(ul|ol|p|h[1-6]|pre|blockquote)$/.test(node.localName)));
          replacement.append(...content);
          block.prepend(replacement);
        }
        else {
          replacement.append(...block.childNodes);
          replacement.setAttribute('style', block.getAttribute('style') ?? '');
          copyDirection(block, replacement);
          block.replaceWith(replacement);
        }
      }
    }
  });
};
