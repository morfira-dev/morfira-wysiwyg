import type { Editor, EditorPlugin } from '@morfira-dev/wysiwyg-core';
import type { AutolinkCandidate, AutolinkCommands, AutolinkFlow, AutolinkOptions } from './types.js';

const maximumURL = 2048;
const maximumPrefix = maximumURL + 2;
const blockSelector = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,td,th';
const inlineSemantic = '[data-mw-node]:is(span,strong,em,u,s,sub,sup,code)';
const excluded = `a,pre,code,figure,figcaption,${inlineSemantic}`;
const barriers = /^(?:p|h[1-6]|li|blockquote|ul|ol|table|thead|tbody|tfoot|tr|td|th|caption|colgroup|col|figure|figcaption|pre|a|code|img|br|hr)$/;
const blocked = (node: Node): boolean => node.nodeType === 1 && (barriers.test((node as Element).localName) || (node as Element).matches(inlineSemantic));
const prior = (node: Node, block: HTMLElement): Node | undefined => {
  let current = node;
  while (current !== block) {
    if (current.previousSibling) {
      current = current.previousSibling;
      while (current.lastChild && !blocked(current)) current = current.lastChild;
      return current;
    }
    if (!current.parentNode) return;
    current = current.parentNode;
  }
};

/** Read only the suffix adjacent to the caret, including rich-text leaves. */
const prefixAt = (block: HTMLElement, caret: Range): AutolinkFlow => {
  const parts: string[] = [];
  let remaining = maximumPrefix;
  let truncated = false;
  const add = (node: Text, end: number) => {
    const start = Math.max(0, end - remaining);
    parts.unshift(node.data.slice(start, end));
    remaining -= end - start;
    if (start > 0) truncated = true;
  };
  let node: Node | undefined;
  if (caret.startContainer.nodeType === 3) {
    add(caret.startContainer as Text, caret.startOffset);
    node = prior(caret.startContainer, block);
  }
  else {
    const child = caret.startContainer.childNodes[caret.startOffset - 1];
    node = child;
    while (node?.lastChild && !blocked(node)) node = node.lastChild;
    if (!node) node = prior(caret.startContainer, block);
  }
  while (node && remaining > 0 && !truncated && !blocked(node)) {
    if (node.nodeType === 3) add(node as Text, (node as Text).length);
    node = prior(node, block);
  }
  if (node && remaining === 0) truncated = true;
  return { text: parts.join(''), truncated };
};

const trimPunctuation = (input: string): string => {
  let value = input;
  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  while (value) {
    const last = value.at(-1)!;
    if (/[.,!?;:]/.test(last)) {
      value = value.slice(0, -1);
      continue;
    }
    const opener = pairs[last];
    if (!opener) break;
    let balance = 0;
    for (const character of value) {
      if (character === opener) balance++;
      else if (character === last) balance--;
    }
    if (balance >= 0) break;
    value = value.slice(0, -1);
  }
  return value;
};

const candidateAt = (flow: AutolinkFlow): AutolinkCandidate | undefined => {
  if (!/[ \u00a0]$/.test(flow.text)) return;
  const prefix = flow.text.slice(0, -1);
  const match = /(?:^|[\s(\[{])((?:https?:\/\/|www\.)[^\s<>"']+)$/i.exec(prefix);
  if (!match) return;
  const start = match.index + match[0].length - match[1].length;
  if (flow.truncated && start === 0) return;
  const label = trimPunctuation(match[1]);
  if (!label || label.length > maximumURL) return;
  const href = /^www\./i.test(label) ? `https://${label}` : label;
  try {
    const parsed = new URL(href);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) return;
  }
  catch { return; }
  return { start, length: label.length, href };
};

const checkedOptions = (options: AutolinkOptions): boolean => {
  if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some((key) => key !== 'enabled'))
    throw new TypeError('Expected autolink options.');
  if (options.enabled !== undefined && typeof options.enabled !== 'boolean') throw new TypeError('Autolink enabled must be boolean.');
  return options.enabled ?? true;
};

export const autolink = (options: AutolinkOptions = {}): EditorPlugin => {
  const initiallyEnabled = checkedOptions(options);
  return {
    name: 'autolink',
    setup: (editor) => {
      const root = editor.surface;
      let enabled = initiallyEnabled;
      let composing = false;
      let disposed = false;
      const assertActive = () => {
        if (disposed) throw new Error('Autolink has been disposed.');
      };
      const commands: AutolinkCommands = {
        getState: () => { assertActive(); return { enabled }; },
        setEnabled: (value) => {
          assertActive();
          if (typeof value !== 'boolean') throw new TypeError('Autolink enabled must be boolean.');
          enabled = value;
        },
      };
      const input = (event: Event) => {
        const native = event as InputEvent;
        if (disposed || !enabled || composing || native.isComposing || native.inputType !== 'insertText' || native.data !== ' ' || editor.isReadOnly()) return;
        const selection = root.ownerDocument.getSelection();
        if (!selection?.rangeCount) return;
        const caret = selection.getRangeAt(0);
        if (!caret.collapsed || !root.contains(caret.startContainer)) return;
        const element = caret.startContainer.nodeType === 1 ? caret.startContainer as Element : caret.startContainer.parentElement;
        if (!element || element.closest(excluded)) return;
        const block = element.closest<HTMLElement>(blockSelector);
        if (!block || !root.contains(block)) return;
        const flow = prefixAt(block, caret);
        const candidate = candidateAt(flow);
        const saved = editor.getSelection();
        if (!candidate || !saved || saved.length) return;
        const offset = saved.index - flow.text.length + candidate.start;
        editor.transact(() => {
          editor.setSelection(offset, candidate.length);
          editor.format('link', { href: candidate.href });
          editor.setSelection(saved.index);
        });
      };
      const startComposition = () => { composing = true; };
      const endComposition = () => { composing = false; };
      const unprovide = editor.providePlugin('autolink', commands);
      root.addEventListener('input', input);
      root.addEventListener('compositionstart', startComposition);
      root.addEventListener('compositionend', endComposition);
      return () => {
        if (disposed) return;
        disposed = true;
        root.removeEventListener('input', input);
        root.removeEventListener('compositionstart', startComposition);
        root.removeEventListener('compositionend', endComposition);
        unprovide();
      };
    },
  };
};

export const autolinkCommands = (editor: Editor): AutolinkCommands => {
  const commands = editor.getPlugin<AutolinkCommands>('autolink');
  if (!commands) throw new Error('Install the autolink plugin first.');
  return commands;
};
