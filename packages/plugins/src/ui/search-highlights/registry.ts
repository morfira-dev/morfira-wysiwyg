import type { SearchHighlightAcquisition, SearchHighlightOwner, SearchHighlightPlatform, SearchHighlightRegistry } from './internal-types.js';

const resultName = 'morfira-search-results';
const currentName = 'morfira-search-current';
const documents = new WeakMap<Document, SearchHighlightRegistry>();

const registered = (state: SearchHighlightRegistry): boolean => state.registry.get(resultName) === state.results
  && state.registry.get(currentName) === state.current;

/** Each owner retains its exact Range objects, never clearing a shared Highlight. */
export const acquireSearchHighlights = (document: Document): SearchHighlightAcquisition => {
  const platform = document.defaultView as unknown as SearchHighlightPlatform | null;
  const Constructor = platform?.Highlight;
  const registry = platform?.CSS?.highlights;
  if (typeof Constructor !== 'function' || !registry || typeof registry.get !== 'function'
    || typeof registry.has !== 'function' || typeof registry.set !== 'function' || typeof registry.delete !== 'function'
    || typeof Constructor.prototype?.add !== 'function' || typeof Constructor.prototype.delete !== 'function')
    return { status: 'unsupported' };

  let state = documents.get(document);
  if (state && !registered(state)) return { status: 'conflict' };
  if (!state) {
    if (registry.has(resultName) || registry.has(currentName)) return { status: 'conflict' };
    const results = new Constructor();
    const current = new Constructor();
    current.priority = 1;
    try {
      registry.set(resultName, results);
      registry.set(currentName, current);
    }
    catch (error) {
      try { if (registry.get(resultName) === results) registry.delete(resultName); }
      catch { /* Preserve setup failure while attempting both removals. */ }
      try { if (registry.get(currentName) === current) registry.delete(currentName); }
      catch { /* Preserve the original setup failure. */ }
      throw error;
    }
    state = { registry, results, current, owners: new Set() };
    documents.set(document, state);
  }
  const shared = state;
  const token = {};
  shared.owners.add(token);
  let ranges: readonly Range[] = [];
  let active: Range | undefined;
  let released = false;
  const clear = (): void => {
    const previous = ranges;
    const selected = active;
    ranges = [];
    active = undefined;
    const failures: unknown[] = [];
    for (const range of previous) {
      try { shared.results.delete(range); }
      catch (error) { failures.push(error); }
    }
    if (selected) {
      try { shared.current.delete(selected); }
      catch (error) { failures.push(error); }
    }
    if (failures.length) throw new AggregateError(failures, 'Search highlight range cleanup failed.');
  };
  const valid = (): boolean => !released && registered(shared);
  const select = (current: number): boolean => {
    if (!valid()) { clear(); return false; }
    if (active) shared.current.delete(active);
    active = ranges[current];
    if (active) shared.current.add(active);
    return true;
  };
  const owner: SearchHighlightOwner = {
    valid,
    select,
    update: (next, current) => {
      if (!valid()) { clear(); return false; }
      clear();
      // Store every prospective range before add so a failed native call can
      // still roll back any partially added object without touching other owners.
      ranges = [...next];
      try {
        for (const range of ranges) shared.results.add(range);
        return select(current);
      }
      catch (error) {
        try { clear(); }
        catch { /* Preserve the native update failure after cleanup attempts. */ }
        throw error;
      }
    },
    clear,
    release: () => {
      if (released) return;
      released = true;
      shared.owners.delete(token);
      const failures: unknown[] = [];
      try { clear(); }
      catch (error) { failures.push(error); }
      if (!shared.owners.size && !shared.results.size && !shared.current.size) {
        for (const [name, highlight] of [[resultName, shared.results], [currentName, shared.current]] as const) {
          try { if (shared.registry.get(name) === highlight) shared.registry.delete(name); }
          catch (error) { failures.push(error); }
        }
        documents.delete(document);
      }
      if (failures.length) throw new AggregateError(failures, 'Search highlight ownership cleanup failed.');
    },
  };
  return { status: 'ready', owner };
};
