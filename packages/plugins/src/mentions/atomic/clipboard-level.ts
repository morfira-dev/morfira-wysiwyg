import type { DocumentNode, Editor, EditorDocument, ElementNode } from '@morfira-dev/wysiwyg-core';
import type { MentionClipboardData } from '../types.js';
import { clipboardListItem, clipboardListSelection } from './clipboard-list-source.js';
import { clipboardListText, normalizeClipboardList } from './clipboard-list-data.js';
import { editListClipboardSelection } from './clipboard-list-edit.js';
import { atomicFlow, setAtomicSelection, validAtomicMention } from './selection.js';
import type { AtomicClipboardLevelSelection, AtomicClipboardSnapshot } from './types.js';

const namespace = 'http://www.w3.org/1999/xhtml';
const tags = new Set(['ul', 'ol', 'li', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'strong', 'em', 'u', 's', 'sub', 'sup', 'br']);
const elementAt = (node: Node): Element | null => node.nodeType === 1 ? node as Element : node.parentElement;

/** A structural interval retains endpoint paths instead of joining different levels. */
export const clipboardLevelSelection = (editor: Editor, range: Range): AtomicClipboardLevelSelection | undefined => {
  if (range.collapsed) return;
  if ([range.startContainer, range.endContainer].some((node) => node.nodeType === 1
    && ['ul', 'ol'].includes((node as Element).localName))) return;
  const root = editor.surface;
  const firstItem = elementAt(range.startContainer)?.closest('li');
  const lastItem = elementAt(range.endContainer)?.closest('li');
  if (!firstItem || !lastItem || firstItem.parentElement === lastItem.parentElement
    || !root.contains(firstItem) || !root.contains(lastItem)
    || !atomicFlow(root, range.startContainer) || !atomicFlow(root, range.endContainer)) return;
  const first = clipboardListItem(root, firstItem);
  const last = clipboardListItem(root, lastItem);
  const firstBody = first?.bodies.find((body) => body === range.startContainer || body.contains(range.startContainer));
  const lastBody = last?.bodies.find((body) => body === range.endContainer || body.contains(range.endContainer));
  if (!first || !last || !firstBody || !lastBody) return;
  if ((first.direct && range.startContainer === firstItem && first.branches.length
    && range.startOffset > [...firstItem.childNodes].indexOf(first.branches[0]))
    || (last.direct && range.endContainer === lastItem && last.branches.length
      && range.endOffset > [...lastItem.childNodes].indexOf(last.branches[0]))) return;
  const ancestors = (item: Element): HTMLElement[] => {
    const result: HTMLElement[] = [];
    for (let node: Element | null = item.parentElement; node && node !== root; node = node.parentElement)
      if (['ul', 'ol'].includes(node.localName)) result.push(node as HTMLElement);
    return result;
  };
  const lastLists = new Set(ancestors(lastItem));
  const list = ancestors(firstItem).find((candidate) => lastLists.has(candidate));
  if (!list) return;
  const paths: HTMLElement[] = [];
  for (const endpoint of [range.startContainer, range.endContainer]) {
    for (let node = elementAt(endpoint); node && root.contains(node); node = node.parentElement) {
      if (node.namespaceURI !== namespace || (node.hasAttribute('data-mw-node') && !validAtomicMention(root, node))) return;
      if (node.localName === 'li' && !clipboardListItem(root, node)) return;
      paths.push(node as HTMLElement);
      if (node === list) break;
    }
  }
  let count = 0;
  let length = 0;
  const read = (node: Node, depth: number): DocumentNode[] => {
    if (!range.intersectsNode(node)) return [];
    if (++count > 100_000 || depth > 100) throw new RangeError('Mention interval exceeds document limits.');
    if (node.nodeType === 3) {
      const text = (node.textContent ?? '').slice(node === range.startContainer ? range.startOffset : 0,
        node === range.endContainer ? range.endOffset : undefined);
      length += text.length;
      if (length > 5_000_000) throw new RangeError('Mention interval exceeds document limits.');
      return text ? [{ type: 'text', text }] : [];
    }
    if (node.nodeType !== 1) throw new TypeError('Unsupported mention interval node.');
    const element = node as Element;
    if (element.namespaceURI !== namespace || !tags.has(element.localName)
      || element.hasAttribute('data-checklist-checked')
      || (element.hasAttribute('data-mw-node') && !validAtomicMention(root, element))
      || (element.localName === 'li' && !clipboardListItem(root, element)))
      throw new TypeError('Unsupported mention interval content.');
    length += element.localName.length * 2 + 5;
    for (const attribute of element.attributes) length += attribute.name.length + attribute.value.length + 4;
    if (length > 5_000_000) throw new RangeError('Mention interval exceeds document limits.');
    const children = [...node.childNodes].flatMap((child) => read(child, depth + 1));
    return [{ type: 'element', tag: element.localName as ElementNode['tag'],
      attributes: Object.fromEntries([...element.attributes].map(({ name, value }) => [name, value])), children }];
  };
  try {
    const normalized = normalizeClipboardList({ version: 1, children: read(list, 0) });
    if (!normalized) return;
    return { list, firstBody, lastBody, paths: [...new Set(paths)], document: editor.schema.validateDocument(normalized) };
  }
  catch { return; }
};

