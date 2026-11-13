import type { DocumentNode, DocumentTag, EditorDocument, ElementNode } from './model.js';
import { documentHTML, parseHTML, validateDocument } from './model.js';
import { activeRange, readTextSelection, selectText, preserveRange } from './selection.js';

import { applyList, indentList, listState, selectedBlocks } from './lists.js';

export const inlineFormats: Record<string, DocumentTag> = { bold: 'strong', italic: 'em', underline: 'u', strike: 's', code: 'code', subscript: 'sub', superscript: 'sup' };
const blockTags = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup']);
interface Piece { node: DocumentNode; selected: boolean; }

const inlineDocument = (value: EditorDocument, from: number, to: number, tag: DocumentTag, enabled: boolean): EditorDocument => {
  let position = 0;
  const visit = (node: DocumentNode, inherited: boolean): Piece[] => {
    if (node.type === 'text') {
      const start = position;
      position += node.text.length;
      const left = Math.max(0, Math.min(node.text.length, from - start));
      const right = Math.max(left, Math.min(node.text.length, to - start));
      return [[0, left, false], [left, right, true], [right, node.text.length, false]].flatMap(([begin, end, selected]) => {
        const text = node.text.slice(begin as number, end as number);
        if (!text)
          return [];
        const leaf: DocumentNode = { type: 'text', text };
        return [{ node: selected && enabled && !inherited ? { type: 'element', tag, attributes: {}, children: [leaf] } as ElementNode : leaf, selected: Boolean(selected) }];
      });
    }
    const children = node.children.flatMap((child) => visit(child, inherited || (enabled && node.tag === tag)));
    if (blockTags.has(node.tag))
      return [{ node: { ...node, children: children.map((piece) => piece.node) }, selected: false }];
    if (!children.length)
      return [{ node, selected: false }];
    const groups: {
      selected: boolean;
      children: DocumentNode[];
    }[] = [];
    for (const piece of children) {
      const last = groups.at(-1);
      if (last?.selected === piece.selected)
        last.children.push(piece.node);
      else
        groups.push({ selected: piece.selected, children: [piece.node] });
    }
    return groups.flatMap<Piece>((group) => node.tag === tag && !enabled && group.selected
      ? group.children.map((child) => ({ node: child, selected: true }))
      : [{ node: { ...node, children: group.children }, selected: group.selected }]);
  };
  return { version: 1, children: value.children.flatMap((node) => visit(node, false)).map((piece) => piece.node) };
};

const closestElement = (node: Node): Element | null => { return node.nodeType === 1 ? node as Element : node.parentElement; };
const formatsAt = (root: HTMLElement, node: Node): Record<string, unknown> => {
  let element = closestElement(node);
  const formats: Record<string, unknown> = {};
  while (element && element !== root) {
    for (const [name, tag] of Object.entries(inlineFormats)) if (element.localName === tag) formats[name] = true;
    if (/^h[1-6]$/.test(element.localName) && formats.header === undefined) formats.header = Number(element.localName[1]);
    if (element.localName === 'blockquote') formats.blockquote = true;
    if (element.localName === 'pre') formats['code-block'] = true;
    if ((element.localName === 'ul' || element.localName === 'ol') && formats.list === undefined) formats.list = element.localName === 'ul' ? 'bullet' : 'ordered';
    if (element.localName === 'a' && formats.link === undefined) formats.link = element.getAttribute('href');
    if (element instanceof HTMLElement && element.style.textAlign && formats.align === undefined) formats.align = element.style.textAlign;
    element = element.parentElement;
  }
  return formats;
};
export const readFormats = (root: HTMLElement): Record<string, unknown> => {
  const range = activeRange(root); if (!range) return {};
  let formats = formatsAt(root, range.startContainer);
  const mixed = new Set<string>();
  if (!range.collapsed) {
    const { index, length } = readTextSelection(root)!;
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT); let position = 0; let node: Node | null;
    const samples: Record<string, unknown>[] = [];
    while ((node = walker.nextNode())) {
      const end = position + node.textContent!.length;
      if (end > index && position < index + length) samples.push(formatsAt(root, node));
      position = end;
    }
    if (samples.length) formats = samples[0];
    const keys = [...Object.keys(inlineFormats), 'header', 'list', 'blockquote', 'code-block', 'link', 'align'];
    const normalized = (sample: Record<string, unknown>, key: string) => sample[key] ?? (key === 'align' ? 'left' : key === 'header' ? 0 : false);
    for (const key of keys) if (samples.some((sample) => normalized(sample, key) !== normalized(samples[0], key))) mixed.add(key);
  }
  return { ...formats, align: formats.align ?? 'left', mixed: [...mixed], ...listState(root) };
};

export const applyFormat = (root: HTMLElement, name: string, value: unknown): void => {
  const range = activeRange(root);
  if (!range)
    return;
  const selection = readTextSelection(root)!;
  if (name === 'list') { applyList(root, value); return; }
  if (name === 'indent') { indentList(root, value); return; }
  if (name === 'clear') {
    if (value !== true || !selection.length) return;
    let content = parseHTML(root.innerHTML);
    for (const tag of [...Object.values(inlineFormats), 'a', 'span'] as DocumentTag[]) content = inlineDocument(content, selection.index, selection.index + selection.length, tag, false);
    root.innerHTML = documentHTML(content); selectText(root, selection.index, selection.length); return;
  }
  const tag = inlineFormats[name];
  if (tag) {
    if (range.collapsed) return;
    root.innerHTML = documentHTML(inlineDocument(parseHTML(root.innerHTML), selection.index, selection.index + selection.length, tag, Boolean(value)));
    selectText(root, selection.index, selection.length);
    return;
  }
  if (name === 'link') {
    if (!value) {
      const link = closestElement(range.startContainer)?.closest('a');
      if (link && root.contains(link))
        link.replaceWith(...link.childNodes);
    }
    else if (typeof value === 'string' && !range.collapsed) {
      const template = parseHTML(`<a></a>`);
      const link = template.children[0] as ElementNode;
      link.attributes.href = value;
      // Use the shared validator instead of assigning an unchecked URL to the live document.
      const holder = document.createElement('div');
      holder.innerHTML = documentHTML(validateDocument({ version: 1, children: [link] }));
      const clean = parseHTML(holder.innerHTML).children[0] as ElementNode;
      if (!clean.attributes.href)
        return;
      const element = document.createElement('a');
      element.setAttribute('href', clean.attributes.href);
      element.append(range.extractContents());
      range.insertNode(element);
      range.selectNodeContents(element);
      const native = document.getSelection();
      native?.removeAllRanges();
      native?.addRange(range);
    }
    return;
  }
  let blocks = selectedBlocks(root, range, false);
  if (!blocks.length) {
    const paragraph = document.createElement('p'); paragraph.append(range.extractContents());
    if (!paragraph.childNodes.length) paragraph.append(document.createElement('br'));
    range.insertNode(paragraph); blocks = [paragraph];
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
      const replacement = document.createElement(nextTag);
      if (block.localName === 'li') {
        const content = [...block.childNodes].filter((node) => !(node instanceof Element && /^(ul|ol|p|h[1-6]|pre|blockquote)$/.test(node.localName)));
        replacement.append(...content);
        block.prepend(replacement);
      } else { replacement.append(...block.childNodes); replacement.setAttribute('style', block.getAttribute('style') ?? ''); block.replaceWith(replacement); }

    }
  }
  });
};
