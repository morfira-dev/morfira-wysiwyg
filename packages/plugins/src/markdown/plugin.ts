import type { MarkdownShortcutOptions, MarkdownShortcutState, MarkdownCommands, Leaf, Flow, InlineRule, InlineMatch } from './types.js';

import type { Editor, EditorPlugin } from '@morfira-dev/wysiwyg-core';
const flowBlocks = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'ul', 'ol', 'li', 'table', 'caption', 'colgroup', 'col', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'figure', 'figcaption']);
const barriers = new Set(['br', 'img', 'hr', 'a', 'code']);
const blockSelector = [...flowBlocks].join(',');
const inlineRules: InlineRule[] = [
  { marker: '**', tag: 'strong', format: 'bold' }, { marker: '__', tag: 'strong', format: 'bold' },
  { marker: '~~', tag: 's', format: 'strike' }, { marker: '*', tag: 'em', format: 'italic' },
  { marker: '_', tag: 'em', format: 'italic' }, { marker: '`', tag: 'code', format: 'code' },
];
const word = /[\p{L}\p{N}\p{M}\p{Pc}]/u;
const MAX_BODY = 2000;
const MAX_PREFIX = MAX_BODY + 16;
const elementFor = (node: Node): Element | null => node.nodeType === 1 ? node as Element : node.parentElement;
const withinAncestor = (root: HTMLElement, node: Node, selector: string): Element | undefined => {
  let element = elementFor(node);
  while (element && element !== root) {
    if (element.matches(selector))
      return element;
    element = element.parentElement;
  }
};
const nativeRange = (editor: Editor): Range | undefined => {
  const selection = editor.surface.ownerDocument.getSelection();
  if (!selection?.rangeCount)
    return;
  const range = selection.getRangeAt(0);
  if (range.collapsed && editor.surface.contains(range.startContainer) && editor.surface.contains(range.endContainer))
    return range.cloneRange();
};
const boundary = (node: Node) => node.nodeType === 1 && (flowBlocks.has((node as Element).localName) || barriers.has((node as Element).localName));
const deepest = (node: Node, last: boolean): Node => {
  while (!boundary(node) && (last ? node.lastChild : node.firstChild))
    node = (last ? node.lastChild : node.firstChild)!;
  return node;
};
const previous = (node: Node, root: HTMLElement): Node | undefined => {
  if (node === root)
    return;
  if (node.previousSibling)
    return deepest(node.previousSibling, true);
  return node.parentNode && node.parentNode !== root ? node.parentNode : undefined;
};
const following = (node: Node, root: HTMLElement): Node | undefined => {
  while (node !== root) {
    if (node.nextSibling)
      return deepest(node.nextSibling, false);
    if (!node.parentNode)
      return;
    node = node.parentNode;
  }
};
const afterCaret = (block: HTMLElement, caret: Range): string => {
  let node: Node | undefined;
  if (caret.startContainer.nodeType === 3) {
    const text = (caret.startContainer as Text).data.slice(caret.startOffset, caret.startOffset + 2);
    if (text)
      return String.fromCodePoint(text.codePointAt(0)!);
    node = following(caret.startContainer, block);
  }
  else {
    const child = caret.startContainer.childNodes[caret.startOffset];
    node = child ? deepest(child, false) : following(caret.startContainer, block);
  }
  while (node) {
    if (boundary(node))
      return '';
    if (node.nodeType === 3 && node.textContent)
      return String.fromCodePoint(node.textContent.codePointAt(0)!);
    node = following(node, block);
  }
  return '';
};
/** Collect only the bounded suffix of the current text flow, never the whole editor. */
const flowBefore = (block: HTMLElement, caret: Range, maximum = MAX_PREFIX): Flow => {
  const leaves: Leaf[] = [];
  let remaining = maximum;
  let truncated = false;
  let atStart = false;
  const add = (node: Text, end: number) => {
    const from = Math.max(0, end - remaining);
    if (end > from) {
      leaves.unshift({ node, from, to: end });
      remaining -= end - from;
    }
    if (from)
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
  while (node && remaining && !truncated) {
    if (boundary(node))
      break;
    if (node.nodeType === 3)
      add(node as Text, (node as Text).length);
    node = previous(node, block);
  }
  if (!node && !truncated)
    atStart = true;
  if (!remaining && node)
    truncated = true;
  return { text: leaves.map((leaf) => leaf.node.data.slice(leaf.from, leaf.to)).join(''), leaves, truncated, atStart, after: afterCaret(block, caret) };
};
const point = (flow: Flow, index: number, end: boolean): [
  Node,
  number
] => {
  for (const leaf of flow.leaves) {
    const length = leaf.to - leaf.from;
    if (index < length || (end && index <= length))
      return [leaf.node, leaf.from + index];
    index -= length;
  }
  const last = flow.leaves.at(-1)!;
  return [last.node, last.to];
};
const textRange = (document: Document, flow: Flow, start: number, end: number): Range => {
  const range = document.createRange();
  range.setStart(...point(flow, start, false));
  range.setEnd(...point(flow, end, true));
  return range;
};
const beforeCharacter = (text: string, index: number): string => {
  const last = text.charCodeAt(index - 1);
  const prior = text.charCodeAt(index - 2);
  return last >= 0xdc00 && last <= 0xdfff && prior >= 0xd800 && prior <= 0xdbff ? text.slice(index - 2, index) : text.slice(index - 1, index);
};
const escaped = (text: string, index: number, truncated: boolean): boolean => {
  let start = index;
  while (start > 0 && text[start - 1] === '\\')
    start--;
  return (index - start) % 2 === 1 || (truncated && start === 0);
};
const unmatchedBacktick = (text: string): boolean => {
  let open = false;
  let slashes = 0;
  for (const character of text) {
    if (character === '`' && slashes % 2 === 0)
      open = !open;
    slashes = character === '\\' ? slashes + 1 : 0;
  }
  return open;
};
const inlineMatch = (flow: Flow, trigger: string): InlineMatch | undefined => {
  const candidate = flow.text + trigger;
  for (const rule of inlineRules) {
    const { marker } = rule;
    if (!candidate.endsWith(marker) || (marker !== '`' && unmatchedBacktick(flow.text)))
      continue;
    const close = candidate.length - marker.length;
    const start = candidate.lastIndexOf(marker, close - marker.length);
    if (start < 0 || (start === 0 && flow.truncated))
      continue;
    const bodyStart = start + marker.length;
    const body = candidate.slice(bodyStart, close);
    if (!body || body.length > MAX_BODY || body.trim() !== body || /[\r\n\u2028\u2029]/.test(body) || body.includes(marker[0]))
      continue;
    if (candidate[start - 1] === marker[0] || flow.after === marker[0] || escaped(candidate, start, flow.truncated))
      continue;
    if (start && word.test(beforeCharacter(candidate, start)))
      continue;
    if (marker[0] === '_' && word.test(flow.after))
      continue;
    return { rule, start, bodyStart, bodyEnd: close };
  }
};
const useRange = (root: HTMLElement, range: Range) => {
  const selection = root.ownerDocument.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
};
const caretAtStart = (root: HTMLElement, block: HTMLElement) => {
  if (!block.textContent && !block.querySelector('br,img,hr'))
    block.append(root.ownerDocument.createElement('br'));
  const range = root.ownerDocument.createRange();
  range.selectNodeContents(block);
  range.collapse(true);
  useRange(root, range);
};
const copyAttributes = (source: HTMLElement, target: HTMLElement) => {
  for (const name of ['style', 'title']) {
    const value = source.getAttribute(name);
    if (value !== null)
      target.setAttribute(name, value);
  }
};
const blockRule = (prefix: string): string | undefined => {
  if (/^#{1,6}$/.test(prefix))
    return `h${prefix.length}`;
  if (prefix === '>')
    return 'blockquote';
  if (['-', '*', '+'].includes(prefix))
    return 'ul';
  if (['1.', '1)'].includes(prefix))
    return 'ol';
  if (prefix === '```')
    return 'pre';
  if (['---', '***', '___'].includes(prefix))
    return 'hr';
};
const convertBlock = (editor: Editor, block: HTMLElement, caret: Range, tag: string) => {
  editor.transact(() => {
    const prefix = block.ownerDocument.createRange();
    prefix.setStart(block, 0);
    prefix.setEnd(caret.startContainer, caret.startOffset);
    prefix.deleteContents();
    if (tag === 'hr') {
      block.before(block.ownerDocument.createElement('hr'));
      block.normalize();
      caretAtStart(editor.surface, block);
      return;
    }
    const replacement = block.ownerDocument.createElement(tag);
    let typing = replacement;
    if (tag === 'ul' || tag === 'ol') {
      typing = block.ownerDocument.createElement('li');
      replacement.append(typing);
    }
    copyAttributes(block, typing);
    typing.append(...block.childNodes);
    block.replaceWith(replacement);
    typing.normalize();
    caretAtStart(editor.surface, typing);
  });
};
const convertInline = (editor: Editor, block: HTMLElement, flow: Flow, match: InlineMatch) => {
  const { rule, start, bodyStart, bodyEnd } = match;
  const document = block.ownerDocument;
  const body = textRange(document, flow, bodyStart, bodyEnd);
  const closing = textRange(document, flow, bodyEnd, flow.text.length);
  const opening = textRange(document, flow, start, bodyStart);
  let wrapper: HTMLElement | undefined;
  let placed: Range | undefined;
  editor.transact(() => {
    closing.deleteContents();
    opening.deleteContents();
    wrapper = document.createElement(rule.tag);
    wrapper.append(body.extractContents());
    body.insertNode(wrapper);
    block.normalize();
    placed = document.createRange();
    placed.setStartAfter(wrapper);
    placed.collapse(true);
    useRange(editor.surface, placed);
  });
  const current = nativeRange(editor);
  if (wrapper && editor.surface.contains(wrapper) && placed && current?.startContainer === placed.startContainer && current.startOffset === placed.startOffset)
    editor.format(rule.format, false);
};
export const markdownShortcuts = (options: MarkdownShortcutOptions = {}): EditorPlugin => {
  if (!options || typeof options !== 'object' || Array.isArray(options))
    throw new TypeError('Expected Markdown shortcut options.');
  for (const key of ['enabled', 'blocks', 'inline'] as const)
    if (options[key] !== undefined && typeof options[key] !== 'boolean')
      throw new TypeError(`${key} must be boolean.`);
  const defaults = { enabled: options.enabled ?? true, blocks: options.blocks ?? true, inline: options.inline ?? true };
  return {
    name: 'markdown-shortcuts', setup: (editor) => {
      let state = { ...defaults };
      let disposed = false;
      let composing = false;
      const active = () => {
        if (disposed)
          throw new Error('Markdown shortcuts plugin has been disposed.');
      };
      const api: MarkdownCommands = {
        getState: () => { active(); return { ...state }; },
        setEnabled: (enabled) => {
          active(); if (typeof enabled !== 'boolean')
            throw new TypeError('enabled must be boolean.'); state = { ...state, enabled };
        },
      };
      const unprovide = editor.providePlugin('markdown-shortcuts', api);
      const beforeinput = (event: InputEvent) => {
        if (disposed || event.defaultPrevented || !state.enabled || editor.isReadOnly() || composing || event.isComposing)
          return;
        const text = event.inputType === 'insertText' && event.data?.length === 1 ? event.data : undefined;
        const enter = event.inputType === 'insertParagraph';
        if ((!text || ![' ', '*', '_', '~', '`'].includes(text)) && !enter)
          return;
        const caret = nativeRange(editor);
        if (!caret)
          return;
        if (withinAncestor(editor.surface, caret.startContainer, 'pre,code,a,figure,figcaption'))
          return;
        const block = withinAncestor(editor.surface, caret.startContainer, 'p,h1,h2,h3,h4,h5,h6,li,blockquote') as HTMLElement | undefined;
        if (!block)
          return;
        if (state.blocks && block.localName === 'p' && !withinAncestor(editor.surface, block, 'li,blockquote,pre,code,a,figure,figcaption') && !block.querySelector(blockSelector) && (text === ' ' || enter)) {
          const prefix = flowBefore(block, caret, 8);
          const tag = prefix.atStart && !prefix.truncated ? blockRule(prefix.text) : undefined;
          const whole = block.textContent === prefix.text && !block.querySelector('img,hr') && block.querySelectorAll('br').length <= 1;
          if (tag && (!enter || (['pre', 'hr'].includes(tag) && whole))) {
            event.preventDefault();
            event.stopImmediatePropagation();
            convertBlock(editor, block, caret, tag);
            return;
          }
        }
        if (!state.inline || !text || text === ' ' || enter)
          return;
        const flow = flowBefore(block, caret);
        const match = inlineMatch(flow, text);
        if (!match || withinAncestor(editor.surface, caret.startContainer, match.rule.tag))
          return;
        const body = textRange(block.ownerDocument, flow, match.bodyStart, match.bodyEnd).cloneContents();
        if (body.querySelector(`${blockSelector},br,img,hr,a,code`))
          return;
        event.preventDefault();
        event.stopImmediatePropagation();
        convertInline(editor, block, flow, match);
      };
      const compositionstart = () => { composing = true; };
      const compositionend = () => { composing = false; };
      editor.surface.addEventListener('beforeinput', beforeinput, true);
      editor.surface.addEventListener('compositionstart', compositionstart, true);
      editor.surface.addEventListener('compositionend', compositionend, true);
      return () => { disposed = true; unprovide(); editor.surface.removeEventListener('beforeinput', beforeinput, true); editor.surface.removeEventListener('compositionstart', compositionstart, true); editor.surface.removeEventListener('compositionend', compositionend, true); };
    }
  };
};
export const markdownCommands = (editor: Editor): MarkdownCommands => {
  const api = editor.getPlugin<MarkdownCommands>('markdown-shortcuts');
  if (!api)
    throw new Error('Install the Markdown shortcuts plugin first.');
  return api;
};