export const sameClipboardLevel = (a: AtomicClipboardLevelSelection | undefined, b: AtomicClipboardLevelSelection | undefined): boolean => {
  if (!a || !b) return a === b;
  return a.list === b.list && a.firstBody === b.firstBody && a.lastBody === b.lastBody
    && a.paths.length === b.paths.length && a.paths.every((node, index) => node === b.paths[index]);
};

export const copyLevelClipboard = (editor: Editor, selected: AtomicClipboardLevelSelection): MentionClipboardData => ({
  html: editor.schema.documentHTML(selected.document),
  text: clipboardListText(selected.document.children[0] as ElementNode),
});

/** Repair only original endpoint paths, preserving unrelated actual subtrees. */
const repair = (root: HTMLElement, selected: AtomicClipboardLevelSelection): void => {
  for (const node of selected.paths) {
    if (!root.contains(node)) continue;
    if (/^(p|h[1-6])$/.test(node.localName) && !node.textContent && !node.querySelector('br'))
      node.append(node.ownerDocument.createElement('br'));
    else if (node.localName === 'li') {
      const profile = clipboardListItem(root, node);
      if (!profile || !profile.direct) continue;
      const branches = new Set<Node>(profile.branches);
      const own = [...node.childNodes].filter((child) => !branches.has(child));
      const editable = own.some((child) => Boolean(child.textContent) || (child.nodeType === 1
        && ((child as Element).localName === 'br' || (child as Element).querySelector('br'))));
      if (!editable) node.insertBefore(node.ownerDocument.createElement('br'), profile.branches[0] ?? null);
    }
    else if (node !== selected.list && ['ul', 'ol'].includes(node.localName) && !node.children.length) node.remove();
  }
};

export const editLevelClipboardSelection = (editor: Editor, plan: AtomicClipboardSnapshot, value?: EditorDocument): boolean => {
  const selected = plan.level;
  if (!selected) return false;
  const caret = plan.range.cloneRange();
  caret.collapse(true);
  plan.range.cloneRange().deleteContents();
  // Native deletion may retain an empty endpoint Text. Removing only these
  // empty own-flow leaves lets the existing composer recognize a lone BR as
  // its placeholder; live ranges retarget the same parent boundary. Never
  // normalize or traverse opaque unselected branch contents or atomic labels.
  const removeEmptyText = (body: HTMLElement): void => {
    for (const child of [...body.childNodes]) {
      if (child.nodeType === 3 && !child.textContent) child.remove();
      else if (child.nodeType === 1) {
        const element = child as HTMLElement;
        if (!element.hasAttribute('data-mw-node') && !['ul', 'ol', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(element.localName))
          removeEmptyText(element);
      }
    }
  };
  for (const body of new Set([selected.firstBody, selected.lastBody]))
    if (editor.surface.contains(body)) removeEmptyText(body);
  repair(editor.surface, selected);
  const native = editor.surface.ownerDocument.getSelection();
  if (native) setAtomicSelection(native, caret);
  if (!value) return true;
  const list = clipboardListSelection(editor.surface, caret);
  if (!list || list.items.length !== 1) throw new TypeError('Unsupported retained mention interval caret.');
  const body = list.firstBody;
  return editListClipboardSelection(editor, { ...plan, level: undefined, list,
    flow: body, leaves: [body], parent: body.parentElement, range: caret.cloneRange() }, value);
};
