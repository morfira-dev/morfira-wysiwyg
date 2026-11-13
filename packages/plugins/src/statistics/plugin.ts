import type { StatisticsOptions, TextStatistics, StatisticsState, StatisticsCommands } from './types.js';

import type { Editor, EditorPlugin } from '@morfira-dev/wysiwyg-core';
const blocks = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'ul', 'ol', 'li', 'table', 'caption', 'colgroup', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'figure', 'figcaption']);
const barriers = new Set(['br', 'img', 'hr', 'col']);
const omitted = new Set(['script', 'style', 'template', 'noscript', 'iframe', 'object', 'embed']);
const zero = (): TextStatistics => ({ characters: 0, charactersWithoutWhitespace: 0, words: 0 });
const copy = (state: StatisticsState): StatisticsState => ({ document: { ...state.document }, selection: { ...state.selection } });
const equal = (a: StatisticsState, b: StatisticsState) => ['document', 'selection'].every((key) => {
  const left = a[key as keyof StatisticsState];
  const right = b[key as keyof StatisticsState];
  return left.characters === right.characters && left.charactersWithoutWhitespace === right.charactersWithoutWhitespace && left.words === right.words;
});
const textRuns = (root: Node): string[] => {
  const runs: string[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length)
      runs.push(current.join('')); current = [];
  };
  const visit = (node: Node) => {
    if (node.nodeType === 3) {
      current.push(node.textContent ?? '');
      return;
    }
    if (node.nodeType === 1) {
      const element = node as Element;
      if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml' || omitted.has(element.localName)) {
        flush();
        return;
      }
      if (barriers.has(element.localName)) {
        flush();
        return;
      }
      const block = blocks.has(element.localName);
      if (block)
        flush();
      for (const child of element.childNodes)
        visit(child);
      if (block)
        flush();
      return;
    }
    for (const child of node.childNodes)
      visit(child);
  };
  visit(root);
  flush();
  return runs;
};
export const statistics = (options: StatisticsOptions = {}): EditorPlugin => {
  if (!options || typeof options !== 'object' || Array.isArray(options) || (options.locale !== undefined && typeof options.locale !== 'string'))
    throw new TypeError('Expected a statistics locale string.');
  const locale = options.locale === undefined ? undefined : Intl.getCanonicalLocales(options.locale)[0];
  if (options.locale !== undefined && !locale)
    throw new RangeError('Expected a nonempty statistics locale.');
  if (typeof Intl.Segmenter !== 'function')
    throw new Error('Statistics requires Intl.Segmenter support.');
  const graphemes = new Intl.Segmenter(locale, { granularity: 'grapheme' });
  const words = new Intl.Segmenter(locale, { granularity: 'word' });
  const count = (root: Node): TextStatistics => {
    const result = zero();
    for (const run of textRuns(root)) {
      for (const part of graphemes.segment(run)) {
        result.characters++;
        if (!/^\s+$/u.test(part.segment))
          result.charactersWithoutWhitespace++;
      }
      for (const part of words.segment(run)) {
        // Recheck false word flags independently: some engines misclassify decomposed words in context.
        const isolatedWord = !part.isWordLike && /[\p{L}\p{N}]/u.test(part.segment) && [...words.segment(part.segment)].some((candidate) => candidate.isWordLike);
        if (part.isWordLike || isolatedWord)
          result.words++;
      }
    }
    return result;
  };
  return {
    name: 'statistics', setup: (editor) => {
      let disposed = false;
      const listeners = new Set<(state: StatisticsState) => void>();
      const active = () => {
        if (disposed)
          throw new Error('Statistics plugin has been disposed.');
      };
      const calculate = (): StatisticsState => {
        const native = editor.surface.ownerDocument.getSelection();
        let selection = zero();
        if (native?.rangeCount) {
          const range = native.getRangeAt(0);
          if (!range.collapsed && editor.surface.contains(range.startContainer) && editor.surface.contains(range.endContainer))
            selection = count(range.cloneContents());
        }
        return { document: count(editor.surface), selection };
      };
      let state = calculate();
      const notify = () => {
        if (disposed)
          return;
        const next = calculate();
        if (equal(state, next))
          return;
        state = next;
        for (const listener of [...listeners]) {
          if (disposed)
            break;
          listener(copy(state));
        }
      };
      const api: StatisticsCommands = {
        getState: () => { active(); return copy(calculate()); },
        subscribe: (listener) => {
          active(); if (typeof listener !== 'function')
            throw new TypeError('Expected a statistics listener.'); listeners.add(listener); return () => { listeners.delete(listener); };
        },
      };
      const unprovide = editor.providePlugin('statistics', api);
      const unsubscribe = editor.subscribe(notify);
      const unselect = editor.onSelectionChange(notify);
      return () => { disposed = true; unsubscribe(); unselect(); listeners.clear(); unprovide(); };
    }
  };
};
export const statisticsCommands = (editor: Editor): StatisticsCommands => {
  const api = editor.getPlugin<StatisticsCommands>('statistics');
  if (!api)
    throw new Error('Install the statistics plugin first.');
  return api;
};
