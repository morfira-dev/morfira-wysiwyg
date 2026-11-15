import type { AutolinkCandidate, AutolinkFlow } from './types.js';

export const maximumURL = 2048;
const maximumPrefix = maximumURL + 2;
export const blockSelector = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,td,th';
const inlineSemantic = '[data-mw-node]:is(span,strong,em,u,s,sub,sup,code)';
export const excluded = `a,pre,code,figure,figcaption,${inlineSemantic}`;
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
export const prefixAt = (block: HTMLElement, caret: Range): AutolinkFlow => {
  const parts: string[] = [];
  const leaves: AutolinkFlow['leaves'] = [];
  let remaining = maximumPrefix;
  let truncated = false;
  const add = (node: Text, end: number) => {
    const start = Math.max(0, end - remaining);
    parts.unshift(node.data.slice(start, end));
    leaves.unshift({ node, start, end });
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
  return { text: parts.join(''), truncated, leaves };
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

export const candidateAt = (text: string, truncated = false, space = false): AutolinkCandidate | undefined => {
  if (space && !/[ \u00a0]$/.test(text)) return;
  const prefix = space ? text.slice(0, -1) : text;
  const match = /(?:^|[\s(\[{])((?:https?:\/\/|www\.)[^\s<>"']+)$/i.exec(prefix);
  if (!match) return;
  const start = match.index + match[0].length - match[1].length;
  if (truncated && start === 0) return;
  const label = trimPunctuation(match[1]);
  if (!label || label.length > maximumURL || /[\u0000-\u0020\u007f]/.test(label)) return;
  const href = /^www\./i.test(label) ? `https://${label}` : label;
  try {
    const parsed = new URL(href);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) return;
  }
  catch { return; }
  return { start, length: label.length, href };
};

/** Resolve a bounded text interval without walking the whole document. */
export const rangeAt = (flow: AutolinkFlow, start: number, length: number): Range | undefined => {
  const first = flow.leaves[0];
  if (!first || start < 0 || length < 1 || start + length > flow.text.length) return;
  const range = first.node.ownerDocument.createRange();
  let offset = 0;
  let found = false;
  for (const leaf of flow.leaves) {
    const size = leaf.end - leaf.start;
    if (!found && start < offset + size) {
      range.setStart(leaf.node, leaf.start + start - offset);
      found = true;
    }
    if (found && start + length <= offset + size) {
      range.setEnd(leaf.node, leaf.start + start + length - offset);
      return range;
    }
    offset += size;
  }
};
