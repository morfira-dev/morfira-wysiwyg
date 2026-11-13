import type { DocumentNode, DocumentTag, EditorDocument, ElementNode } from './model.js';
import { documentHTML, parseHTML, validateDocument } from './model.js';
import { activeRange, readTextSelection, selectText } from './selection.js';

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
export const readFormats = (root: HTMLElement): Record<string, unknown> => {
  const range = activeRange(root);
  if (!range)
    return {};
  let element = closestElement(range.startContainer);
  const formats: Record<string, unknown> = {};
  while (element && element !== root) {
    for (const [name, tag] of Object.entries(inlineFormats))
      if (element.localName === tag)
        formats[name] = true;
    if (/^h[1-6]$/.test(element.localName))
      formats.header = Number(element.localName[1]);
    if (element.localName === 'blockquote')
      formats.blockquote = true;
    if (element.localName === 'pre')
      formats['code-block'] = true;
    if (element.localName === 'ul' || element.localName === 'ol')
      formats.list = element.localName === 'ul' ? 'bullet' : 'ordered';
    if (element.localName === 'a')
      formats.link = element.getAttribute('href');
    element = element.parentElement;
  }
  return formats;
};

export const applyFormat = (root: HTMLElement, name: string, value: unknown): void => {
  const range = activeRange(root);
  if (!range)
    return;
  const selection = readTextSelection(root)!;
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
  const candidates = [...root.querySelectorAll<HTMLElement>('p,h1,h2,h3,h4,h5,h6,blockquote,pre,li')];
  let blocks = candidates.filter((element) => {
    if (element.querySelector('p,h1,h2,h3,h4,h5,h6,blockquote,pre,li'))
      return false;
    if (range.collapsed)
      return element.contains(range.startContainer);
    return range.intersectsNode(element);
  });
  if (!blocks.length) {
    const paragraph = document.createElement('p');
    paragraph.append(range.extractContents());
    if (!paragraph.childNodes.length)
      paragraph.append(document.createElement('br'));
    range.insertNode(paragraph);
    blocks = [paragraph];
  }
  for (const block of blocks) {
    if (name === 'align' && ['left', 'center', 'right', 'justify', false].includes(value as string | false)) {
      block.style.textAlign = value ? String(value) : '';
      continue;
    }
    if (name === 'list') {
      if (!value && block.localName === 'li') {
        const list = block.parentElement!;
        const paragraph = document.createElement('p');
        paragraph.append(...block.childNodes);
        const trailing = list.cloneNode(false) as HTMLElement;
        while (block.nextSibling)
          trailing.append(block.nextSibling);
        block.remove();
        list.after(paragraph);
        if (trailing.childNodes.length)
          paragraph.after(trailing);
        if (!list.childNodes.length)
          list.remove();
      }
      else if (value === 'bullet' || value === 'ordered') {
        if (block.localName === 'li') {
          const parent = block.parentElement!;
          const replacement = document.createElement(value === 'bullet' ? 'ul' : 'ol');
          replacement.append(...parent.childNodes);
          parent.replaceWith(replacement);
        }
        else {
          const list = document.createElement(value === 'bullet' ? 'ul' : 'ol');
          const item = document.createElement('li');
          item.append(...block.childNodes);
          list.append(item);
          block.replaceWith(list);
        }
      }
      continue;
    }
    const nextTag = name === 'header' ? (Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 6 ? `h${value}` : 'p')
      : name === 'blockquote' ? (value ? 'blockquote' : 'p')
        : name === 'code-block' ? (value ? 'pre' : 'p') : undefined;
    if (nextTag) {
      const replacement = document.createElement(nextTag);
      replacement.append(...block.childNodes);
      block.replaceWith(replacement);
    }
  }
  selectText(root, selection.index, selection.length);
};
