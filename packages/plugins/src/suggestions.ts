import type { Editor } from '@morfira-dev/wysiwyg-core';
import type { SuggestionController, SuggestionOption, SuggestionState } from './suggestions-types.js';
import { getSuggestionEditor } from './suggestions-engine.js';
export type * from './suggestions-types.js';

export interface SuggestionMenuLabels { label: string; loading: string; empty: string; error: string; results: string; }
export interface SuggestionMenuOptions { locale?: 'ru' | 'en'; labels?: Partial<SuggestionMenuLabels>; }
interface AriaOwner {
  views: Set<string>;
  optionPrefixes: Set<string>;
  original: Map<string, string | null>;
}
const owners = new WeakMap<HTMLElement, AriaOwner>();
const attached = new WeakSet<object>();
let sequence = 0;
const defaults: Record<'ru' | 'en', SuggestionMenuLabels> = {
  en: { label: 'Suggestions', loading: 'Loading suggestions…', empty: 'No suggestions', error: 'Unable to load suggestions', results: '{count} suggestions' },
  ru: { label: 'Подсказки', loading: 'Загрузка подсказок…', empty: 'Нет подсказок', error: 'Не удалось загрузить подсказки', results: 'Подсказок: {count}' },
};
const labelsFor = (options: SuggestionMenuOptions): SuggestionMenuLabels => {
  if (!options || typeof options !== 'object' || Array.isArray(options) || (options.locale !== undefined && options.locale !== 'en' && options.locale !== 'ru')) throw new TypeError('Expected suggestion-menu options with locale en or ru.');
  if (options.labels !== undefined && (!options.labels || typeof options.labels !== 'object' || Array.isArray(options.labels))) throw new TypeError('Expected suggestion-menu labels.');
  const labels = { ...defaults[options.locale ?? 'en'] };
  for (const key of Object.keys(labels) as (keyof SuggestionMenuLabels)[]) {
    const value = options.labels?.[key];
    if (value !== undefined) { if (typeof value !== 'string' || value.length > 1000) throw new TypeError('Suggestion-menu labels must be strings up to 1000 characters.'); labels[key] = value; }
  }
  return labels;
};
const restoreAttribute = (element: HTMLElement, name: string, value: string | null) => { if (value === null) element.removeAttribute(name); else element.setAttribute(name, value); };
const clearActive = (surface: HTMLElement, owner: AriaOwner, prefix: string) => {
  if (surface.getAttribute('aria-activedescendant')?.startsWith(prefix)) restoreAttribute(surface, 'aria-activedescendant', owner.original.get('aria-activedescendant') ?? null);
};
const registerAria = (surface: HTMLElement, listID: string, optionPrefix: string): { owner: AriaOwner; release: () => void } => {
  let owner = owners.get(surface);
  if (!owner) {
    owner = { views: new Set(), optionPrefixes: new Set(), original: new Map(['aria-autocomplete', 'aria-haspopup', 'aria-activedescendant', 'aria-controls'].map((name) => [name, surface.getAttribute(name)])) };
    owners.set(surface, owner);
  }
  owner.views.add(listID); owner.optionPrefixes.add(optionPrefix);
  const controlled = new Set((surface.getAttribute('aria-controls') ?? '').split(/\s+/).filter(Boolean)); controlled.add(listID);
  surface.setAttribute('aria-controls', [...controlled].join(' '));
  surface.setAttribute('aria-autocomplete', 'list'); surface.setAttribute('aria-haspopup', 'listbox');
  let released = false;
  return { owner, release: () => {
    if (released) return; released = true;
    clearActive(surface, owner!, optionPrefix); owner!.views.delete(listID);
    const remaining = (surface.getAttribute('aria-controls') ?? '').split(/\s+/).filter((id) => id && id !== listID);
    if (remaining.length) surface.setAttribute('aria-controls', remaining.join(' ')); else surface.removeAttribute('aria-controls');
    if (!owner!.views.size) {
      if (surface.getAttribute('aria-autocomplete') === 'list') restoreAttribute(surface, 'aria-autocomplete', owner!.original.get('aria-autocomplete') ?? null);
      if (surface.getAttribute('aria-haspopup') === 'listbox') restoreAttribute(surface, 'aria-haspopup', owner!.original.get('aria-haspopup') ?? null);
      const baseline = owner!.original.get('aria-controls') ?? null;
      const baselineIDs = (baseline ?? '').split(/\s+/).filter(Boolean);
      if (remaining.join(' ') === baselineIDs.join(' ')) restoreAttribute(surface, 'aria-controls', baseline);
      const active = surface.getAttribute('aria-activedescendant');
      if (active && [...owner!.optionPrefixes].some((prefix) => active.startsWith(prefix))) restoreAttribute(surface, 'aria-activedescendant', owner!.original.get('aria-activedescendant') ?? null);
      owners.delete(surface);
    }
  } };
};
const nextID = (document: Document, surface: HTMLElement): string => {
  let base: string;
  do { base = `mw-suggestions-${++sequence}`; } while ((surface.getAttribute('aria-controls') ?? '').split(/\s+/).includes(`${base}-list`) || surface.getAttribute('aria-activedescendant')?.startsWith(`${base}-option-`) || document.getElementById(`${base}-list`) || document.getElementById(`${base}-status`) || Array.from({ length: 100 }, (_, index) => `${base}-option-${index}`).some((id) => document.getElementById(id)));
  return base;
};

