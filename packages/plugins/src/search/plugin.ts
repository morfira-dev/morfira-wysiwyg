import type { SearchOptions, SearchMatch, SearchState, SearchCommands, Leaf, Run, LocatedMatch, Index } from './types.js';

import type { Editor, EditorPlugin } from '@morfira-dev/wysiwyg-core';
import { registerSearchRanges } from './ranges.js';
const blocks = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'figure', 'figcaption']);
const barriers = new Set(['br', 'img', 'hr']);
const word = /[\p{L}\p{N}\p{M}\p{Pc}]/u;
const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const literal = (value: unknown, maximum: number, name: string): string => {
  if (typeof value !== 'string' || value.length > maximum || /[\r\n]/.test(value))
    throw new TypeError(`${name} must be single-line literal text up to ${maximum} UTF-16 units.`);
  return value;
};
const normalizeOptions = (options: SearchOptions | undefined): SearchState['options'] => {
  if (options !== undefined && (!options || typeof options !== 'object' || Array.isArray(options)))
    throw new TypeError('Expected search options.');
  for (const key of ['caseSensitive', 'wholeWord'] as const)
    if (options?.[key] !== undefined && typeof options[key] !== 'boolean')
      throw new TypeError(`${key} must be boolean.`);
  return { caseSensitive: options?.caseSensitive ?? false, wholeWord: options?.wholeWord ?? false };
};
const textRuns = (root: HTMLElement): Run[] => {
  const runs: Run[] = [];
  let leaves: Leaf[] = [];
  let chunks: string[] = [];
  let offset = 0;
  const flush = () => {
    if (leaves.length)
      runs.push({ text: chunks.join(''), start: leaves[0].start, leaves }); leaves = []; chunks = [];
  };
  const visit = (node: Node): void => {
    if (node.nodeType === 3) {
      const text = node.textContent ?? '';
      const start = offset;
      offset += text.length;
      if (text.length) {
        leaves.push({ node: node as Text, start, end: offset });
        chunks.push(text);
      }
      return;
    }
    if (node.nodeType !== 1)
      return;
    const element = node as Element;
    if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml' || element.hasAttribute('data-mw-node')) {
      flush();
      offset += element.textContent?.length ?? 0;
      return;
    }
    const boundary = blocks.has(element.localName) || barriers.has(element.localName);
    if (boundary)
      flush();
    if (barriers.has(element.localName)) {
      offset += element.textContent?.length ?? 0;
      return;
    }
    for (const child of element.childNodes)
      visit(child);
    if (boundary)
      flush();
  };
  for (const child of root.childNodes)
    visit(child);
  flush();
  return runs;
};
const beforeCharacter = (text: string, index: number) => {
  const last = text.charCodeAt(index - 1);
  const previous = text.charCodeAt(index - 2);
  return last >= 0xdc00 && last <= 0xdfff && previous >= 0xd800 && previous <= 0xdbff ? text.slice(index - 2, index) : text.slice(index - 1, index);
};
const afterCharacter = (text: string, index: number) => index < text.length ? String.fromCodePoint(text.codePointAt(index)!) : '';
const leafAt = (leaves: Leaf[], offset: number, end: boolean): number => {
  let low = 0;
  let high = leaves.length - 1;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (end ? leaves[middle].end < offset : leaves[middle].end <= offset)
      low = middle + 1;
    else
      high = middle;
  }
  return low;
};
const scan = (runs: Run[], query: string, options: SearchState['options']): LocatedMatch[] => {
  const matches: LocatedMatch[] = [];
  if (!query)
    return matches;
  const expression = new RegExp(escaped(query), options.caseSensitive ? 'gu' : 'giu');
  for (let runIndex = 0; runIndex < runs.length; runIndex++) {
    const run = runs[runIndex];
    expression.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = expression.exec(run.text))) {
      const end = match.index + match[0].length;
      if (options.wholeWord && (word.test(beforeCharacter(run.text, match.index)) || word.test(afterCharacter(run.text, end))))
        continue;
      if (matches.length === 10000)
        throw new RangeError('Search exceeds the 10000-match limit.');
      const index = run.start + match.index;
      matches.push({ index, length: match[0].length, text: match[0], run: runIndex, first: leafAt(run.leaves, index, false), last: leafAt(run.leaves, index + match[0].length, true) });
    }
  }
  return matches;
};
const buildIndex = (root: HTMLElement, query: string, options: SearchState['options']): Index => {
  const runs = query ? textRuns(root) : [];
  return { runs, matches: scan(runs, query, options) };
};
const publicMatch = ({ index, length, text }: SearchMatch): SearchMatch => ({ index, length, text });
const matchRange = (root: HTMLElement, index: Index, match: LocatedMatch): Range => {
  const leaves = index.runs[match.run].leaves;
  const range = root.ownerDocument.createRange();
  range.setStart(leaves[match.first].node, match.index - leaves[match.first].start);
  range.setEnd(leaves[match.last].node, match.index + match.length - leaves[match.last].start);
  return range;
};
const scrollRange = (range: Range, root: HTMLElement) => {
  const view = root.ownerDocument.defaultView;
  if (!view)
    return;
  const nearestDelta = (start: number, end: number, minimum: number, maximum: number) => start < minimum ? start - minimum : end > maximum ? end - maximum : 0;
  for (let element = range.startContainer.parentElement; element; element = element.parentElement) {
    const style = view.getComputedStyle(element);
    const bounds = element.getBoundingClientRect();
    const rect = range.getBoundingClientRect();
    if (/(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight)
      element.scrollTop += nearestDelta(rect.top, rect.bottom, bounds.top + element.clientTop, bounds.top + element.clientTop + element.clientHeight);
    if (/(auto|scroll)/.test(style.overflowX) && element.scrollWidth > element.clientWidth)
      element.scrollLeft += nearestDelta(rect.left, rect.right, bounds.left + element.clientLeft, bounds.left + element.clientLeft + element.clientWidth);
  }
  const rect = range.getBoundingClientRect();
  view.scrollBy(nearestDelta(rect.left, rect.right, 0, view.innerWidth), nearestDelta(rect.top, rect.bottom, 0, view.innerHeight));
};
const chooseNearest = (matches: LocatedMatch[], anchor: number | undefined): number => {
  if (!matches.length)
    return -1;
  if (anchor === undefined)
    return 0;
  let low = 0;
  let high = matches.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (matches[middle].index < anchor)
      low = middle + 1;
    else
      high = middle;
  }
  if (low === matches.length)
    return low - 1;
  return low > 0 && anchor - matches[low - 1].index < matches[low].index - anchor ? low - 1 : low;
};
const replaceText = (root: HTMLElement, index: Index, matches: LocatedMatch[], replacement: string): Range => {
  const edits = new Map<Text, {
    from: number;
    to: number;
    replacement: string;
  }[]>();
  for (const match of [...matches].reverse()) {
    const leaves = index.runs[match.run].leaves;
    for (let position = match.first; position <= match.last; position++) {
      const leaf = leaves[position];
      const changes = edits.get(leaf.node) ?? [];
      changes.push({ from: position === match.first ? match.index - leaf.start : 0, to: position === match.last ? match.index + match.length - leaf.start : leaf.node.length, replacement: position === match.first ? replacement : '' });
      edits.set(leaf.node, changes);
    }
  }
  // Each leaf is written once. Edits were collected in reverse document order.
  for (const [node, changes] of edits) {
    const chunks: string[] = [];
    let position = 0;
    for (const edit of [...changes].reverse()) {
      chunks.push(node.data.slice(position, edit.from), edit.replacement);
      position = edit.to;
    }
    chunks.push(node.data.slice(position));
    node.data = chunks.join('');
  }
  const match = matches[0];
  const first = index.runs[match.run].leaves[match.first];
  const caret = root.ownerDocument.createRange();
  caret.setStart(first.node, match.index - first.start + replacement.length);
  caret.collapse(true);
  return caret;
};
const preflight = (index: Index, targets: LocatedMatch[], replacement: string, query: string, options: SearchState['options']) => {
  const resultingLength = index.runs.reduce((total, run) => total + run.text.length, 0) + targets.reduce((total, match) => total + replacement.length - match.length, 0);
  if (resultingLength > 5000000)
    throw new RangeError('Replacement exceeds the 5000000-unit document text limit.');
  const changes = new Map<number, LocatedMatch[]>();
  for (const match of targets) {
    const run = changes.get(match.run) ?? [];
    run.push(match);
    changes.set(match.run, run);
  }
  const planned = index.runs.map((run, runIndex) => {
    const chunks: string[] = [];
    let position = 0;
    for (const match of changes.get(runIndex) ?? []) {
      const from = match.index - run.start;
      chunks.push(run.text.slice(position, from), replacement);
      position = from + match.length;
    }
    chunks.push(run.text.slice(position));
    return { ...run, text: chunks.join('') };
  });
  // Only the number of matches is needed here; stale DOM offsets are never used for mutation.
  scan(planned, query, options);
};
export const search = (): EditorPlugin => ({
  name: 'search', setup: (editor) => {
    let disposed = false;
    let composing = false;
    let mutating = false;
    let observer: MutationObserver | undefined;
    let state: SearchState = { query: '', options: { caseSensitive: false, wholeWord: false }, matches: [], current: -1 };
    let index: Index = { runs: [], matches: [] };
    const listeners = new Set<(state: SearchState) => void>();
    const active = () => {
      if (disposed)
        throw new Error('Search plugin has been disposed.');
    };
    const snapshot = (): SearchState => ({ query: state.query, options: { ...state.options }, matches: state.matches.map(publicMatch), current: state.current, ...(state.error ? { error: state.error } : {}) });
    const notify = () => {
      for (const listener of [...listeners]) {
        if (disposed)
          break;
        listener(snapshot());
      }
    };
    const assign = (next: Index, query: string, options: SearchState['options'], current: number, error?: 'match-limit') => {
      const previous = JSON.stringify(state);
      index = next;
      observer?.takeRecords();
      state = { query, options, matches: next.matches.map(publicMatch), current, ...(error ? { error } : {}) };
      if (JSON.stringify(state) !== previous)
        notify();
    };
    const refresh = (anchor = index.matches[state.current]?.index, following = false) => {
      let next: Index;
      try {
        next = buildIndex(editor.surface, state.query, state.options);
      }
      catch (error) {
        if (!(error instanceof RangeError))
          throw error;
        assign({ runs: [], matches: [] }, state.query, state.options, -1, 'match-limit');
        return;
      }
      let current = chooseNearest(next.matches, anchor);
      if (following && anchor !== undefined) {
        current = next.matches.findIndex((match) => match.index >= anchor);
        if (current < 0 && next.matches.length)
          current = 0;
      }
      assign(next, state.query, state.options, current);
    };
    const ensureFresh = () => {
      if (observer?.takeRecords().length)
        refresh();
    };
    const replace = (replacement: string, all: boolean): number => {
      active();
      const value = literal(replacement, 20000, 'Replacement');
      if (editor.isReadOnly() || composing || mutating)
        return 0;
      ensureFresh();
      if (state.error)
        throw new RangeError('Search exceeds the 10000-match limit. Refine the query before replacing.');
      const candidates = all ? index.matches : index.matches[state.current] ? [index.matches[state.current]] : [];
      const targets = candidates.filter((match) => match.text !== value);
      if (!targets.length)
        return 0;
      preflight(index, targets, value, state.query, state.options);
      const original = index;
      const first = targets[0];
      const end = first.index + value.length;
      mutating = true;
      try {
        editor.transact(() => {
          const caret = replaceText(editor.surface, original, targets, value);
          const native = editor.surface.ownerDocument.getSelection();
          native?.removeAllRanges();
          native?.addRange(caret);
        });
      }
      catch (error) {
        refresh();
        throw error;
      }
      finally {
        mutating = false;
      }
      refresh(end, !all);
      return targets.length;
    };
    const api: SearchCommands = {
      setQuery: (query, options) => { active(); const value = literal(query, 1000, 'Query'); const normalized = normalizeOptions(options); const next = buildIndex(editor.surface, value, normalized); assign(next, value, normalized, next.matches.length ? 0 : -1); },
      getState: () => { active(); return snapshot(); },
      select: (selected) => {
        active();
        ensureFresh();
        if (!Number.isInteger(selected) || selected < 0 || selected >= index.matches.length)
          throw new RangeError('Select an existing search match.');
        const range = matchRange(editor.surface, index, index.matches[selected]);
        editor.surface.focus({ preventScroll: true });
        const native = editor.surface.ownerDocument.getSelection();
        native?.removeAllRanges();
        native?.addRange(range);
        scrollRange(range, editor.surface);
        if (state.current !== selected) {
          state.current = selected;
          notify();
        }
      },
      next: () => {
        active(); ensureFresh(); if (!index.matches.length)
          return; const next = (state.current + 1) % index.matches.length; const match = publicMatch(index.matches[next]); api.select(next); return match;
      },
      previous: () => {
        active(); ensureFresh(); if (!index.matches.length)
          return; const previous = (state.current - 1 + index.matches.length) % index.matches.length; const match = publicMatch(index.matches[previous]); api.select(previous); return match;
      },
      replaceCurrent: (replacement) => replace(replacement, false) > 0,
      replaceAll: (replacement) => replace(replacement, true),
      clear: () => { active(); assign({ runs: [], matches: [] }, '', { caseSensitive: false, wholeWord: false }, -1); },
      subscribe: (listener) => {
        active(); if (typeof listener !== 'function')
          throw new TypeError('Expected a search-state listener.'); listeners.add(listener); return () => { listeners.delete(listener); };
      },
    };
    const unprovide = editor.providePlugin('search', api);
    const unregisterRanges = registerSearchRanges(editor, () => {
      active();
      ensureFresh();
      active();
      return { ranges: index.matches.map((match) => matchRange(editor.surface, index, match)), current: state.current };
    });
    const unsubscribe = editor.subscribe(() => {
      if (!mutating)
        refresh();
    });
    observer = new MutationObserver((records) => {
      if (records.length && !disposed && !mutating)
        refresh();
    });
    observer.observe(editor.surface, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-mw-node'] });
    const compositionStart = () => { composing = true; };
    const compositionEnd = () => {
      composing = false; if (!mutating)
        refresh();
    };
    editor.surface.addEventListener('compositionstart', compositionStart);
    editor.surface.addEventListener('compositionend', compositionEnd);
    return () => {
      disposed = true;
      observer?.disconnect();
      unsubscribe();
      unregisterRanges();
      unprovide();
      listeners.clear();
      editor.surface.removeEventListener('compositionstart', compositionStart);
      editor.surface.removeEventListener('compositionend', compositionEnd);
      index = { runs: [], matches: [] };
      state = { query: '', options: { caseSensitive: false, wholeWord: false }, matches: [], current: -1 };
    };
  }
});
export const searchCommands = (editor: Editor): SearchCommands => {
  const api = editor.getPlugin<SearchCommands>('search');
  if (!api)
    throw new Error('Install the search plugin first.');
  return api;
};
