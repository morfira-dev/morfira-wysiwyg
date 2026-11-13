import type { Editor } from '@morfira-dev/wysiwyg-core';
import type { SuggestionAnchor } from './types.js';
import type { Candidate, Kind, Leaf } from './engine.types.js';
const blocks = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'ul', 'ol', 'li', 'table', 'caption', 'colgroup', 'col', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'figure', 'figcaption']);
const barriers = new Set(['br', 'img', 'hr', 'a', 'code']);
const queryCharacter = /^[\p{L}\p{N}\p{M}\p{Pc}-]$/u;
const queryText = /^[\p{L}\p{N}\p{M}\p{Pc}-]*$/u;
const parent = (node: Node): Element | null => node.nodeType === 1 ? node as Element : node.parentElement;
const ancestor = (root: HTMLElement, node: Node, selector: string): HTMLElement | undefined => {
  let element = parent(node);
  while (element && element !== root) {
    if (element.matches(selector))
      return element as HTMLElement;
    element = element.parentElement;
  }
};
const boundary = (node: Node): boolean => node.nodeType === 1 && (blocks.has((node as Element).localName) || barriers.has((node as Element).localName));
const deepest = (node: Node, last: boolean): Node => {
  let visits = 0;
  while (!boundary(node) && (last ? node.lastChild : node.firstChild) && visits++ < 1024)
    node = (last ? node.lastChild : node.firstChild)!;
  return node;
};
const previous = (node: Node, root: Node): Node | undefined => {
  if (node === root)
    return;
  if (node.previousSibling)
    return deepest(node.previousSibling, true);
  return node.parentNode && node.parentNode !== root ? node.parentNode : undefined;
};
const following = (node: Node, root: Node): Node | undefined => {
  let visits = 0;
  while (node !== root && visits++ < 1024) {
    if (node.nextSibling)
      return deepest(node.nextSibling, false);
    if (!node.parentNode)
      return;
    node = node.parentNode;
  }
};
const nextCharacter = (block: HTMLElement, caret: Range): string | undefined => {
  let node: Node | undefined;
  if (caret.startContainer.nodeType === 3) {
    const next = (caret.startContainer as Text).data.slice(caret.startOffset, caret.startOffset + 2);
    if (next)
      return String.fromCodePoint(next.codePointAt(0)!);
    node = following(caret.startContainer, block);
  }
  else {
    const child = caret.startContainer.childNodes[caret.startOffset];
    node = child ? deepest(child, false) : following(caret.startContainer, block);
  }
  let visits = 0;
  while (node && visits++ < 2048) {
    if (boundary(node))
      return '';
    if (node.nodeType === 3 && node.textContent)
      return String.fromCodePoint(node.textContent.codePointAt(0)!);
    node = following(node, block);
  }
  return node ? undefined : '';
};
const liveCaret = (editor: Editor): Range | undefined => {
  const document = editor.surface.ownerDocument;
  const active = document.activeElement;
  if (active !== editor.surface && (!active || !editor.surface.contains(active)))
    return;
  const selection = document.getSelection();
  if (!selection?.rangeCount)
    return;
  const range = selection.getRangeAt(0);
  if (range.collapsed && editor.surface.contains(range.startContainer) && editor.surface.contains(range.endContainer))
    return range;
};
export const detect = (editor: Editor, kind: Kind, minimum: number): Candidate | undefined => {
  if (editor.isReadOnly())
    return;
  const caret = liveCaret(editor);
  if (!caret || ancestor(editor.surface, caret.startContainer, 'a,code,pre,figure,figcaption'))
    return;
  const block = ancestor(editor.surface, caret.startContainer, 'p,h1,h2,h3,h4,h5,h6,li,blockquote');
  if (!block)
    return;
  if (kind === 'slash' && (block.localName !== 'p' || ancestor(editor.surface, block, 'li,blockquote,pre,code,a,figure,figcaption')))
    return;
  const after = nextCharacter(block, caret);
  if (after === undefined || (after && queryCharacter.test(after)))
    return;
  const leaves: Leaf[] = [];
  let remaining = 103;
  let truncated = false;
  const add = (text: Text, to: number) => {
    const from = Math.max(0, to - remaining); if (to > from) {
      leaves.unshift({ node: text, from, to });
      remaining -= to - from;
    } if (from)
      truncated = true;
  };
  let node: Node | undefined;
  if (caret.startContainer.nodeType === 3) {
    add(caret.startContainer as Text, caret.startOffset);
    node = previous(caret.startContainer, block);
  }
  else {
    const child = caret.startContainer.childNodes[caret.startOffset - 1];
    node = child ? deepest(child, true) : previous(caret.startContainer, block);
  }
  let visits = 0;
  while (node && remaining && !truncated && visits++ < 2048) {
    if (boundary(node))
      break;
    if (node.nodeType === 3)
      add(node as Text, (node as Text).length);
    node = previous(node, block);
  }
  if ((!remaining && node) || visits >= 2048)
    truncated = true;
  const atStart = !node && !truncated;
  const prefix = leaves.map((leaf) => leaf.node.data.slice(leaf.from, leaf.to)).join('');
  const trigger = kind === 'mentions' ? '@' : '/';
  const from = prefix.lastIndexOf(trigger);
  if (from < 0)
    return;
  if (kind === 'slash' ? !atStart || from !== 0 : from === 0 ? truncated : !/[\s([{]/u.test(prefix[from - 1]))
    return;
  const query = prefix.slice(from + 1);
  if (query.length < minimum || query.length > 100 || !queryText.test(query))
    return;
  let skip = from;
  let first = 0;
  while (first < leaves.length && skip >= leaves[first].to - leaves[first].from) {
    skip -= leaves[first].to - leaves[first].from;
    first++;
  }
  if (!leaves[first])
    return;
  const relevant = leaves.slice(first);
  relevant[0] = { ...relevant[0], from: relevant[0].from + skip };
  const last = relevant.at(-1)!;
  return { query, text: trigger + query, block, leaves: relevant, start: { node: relevant[0].node, offset: relevant[0].from }, end: { node: last.node, offset: last.to } };
};
export const same = (a: Candidate | undefined, b: Candidate | undefined): boolean => !!a && !!b && a.query === b.query && a.block === b.block && a.start.node === b.start.node && a.start.offset === b.start.offset && a.end.node === b.end.node && a.end.offset === b.end.offset;
const rangeFor = (editor: Editor, candidate: Candidate): Range => {
  const range = editor.surface.ownerDocument.createRange();
  range.setStart(candidate.start.node, candidate.start.offset);
  range.setEnd(candidate.end.node, candidate.end.offset);
  return range;
};
export const anchorFor = (editor: Editor, candidate: Candidate): SuggestionAnchor | undefined => {
  if (!editor.surface.contains(candidate.start.node) || !editor.surface.contains(candidate.end.node))
    return;
  const range = rangeFor(editor, candidate);
  const caret = range.cloneRange();
  caret.collapse(false);
  let rect = caret.getBoundingClientRect();
  let x = rect.left;
  if (!rect.height) {
    const rects = range.getClientRects();
    if (!rects.length)
      return;
    rect = rects[rects.length - 1];
    x = rect.right;
  }
  if (!rect.height || ![x, rect.top, rect.height].every(Number.isFinite))
    return;
  return { x, y: rect.top, width: 0, height: rect.height };
};
export const insertText = (editor: Editor, candidate: Candidate, text: string) => {
  const leaves = candidate.leaves;
  const first = leaves[0];
  const last = leaves.at(-1)!;
  if (first.node === last.node)
    first.node.replaceData(first.from, first.to - first.from, text);
  else {
    first.node.data = first.node.data.slice(0, first.from) + text;
    for (const leaf of leaves.slice(1, -1))
      leaf.node.data = '';
    last.node.data = last.node.data.slice(last.to);
  }
  const caret = editor.surface.ownerDocument.createRange();
  caret.setStart(first.node, first.from + text.length);
  caret.collapse(true);
  candidate.block.normalize();
  // Empty contenteditable blocks need a real caret host in Chromium/WebKit, including after history replay.
  if (!candidate.block.textContent && !candidate.block.querySelector('br,img,hr')) {
    const placeholder = editor.surface.ownerDocument.createElement('br');
    candidate.block.append(placeholder);
    caret.setStartBefore(placeholder);
    caret.collapse(true);
  }
  const selection = editor.surface.ownerDocument.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(caret);
};