/** Optional text-only view. WAI-ARIA 1.2 permits textbox + controlled listbox + active descendant. */
export const createSuggestionMenu = <T extends SuggestionOption>(editor: Editor, controller: SuggestionController<T>, options: SuggestionMenuOptions = {}): (() => void) => {
  const labels = labelsFor(options);
  if (getSuggestionEditor(controller) !== editor) throw new TypeError('Suggestion controller must belong to this live editor.');
  if (attached.has(controller)) throw new Error('A suggestion menu is already attached to this controller.');
  const document = editor.surface.ownerDocument; const view = document.defaultView;
  if (!view) throw new Error('Suggestion menu requires a browser window.');
  const base = nextID(document, editor.surface); const listID = `${base}-list`; const optionPrefix = `${base}-option-`;
  const root = document.createElement('div'); root.className = 'mw-suggestions'; root.hidden = true; root.style.position = 'absolute';
  const list = document.createElement('div'); list.className = 'mw-suggestions-list'; list.id = listID; list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', labels.label);
  const status = document.createElement('div'); status.className = 'mw-suggestions-status'; status.id = `${base}-status`; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  root.append(list, status); editor.element.append(root);
  const aria = registerAria(editor.surface, listID, optionPrefix);
  attached.add(controller);
  let disposed = false; let signature = ''; let rows: HTMLElement[] = []; let unsubscribe = () => {}; let detachDispose = () => {};
  const cleanups: (() => void)[] = []; let rowCleanups: (() => void)[] = [];
  const clearRows = () => { rowCleanups.forEach((cleanup) => cleanup()); rowCleanups = []; list.replaceChildren(); rows = []; };
  const position = (state: SuggestionState<T>) => {
    if (disposed || root.hidden || !state.anchor) return;
    const width = Math.max(0, Math.min(320, view.innerWidth - 16)); root.style.width = `${width}px`; root.style.maxWidth = `${Math.max(0, view.innerWidth - 16)}px`;
    root.style.maxHeight = `${Math.max(0, view.innerHeight - 16)}px`;
    list.style.maxHeight = `min(var(--mw-suggestion-max-height, 240px), ${Math.max(0, view.innerHeight - status.getBoundingClientRect().height - 24)}px)`;
    const box = root.getBoundingClientRect(); const anchor = state.anchor;
    const left = Math.max(8, Math.min(anchor.x, view.innerWidth - box.width - 8));
    const below = anchor.y + anchor.height + 4; const above = anchor.y - box.height - 4;
    const preferred = below + box.height <= view.innerHeight - 8 || above < 8 ? below : above;
    const top = Math.max(8, Math.min(preferred, view.innerHeight - box.height - 8));
    const host = editor.element.getBoundingClientRect();
    root.style.left = `${left - host.left - editor.element.clientLeft + editor.element.scrollLeft}px`;
    root.style.top = `${top - host.top - editor.element.clientTop + editor.element.scrollTop}px`;
  };
  const reveal = (row: HTMLElement) => {
    const box = list.getBoundingClientRect(); const item = row.getBoundingClientRect();
    if (item.top < box.top + list.clientTop) list.scrollTop -= box.top + list.clientTop - item.top;
    else if (item.bottom > box.top + list.clientTop + list.clientHeight) list.scrollTop += item.bottom - box.top - list.clientTop - list.clientHeight;
  };
  const render = (state: SuggestionState<T>) => {
    if (disposed) return;
    root.hidden = state.status === 'closed' || !state.anchor;
    const nextSignature = JSON.stringify(state.items.map(({ id, label, description }) => ({ id, label, description })));
    if (nextSignature !== signature) {
      signature = nextSignature; clearRows();
      state.items.forEach((item, index) => {
        const row = document.createElement('div'); row.className = 'mw-suggestion-option'; row.id = `${optionPrefix}${index}`; row.setAttribute('role', 'option');
        const label = document.createElement('div'); label.className = 'mw-suggestion-label'; label.textContent = item.label; row.append(label);
        if (item.description !== undefined) { const description = document.createElement('div'); description.className = 'mw-suggestion-description'; description.textContent = item.description; row.append(description); }
        const down = (event: PointerEvent) => { if (event.button === 0 && !disposed) { event.preventDefault(); controller.choose(item.id); } };
        row.addEventListener('pointerdown', down); rowCleanups.push(() => row.removeEventListener('pointerdown', down)); list.append(row); rows.push(row);
      });
      list.scrollTop = 0;
    }
    rows.forEach((row, index) => { row.setAttribute('aria-selected', String(state.status === 'ready' && index === state.activeIndex)); row.classList.toggle('is-active', state.status === 'ready' && index === state.activeIndex); });
    if (!root.hidden && state.status === 'ready' && rows[state.activeIndex]) {
      const current = editor.surface.getAttribute('aria-activedescendant');
      if (!current || ![...aria.owner.optionPrefixes].some((prefix) => current.startsWith(prefix))) aria.owner.original.set('aria-activedescendant', current);
      editor.surface.setAttribute('aria-activedescendant', rows[state.activeIndex].id);
    }
    else clearActive(editor.surface, aria.owner, optionPrefix);
    const message = state.status === 'loading' ? labels.loading : state.status === 'error' ? labels.error : !state.items.length ? labels.empty : labels.results.replace('{count}', String(state.items.length));
    if (status.textContent !== message) status.textContent = message;
    position(state); if (!root.hidden && state.status === 'ready' && rows[state.activeIndex]) reveal(rows[state.activeIndex]);
  };
  const reposition = () => { if (!disposed && !root.hidden) position(controller.getState()); };
  const outside = (event: PointerEvent) => { if (!disposed && event.target instanceof Node && !editor.element.contains(event.target)) controller.close(); };
  const preventSelection = (event: PointerEvent) => { if (event.button === 0) event.preventDefault(); };
  root.addEventListener('pointerdown', preventSelection); document.addEventListener('pointerdown', outside, true); document.addEventListener('scroll', reposition, true); view.addEventListener('resize', reposition);
  cleanups.push(() => root.removeEventListener('pointerdown', preventSelection), () => document.removeEventListener('pointerdown', outside, true), () => document.removeEventListener('scroll', reposition, true), () => view.removeEventListener('resize', reposition));
  const dispose = () => {
    if (disposed) return; disposed = true; unsubscribe(); detachDispose(); cleanups.forEach((cleanup) => cleanup()); clearRows(); root.remove(); aria.release(); attached.delete(controller);
    if (getSuggestionEditor(controller) === editor) controller.close();
  };
  try { unsubscribe = controller.subscribe(render); detachDispose = controller.onDispose(dispose); render(controller.getState()); }
  catch (error) { dispose(); throw error; }
  return dispose;
};
