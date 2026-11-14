import type { Editor, EditorChange, EditorPlugin } from '@morfira-dev/wysiwyg-core';
import type { SlashOption, SuggestionController, SuggestionOption, SuggestionOptions, SuggestionState } from './types.js';
import type { Candidate, Kind, Request } from './engine.types.js';
import type { SlashAction } from '../slash/types.js';
import { anchorFor, detect, insertText, same } from './selection.js';
const owners = new WeakMap<object, Editor>();
export const getSuggestionEditor = <T extends SuggestionOption>(controller: SuggestionController<T>): Editor | undefined => owners.get(controller);
const queryCharacter = /^[\p{L}\p{N}\p{M}\p{Pc}-]$/u;
const controls = /[\u0000-\u001f\u007f\u2028\u2029]/;
const bounded = (value: unknown, minimum: number, maximum: number): value is string => typeof value === 'string' && value.length >= minimum && value.length <= maximum && !controls.test(value);
const results = <T extends SuggestionOption>(input: unknown, kind: Kind, actions: ReadonlyMap<string, SlashAction>): T[] | undefined => {
  if (!Array.isArray(input) || input.length > 1000)
    return;
  const ids = new Set<string>();
  const items: SuggestionOption[] = [];
  for (const value of input) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return;
    const { id, label, description, text, action } = value as Record<string, unknown>;
    if (!bounded(id, 1, 256) || ids.has(id) || !bounded(label, 1, 200) || (description !== undefined && !bounded(description, 0, 500)) || (kind === 'slash' && !((text !== undefined && action === undefined && bounded(text, 1, 20000)) || (action !== undefined && text === undefined && typeof action === 'string' && actions.has(action)))))
      return;
    ids.add(id);
    items.push({ id, label, ...(description !== undefined ? { description } : {}), ...(kind === 'slash' ? action !== undefined ? { action: action as string } : { text: text as string } : {}) });
  }
  return items as T[];
};
export const createSuggestions = <T extends SuggestionOption>(kind: Kind, options: SuggestionOptions<T>, actions: ReadonlyMap<string, SlashAction> = new Map()): EditorPlugin => {
  if (!options || typeof options !== 'object' || Array.isArray(options))
    throw new TypeError('Expected suggestion options.');
  const { provide, minQueryLength = kind === 'mentions' ? 1 : 0, maxItems = 20, debounceMs = 120 } = options;
  if (typeof provide !== 'function')
    throw new TypeError('Configure a suggestion provider.');
  for (const [name, value, low, high] of [['minQueryLength', minQueryLength, 0, 100], ['maxItems', maxItems, 1, 100], ['debounceMs', debounceMs, 0, 1000]] as const)
    if (!Number.isInteger(value) || value < low || value > high)
      throw new RangeError(`${name} is outside its supported integer range.`);
  return {
    name: kind, setup: (editor) => {
      let disposed = false;
      let composing = false;
      let mutating = false;
      let candidate: Candidate | undefined;
      let request: Request | undefined;
      let state: SuggestionState<T> = { status: 'closed', query: '', items: [], activeIndex: -1 };
      const listeners = new Set<(state: SuggestionState<T>) => void>();
      const disposal = new Set<() => void>();
      let generation = 0;
      let nativeEdit = false;
      let nativeTimer: ReturnType<typeof setTimeout> | undefined;
      let observer: MutationObserver | undefined;
      const active = () => {
        if (disposed)
          throw new Error('Suggestion controller has been disposed.');
      };
      const snapshot = (): SuggestionState<T> => ({ ...state, items: state.items.map((item) => ({ ...item })), ...(candidate ? { anchor: anchorFor(editor, candidate) } : {}) });
      const notify = () => {
        for (const listener of [...listeners]) {
          if (disposed)
            break;
          listener(snapshot());
        }
      };
      const cancelRequest = () => {
        const old = request; request = undefined; if (old?.timer !== undefined)
          clearTimeout(old.timer); old?.abort.abort();
      };
      const clearNative = () => {
        nativeEdit = false; if (nativeTimer !== undefined)
          clearTimeout(nativeTimer); nativeTimer = undefined;
      };
      const close = () => {
        const closing = ++generation;
        const changed = state.status !== 'closed';
        candidate = undefined;
        state = { status: 'closed', query: '', items: [], activeIndex: -1 };
        clearNative();
        cancelRequest();
        observer?.takeRecords();
        if (changed && !disposed && closing === generation)
          notify();
      };
      const valid = (): boolean => {
        if (!candidate || composing || editor.isReadOnly())
          return false;
        return same(candidate, detect(editor, kind, minQueryLength));
      };
      const ensureValid = () => {
        const records = observer?.takeRecords();
        if (candidate && ((!nativeEdit && !mutating && records?.length) || !valid()))
          close();
        return !!candidate;
      };
      const begin = (next: Candidate): boolean => {
        if (same(candidate, next) && state.status !== 'closed' && state.status !== 'error')
          return true;
        const starting = ++generation;
        cancelRequest();
        if (disposed || starting !== generation)
          return !disposed && state.status !== 'closed';
        candidate = next;
        const token: Request = { abort: new AbortController() };
        request = token;
        state = { status: 'loading', query: next.query, items: [], activeIndex: -1 };
        const current = () => !disposed && request === token && !token.abort.signal.aborted && candidate === next && valid();
        const fail = (error: 'provider-error' | 'invalid-results') => {
          if (!current()) {
            if (request === token && !disposed)
              close();
            return;
          } state = { status: 'error', query: next.query, items: [], activeIndex: -1, error }; notify();
        };
        token.timer = setTimeout(() => {
          token.timer = undefined;
          if (!current()) {
            if (request === token && !disposed)
              close();
            return;
          }
          void Promise.resolve().then(() => current() ? provide({ query: next.query, signal: token.abort.signal, limit: maxItems }) : undefined).then((value) => {
            if (!current()) {
              if (request === token && !disposed)
                close();
              return;
            }
            let items: T[] | undefined;
            try {
              items = results<T>(value, kind, actions);
            }
            catch {
              fail('invalid-results');
              return;
            }
            if (!items) {
              fail('invalid-results');
              return;
            }
            if (!current())
              return;
            const visible = items.slice(0, maxItems);
            state = { status: 'ready', query: next.query, items: visible, activeIndex: visible.length ? 0 : -1 };
            notify();
          }, () => fail('provider-error')).catch(() => { });
        }, debounceMs);
        notify();
        return true;
      };
      const processNative = () => {
        if (disposed || composing || editor.isReadOnly()) {
          close();
          return;
        }
        const next = detect(editor, kind, minQueryLength);
        if (next)
          begin(next);
        else
          close();
        observer?.takeRecords();
      };
      const markNative = () => {
        nativeEdit = true;
        if (nativeTimer !== undefined)
          clearTimeout(nativeTimer);
        nativeTimer = setTimeout(() => {
          nativeTimer = undefined; nativeEdit = false; observer?.takeRecords(); if (candidate && !valid())
            close();
        }, 0);
      };
      const eligible = (event: InputEvent) => ['deleteContentBackward', 'deleteContentForward'].includes(event.inputType) || (event.inputType === 'insertText' && !!event.data && [...event.data].every((character) => queryCharacter.test(character) || character === (kind === 'mentions' ? '@' : '/')));
      const api: SuggestionController<T> = {
        getState: () => { active(); ensureValid(); return snapshot(); },
        subscribe: (listener) => {
          active(); if (typeof listener !== 'function')
            throw new TypeError('Expected a suggestion listener.'); listeners.add(listener); return () => { listeners.delete(listener); };
        },
        onDispose: (listener) => {
          active(); if (typeof listener !== 'function')
            throw new TypeError('Expected a disposal listener.'); disposal.add(listener); return () => { disposal.delete(listener); };
        },
        open: () => {
          active(); observer?.takeRecords(); if (composing) {
            close();
            return false;
          } const next = detect(editor, kind, minQueryLength); if (!next) {
            close();
            return false;
          } return begin(next);
        },
        close: () => { active(); close(); },
        move: (direction) => {
          active(); if (direction !== -1 && direction !== 1)
            throw new TypeError('Direction must be -1 or 1.'); if (!ensureValid() || state.status !== 'ready' || !state.items.length)
            return; state = { ...state, activeIndex: (state.activeIndex + direction + state.items.length) % state.items.length }; notify();
        },
        choose: (id) => {
          active();
          if (!bounded(id, 1, 256))
            throw new TypeError('Expected a suggestion ID.');
          if (!ensureValid() || state.status !== 'ready' || !candidate || mutating)
            return false;
          const item = state.items.find((entry) => entry.id === id);
          if (!item)
            return false;
          const selected = candidate;
          const option = item as unknown as SlashOption;
          const action = kind === 'slash' && option.action !== undefined ? actions.get(option.action) : undefined;
          const text = kind === 'mentions' ? `@${item.label} ` : option.text ?? '';
          if ((editor.surface.textContent?.length ?? 0) - selected.text.length + text.length > 5000000)
            return false;
          const choosing = ++generation;
          candidate = undefined;
          state = { status: 'closed', query: '', items: [], activeIndex: -1 };
          clearNative();
          cancelRequest();
          observer?.takeRecords();
          if (disposed || choosing !== generation)
            return false;
          let changed = false;
          mutating = true;
          try {
            editor.transact(() => {
              if (composing || editor.isReadOnly() || !same(selected, detect(editor, kind, minQueryLength)))
                return; insertText(editor, selected, text); if (action) {
                  const result: unknown = action(editor);
                  if (result && (typeof result === 'object' || typeof result === 'function') && typeof (result as {
                    then?: unknown;
                  }).then === 'function') {
                    void Promise.resolve(result).catch(() => { });
                    throw new TypeError('Slash actions must be synchronous.');
                  }
                } changed = true;
            });
          }
          finally {
            mutating = false;
            observer?.takeRecords();
            if (!disposed)
              notify();
          }
          return changed;
        },
      };
      const unprovide = editor.providePlugin(kind, api);
      owners.set(api, editor);
      const beforeinput = (event: InputEvent) => {
        if (event.defaultPrevented)
          return; if (disposed || composing || event.isComposing || editor.isReadOnly() || !eligible(event)) {
            close();
            return;
          } markNative();
      };
      const input = (native: Event) => {
        const event = native as InputEvent; if (disposed || composing || event.isComposing || !eligible(event)) {
          close();
          return;
        } markNative(); processNative();
      };
      const keydown = (event: KeyboardEvent) => {
        if (disposed || event.defaultPrevented || state.status === 'closed')
          return;
        if (composing || event.isComposing || event.keyCode === 229 || editor.isReadOnly() || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
          close();
          return;
        }
        if (['ArrowUp', 'ArrowDown', 'Enter'].includes(event.key) && ensureValid() && state.status === 'ready' && state.items.length) {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (event.key === 'Enter')
            api.choose(state.items[state.activeIndex].id);
          else
            api.move(event.key === 'ArrowDown' ? 1 : -1);
        }
        else if (['Escape', 'Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Enter'].includes(event.key)) {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopImmediatePropagation();
          }
          close();
        }
      };
      const compositionstart = () => { composing = true; close(); };
      const compositionend = () => { composing = false; observer?.takeRecords(); };
      const blur = () => close();
      const interrupt = () => close();
      const changed = (change: EditorChange) => {
        if (disposed || mutating)
          return; if (change.source === 'api')
          close();
        else if (nativeEdit)
          processNative();
        else
          close();
      };
      const unsubscribe = editor.subscribe(changed);
      const unselect = editor.onSelectionChange(() => {
        if (!disposed && candidate && !mutating && !valid())
          close();
      });
      observer = new MutationObserver((records) => {
        if (records.length && !disposed && !mutating && !nativeEdit)
          close();
      });
      observer.observe(editor.surface, { childList: true, characterData: true, subtree: true });
      editor.surface.addEventListener('beforeinput', beforeinput, true);
      editor.surface.addEventListener('input', input, true);
      editor.surface.addEventListener('keydown', keydown, true);
      editor.surface.addEventListener('compositionstart', compositionstart, true);
      editor.surface.addEventListener('compositionend', compositionend, true);
      editor.surface.addEventListener('blur', blur);
      for (const type of ['paste', 'cut', 'drop'])
        editor.surface.addEventListener(type, interrupt, true);
      return () => {
        if (disposed)
          return;
        disposed = true;
        owners.delete(api);
        candidate = undefined;
        state = { status: 'closed', query: '', items: [], activeIndex: -1 };
        clearNative();
        cancelRequest();
        observer?.disconnect();
        unsubscribe();
        unselect();
        unprovide();
        listeners.clear();
        editor.surface.removeEventListener('beforeinput', beforeinput, true);
        editor.surface.removeEventListener('input', input, true);
        editor.surface.removeEventListener('keydown', keydown, true);
        editor.surface.removeEventListener('compositionstart', compositionstart, true);
        editor.surface.removeEventListener('compositionend', compositionend, true);
        editor.surface.removeEventListener('blur', blur);
        for (const type of ['paste', 'cut', 'drop'])
          editor.surface.removeEventListener(type, interrupt, true);
        const failures: unknown[] = [];
        for (const callback of [...disposal]) {
          try {
            callback();
          }
          catch (error) {
            failures.push(error);
          }
        }
        disposal.clear();
        if (failures.length)
          throw new AggregateError(failures, 'Suggestion disposal failed.');
      };
    }
  };
};
