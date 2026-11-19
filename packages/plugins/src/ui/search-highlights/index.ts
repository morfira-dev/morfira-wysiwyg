import type { Editor } from '@morfira-dev/wysiwyg-core';
import { getSearchRanges, searchCommands } from '../../search/index.js';
import type { SearchState } from '../../search/types.js';
import { acquireSearchHighlights } from './registry.js';
import type { SearchHighlightsController, SearchHighlightsOptions, SearchHighlightsState } from './types.js';

export type { SearchHighlightsController, SearchHighlightsOptions, SearchHighlightsState } from './types.js';

const owners = new WeakMap<Editor, object>();
const sameMatches = (a: SearchState, b: SearchState): boolean => a.query === b.query
  && a.options.caseSensitive === b.options.caseSensitive && a.options.wholeWord === b.options.wholeWord
  && a.error === b.error && a.matches.length === b.matches.length
  && a.matches.every((match, index) => match.index === b.matches[index].index
    && match.length === b.matches[index].length && match.text === b.matches[index].text);

export const createSearchHighlights = (editor: Editor, options: SearchHighlightsOptions = {}): SearchHighlightsController => {
  if (!options || typeof options !== 'object' || Array.isArray(options)
    || Object.keys(options).some((key) => key !== 'onError')) throw new TypeError('Expected search highlight options.');
  if (options.onError !== undefined && typeof options.onError !== 'function') throw new TypeError('Search highlight onError must be a callback.');
  const api = searchCommands(editor);
  if (owners.has(editor)) throw new Error('Only one search highlight controller may own an editor.');
  const surface = editor.surface;
  const document = surface.ownerDocument;
  const view = document.defaultView;
  if (!view) throw new Error('Search highlights need an editor in a browser document.');
  const token = {};
  owners.set(editor, token);
  let disposed = false;
  let composing = false;
  let refreshing = false;
  let dirty = true;
  let frame = 0;
  let current = -1;
  let previous: SearchState | undefined;
  let observer: MutationObserver | undefined;
  let state: SearchHighlightsState = { status: 'unsupported', count: 0, current: -1 };
  let owner: ReturnType<typeof acquireSearchHighlights>['owner'];
  const cleanups: (() => void)[] = [];
  const report = (error: unknown): void => {
    try { options.onError?.(error); }
    catch { /* Application diagnostics cannot interrupt owned cleanup. */ }
  };
  const assertActive = (): void => { if (disposed) throw new Error('Search highlights have been destroyed.'); };
  const cancel = (): void => {
    if (frame) view.cancelAnimationFrame(frame);
    frame = 0;
  };
  const clear = (): void => {
    owner?.clear();
    state = { ...state, count: 0, current: -1 };
  };
  const conflict = (): void => {
    const changed = state.status !== 'conflict';
    clear();
    state = { status: 'conflict', count: 0, current: -1 };
    cancel();
    if (changed) report(new Error('Search highlight registry names are owned by another implementation.'));
  };
  const refresh = (): void => {
    assertActive();
    if (refreshing) { dirty = true; return; }
    cancel();
    if (observer?.takeRecords().length) dirty = true;
    if (!owner || state.status === 'conflict') return;
    if (!owner.valid()) { conflict(); return; }
    if (composing) { clear(); return; }
    refreshing = true;
    try {
      if (dirty) {
        dirty = false;
        const snapshot = getSearchRanges(editor);
        if (disposed || composing) return;
        const ranges = snapshot.ranges;
        if (ranges.some((range) => !surface.contains(range.startContainer) || !surface.contains(range.endContainer))) {
          dirty = true;
          clear();
          return;
        }
        if (!owner.update(ranges, snapshot.current)) { conflict(); return; }
        current = snapshot.current;
        state = { status: 'ready', count: ranges.length, current: ranges[current] ? current : -1 };
      }
      else {
        if (!owner.select(current)) { conflict(); return; }
        state = { ...state, current: current >= 0 && current < state.count ? current : -1 };
      }
    }
    finally { refreshing = false; }
  };
  const schedule = (): void => {
    if (disposed || composing || !owner || state.status === 'conflict' || frame) return;
    frame = view.requestAnimationFrame(() => {
      frame = 0;
      if (disposed) return;
      try { refresh(); }
      catch (error) {
        try { clear(); }
        catch (cleanupError) { report(cleanupError); }
        dirty = true;
        report(error);
      }
    });
  };
  const contentChanged = (): void => { dirty = true; schedule(); };
  const changed = (next: SearchState): void => {
    if (!previous || !sameMatches(previous, next)) dirty = true;
    previous = next;
    current = next.current;
    schedule();
  };
  const compositionStart = (): void => {
    if (editor.isReadOnly()) return;
    composing = true;
    dirty = true;
    cancel();
    clear();
  };
  const compositionEnd = (): void => { composing = false; contentChanged(); };
  const destroy = (): void => {
    if (disposed) return;
    disposed = true;
    const failures: unknown[] = [];
    try { cancel(); }
    catch (error) { failures.push(error); }
    for (const cleanup of cleanups.splice(0).reverse()) {
      try { cleanup(); }
      catch (error) { failures.push(error); }
    }
    try { owner?.release(); }
    catch (error) { failures.push(error); }
    if (owners.get(editor) === token) owners.delete(editor);
    owner = undefined;
    if (failures.length) throw new AggregateError(failures, 'Search highlight cleanup failed.');
  };
  try {
    const acquired = acquireSearchHighlights(document);
    owner = acquired.owner;
    state = { status: acquired.status, count: 0, current: -1 };
    cleanups.push(editor.events.on('destroy', destroy));
    if (owner) {
      cleanups.push(api.subscribe(changed));
      cleanups.push(editor.subscribe((change) => {
        if (change.source === 'api') {
          composing = false;
          cancel();
          clear();
        }
        contentChanged();
      }));
      const currentObserver = new view.MutationObserver(contentChanged);
      observer = currentObserver;
      cleanups.push(() => currentObserver.disconnect());
      currentObserver.observe(surface, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['data-mw-node'] });
      surface.addEventListener('compositionstart', compositionStart);
      cleanups.push(() => surface.removeEventListener('compositionstart', compositionStart));
      surface.addEventListener('compositionend', compositionEnd);
      cleanups.push(() => surface.removeEventListener('compositionend', compositionEnd));
      previous = api.getState();
      current = previous.current;
      refresh();
    }
    if (state.status === 'conflict') report(new Error('Search highlight registry names are already in use.'));
    if (disposed) throw new Error('The editor was destroyed while creating search highlights.');
  }
  catch (error) {
    try { destroy(); }
    catch { /* Preserve initialization failure after cleanup attempts. */ }
    throw error;
  }
  return { getState: () => { assertActive(); return { ...state }; }, refresh, destroy };
};
