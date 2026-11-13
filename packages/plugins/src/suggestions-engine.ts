import type { Editor, EditorChange, EditorPlugin } from '@morfira-dev/wysiwyg-core';
import type { MentionOption, SlashOption, SuggestionAnchor, SuggestionController, SuggestionOption, SuggestionOptions, SuggestionState } from './suggestions-types.js';

type Kind = 'mentions' | 'slash';
interface Point { node: Text; offset: number; }
interface Leaf { node: Text; from: number; to: number; }
interface Candidate { query: string; text: string; block: HTMLElement; start: Point; end: Point; leaves: Leaf[]; }
interface Request { abort: AbortController; timer?: ReturnType<typeof setTimeout>; }
const owners = new WeakMap<object, Editor>();
export const getSuggestionEditor = <T extends SuggestionOption>(controller: SuggestionController<T>): Editor | undefined => owners.get(controller);
const blocks = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'ul', 'ol', 'li', 'table', 'caption', 'colgroup', 'col', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'figure', 'figcaption']);
const barriers = new Set(['br', 'img', 'hr', 'a', 'code']);
const queryCharacter = /^[\p{L}\p{N}\p{M}\p{Pc}-]$/u;
const queryText = /^[\p{L}\p{N}\p{M}\p{Pc}-]*$/u;
const controls = /[\u0000-\u001f\u007f\u2028\u2029]/;
const parent = (node: Node): Element | null => node.nodeType === 1 ? node as Element : node.parentElement;
const ancestor = (root: HTMLElement, node: Node, selector: string): HTMLElement | undefined => {
  let element = parent(node);
  while (element && element !== root) { if (element.matches(selector)) return element as HTMLElement; element = element.parentElement; }
};
const boundary = (node: Node): boolean => node.nodeType === 1 && (blocks.has((node as Element).localName) || barriers.has((node as Element).localName));
const deepest = (node: Node, last: boolean): Node => {
  let visits = 0;
  while (!boundary(node) && (last ? node.lastChild : node.firstChild) && visits++ < 1024) node = (last ? node.lastChild : node.firstChild)!;
  return node;
};
const previous = (node: Node, root: Node): Node | undefined => {
  if (node === root) return;
  if (node.previousSibling) return deepest(node.previousSibling, true);
  return node.parentNode && node.parentNode !== root ? node.parentNode : undefined;
};
const following = (node: Node, root: Node): Node | undefined => {
  let visits = 0;
  while (node !== root && visits++ < 1024) { if (node.nextSibling) return deepest(node.nextSibling, false); if (!node.parentNode) return; node = node.parentNode; }
};
const nextCharacter = (block: HTMLElement, caret: Range): string | undefined => {
  let node: Node | undefined;
  if (caret.startContainer.nodeType === 3) {
    const next = (caret.startContainer as Text).data.slice(caret.startOffset, caret.startOffset + 2);
    if (next) return String.fromCodePoint(next.codePointAt(0)!);
    node = following(caret.startContainer, block);
  } else { const child = caret.startContainer.childNodes[caret.startOffset]; node = child ? deepest(child, false) : following(caret.startContainer, block); }
  let visits = 0;
  while (node && visits++ < 2048) {
    if (boundary(node)) return '';
    if (node.nodeType === 3 && node.textContent) return String.fromCodePoint(node.textContent.codePointAt(0)!);
    node = following(node, block);
  }
  return node ? undefined : '';
};
const liveCaret = (editor: Editor): Range | undefined => {
  const document = editor.surface.ownerDocument; const active = document.activeElement;
  if (active !== editor.surface && (!active || !editor.surface.contains(active))) return;
  const selection = document.getSelection(); if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (range.collapsed && editor.surface.contains(range.startContainer) && editor.surface.contains(range.endContainer)) return range;
};
const detect = (editor: Editor, kind: Kind, minimum: number): Candidate | undefined => {
  if (editor.isReadOnly()) return;
  const caret = liveCaret(editor); if (!caret || ancestor(editor.surface, caret.startContainer, 'a,code,pre,figure,figcaption')) return;
  const block = ancestor(editor.surface, caret.startContainer, 'p,h1,h2,h3,h4,h5,h6,li,blockquote'); if (!block) return;
  if (kind === 'slash' && (block.localName !== 'p' || ancestor(editor.surface, block, 'li,blockquote,pre,code,a,figure,figcaption'))) return;
  const after = nextCharacter(block, caret); if (after === undefined || (after && queryCharacter.test(after))) return;
  const leaves: Leaf[] = []; let remaining = 103; let truncated = false;
  const add = (text: Text, to: number) => { const from = Math.max(0, to - remaining); if (to > from) { leaves.unshift({ node: text, from, to }); remaining -= to - from; } if (from) truncated = true; };
  let node: Node | undefined;
  if (caret.startContainer.nodeType === 3) { add(caret.startContainer as Text, caret.startOffset); node = previous(caret.startContainer, block); }
  else { const child = caret.startContainer.childNodes[caret.startOffset - 1]; node = child ? deepest(child, true) : previous(caret.startContainer, block); }
  let visits = 0;
  while (node && remaining && !truncated && visits++ < 2048) { if (boundary(node)) break; if (node.nodeType === 3) add(node as Text, (node as Text).length); node = previous(node, block); }
  if ((!remaining && node) || visits >= 2048) truncated = true;
  const atStart = !node && !truncated;
  const prefix = leaves.map((leaf) => leaf.node.data.slice(leaf.from, leaf.to)).join('');
  const trigger = kind === 'mentions' ? '@' : '/'; const from = prefix.lastIndexOf(trigger); if (from < 0) return;
  if (kind === 'slash' ? !atStart || from !== 0 : from === 0 ? truncated : !/[\s([{]/u.test(prefix[from - 1])) return;
  const query = prefix.slice(from + 1); if (query.length < minimum || query.length > 100 || !queryText.test(query)) return;
  let skip = from; let first = 0;
  while (first < leaves.length && skip >= leaves[first].to - leaves[first].from) { skip -= leaves[first].to - leaves[first].from; first++; }
  if (!leaves[first]) return;
  const relevant = leaves.slice(first); relevant[0] = { ...relevant[0], from: relevant[0].from + skip };
  const last = relevant.at(-1)!;
  return { query, text: trigger + query, block, leaves: relevant, start: { node: relevant[0].node, offset: relevant[0].from }, end: { node: last.node, offset: last.to } };
};
const same = (a: Candidate | undefined, b: Candidate | undefined): boolean => !!a && !!b && a.query === b.query && a.block === b.block && a.start.node === b.start.node && a.start.offset === b.start.offset && a.end.node === b.end.node && a.end.offset === b.end.offset;
const rangeFor = (editor: Editor, candidate: Candidate): Range => {
  const range = editor.surface.ownerDocument.createRange(); range.setStart(candidate.start.node, candidate.start.offset); range.setEnd(candidate.end.node, candidate.end.offset); return range;
};
const anchorFor = (editor: Editor, candidate: Candidate): SuggestionAnchor | undefined => {
  if (!editor.surface.contains(candidate.start.node) || !editor.surface.contains(candidate.end.node)) return;
  const range = rangeFor(editor, candidate); const caret = range.cloneRange(); caret.collapse(false);
  let rect = caret.getBoundingClientRect(); let x = rect.left;
  if (!rect.height) { const rects = range.getClientRects(); if (!rects.length) return; rect = rects[rects.length - 1]; x = rect.right; }
  if (!rect.height || ![x, rect.top, rect.height].every(Number.isFinite)) return;
  return { x, y: rect.top, width: 0, height: rect.height };
};
const bounded = (value: unknown, minimum: number, maximum: number): value is string => typeof value === 'string' && value.length >= minimum && value.length <= maximum && !controls.test(value);
const results = <T extends SuggestionOption>(input: unknown, kind: Kind): T[] | undefined => {
  if (!Array.isArray(input) || input.length > 1000) return;
  const ids = new Set<string>(); const items: SuggestionOption[] = [];
  for (const value of input) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const { id, label, description, text } = value as Record<string, unknown>;
    if (!bounded(id, 1, 256) || ids.has(id) || !bounded(label, 1, 200) || (description !== undefined && !bounded(description, 0, 500)) || (kind === 'slash' && !bounded(text, 1, 20000))) return;
    ids.add(id); items.push({ id, label, ...(description !== undefined ? { description } : {}), ...(kind === 'slash' ? { text: text as string } : {}) });
  }
  return items as T[];
};
const insertText = (editor: Editor, candidate: Candidate, text: string) => {
  const leaves = candidate.leaves; const first = leaves[0]; const last = leaves.at(-1)!;
  if (first.node === last.node) first.node.replaceData(first.from, first.to - first.from, text);
  else {
    first.node.data = first.node.data.slice(0, first.from) + text;
    for (const leaf of leaves.slice(1, -1)) leaf.node.data = '';
    last.node.data = last.node.data.slice(last.to);
  }
  const caret = editor.surface.ownerDocument.createRange(); caret.setStart(first.node, first.from + text.length); caret.collapse(true);
  candidate.block.normalize(); const selection = editor.surface.ownerDocument.getSelection(); selection?.removeAllRanges(); selection?.addRange(caret);
};

export const createSuggestions = <T extends SuggestionOption>(kind: Kind, options: SuggestionOptions<T>): EditorPlugin => {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Expected suggestion options.');
  const { provide, minQueryLength = kind === 'mentions' ? 1 : 0, maxItems = 20, debounceMs = 120 } = options;
  if (typeof provide !== 'function') throw new TypeError('Configure a suggestion provider.');
  for (const [name, value, low, high] of [['minQueryLength', minQueryLength, 0, 100], ['maxItems', maxItems, 1, 100], ['debounceMs', debounceMs, 0, 1000]] as const) if (!Number.isInteger(value) || value < low || value > high) throw new RangeError(`${name} is outside its supported integer range.`);
  return { name: kind, setup: (editor) => {
    let disposed = false; let composing = false; let mutating = false; let candidate: Candidate | undefined; let request: Request | undefined;
    let state: SuggestionState<T> = { status: 'closed', query: '', items: [], activeIndex: -1 };
    const listeners = new Set<(state: SuggestionState<T>) => void>(); const disposal = new Set<() => void>();
    let generation = 0; let nativeEdit = false; let nativeTimer: ReturnType<typeof setTimeout> | undefined; let observer: MutationObserver | undefined;
    const active = () => { if (disposed) throw new Error('Suggestion controller has been disposed.'); };
    const snapshot = (): SuggestionState<T> => ({ ...state, items: state.items.map((item) => ({ ...item })), ...(candidate ? { anchor: anchorFor(editor, candidate) } : {}) });
    const notify = () => { for (const listener of [...listeners]) { if (disposed) break; listener(snapshot()); } };
    const cancelRequest = () => { const old = request; request = undefined; if (old?.timer !== undefined) clearTimeout(old.timer); old?.abort.abort(); };
    const clearNative = () => { nativeEdit = false; if (nativeTimer !== undefined) clearTimeout(nativeTimer); nativeTimer = undefined; };
    const close = () => {
      const closing = ++generation; const changed = state.status !== 'closed'; candidate = undefined; state = { status: 'closed', query: '', items: [], activeIndex: -1 }; clearNative(); cancelRequest(); observer?.takeRecords(); if (changed && !disposed && closing === generation) notify();
    };
    const valid = (): boolean => {
      if (!candidate || composing || editor.isReadOnly()) return false;
      return same(candidate, detect(editor, kind, minQueryLength));
    };
    const ensureValid = () => {
      const records = observer?.takeRecords();
      if (candidate && ((!nativeEdit && !mutating && records?.length) || !valid())) close();
      return !!candidate;
    };
    const begin = (next: Candidate): boolean => {
      if (same(candidate, next) && state.status !== 'closed' && state.status !== 'error') return true;
      const starting = ++generation; cancelRequest();
      if (disposed || starting !== generation) return !disposed && state.status !== 'closed';
      candidate = next;
      const token: Request = { abort: new AbortController() }; request = token;
      state = { status: 'loading', query: next.query, items: [], activeIndex: -1 };
      const current = () => !disposed && request === token && !token.abort.signal.aborted && candidate === next && valid();
      const fail = (error: 'provider-error' | 'invalid-results') => { if (!current()) { if (request === token && !disposed) close(); return; } state = { status: 'error', query: next.query, items: [], activeIndex: -1, error }; notify(); };
      token.timer = setTimeout(() => {
        token.timer = undefined;
        if (!current()) { if (request === token && !disposed) close(); return; }
        void Promise.resolve().then(() => current() ? provide({ query: next.query, signal: token.abort.signal, limit: maxItems }) : undefined).then((value) => {
          if (!current()) { if (request === token && !disposed) close(); return; }
          let items: T[] | undefined;
          try { items = results<T>(value, kind); } catch { fail('invalid-results'); return; }
          if (!items) { fail('invalid-results'); return; }
          if (!current()) return;
          const visible = items.slice(0, maxItems); state = { status: 'ready', query: next.query, items: visible, activeIndex: visible.length ? 0 : -1 }; notify();
        }, () => fail('provider-error')).catch(() => { /* A consumer notification error must not create an unhandled owned-provider rejection. */ });
      }, debounceMs);
      notify(); return true;
    };
    const processNative = () => {
      if (disposed || composing || editor.isReadOnly()) { close(); return; }
      const next = detect(editor, kind, minQueryLength); if (next) begin(next); else close(); observer?.takeRecords();
    };
    const markNative = () => {
      nativeEdit = true; if (nativeTimer !== undefined) clearTimeout(nativeTimer);
      nativeTimer = setTimeout(() => { nativeTimer = undefined; nativeEdit = false; observer?.takeRecords(); if (candidate && !valid()) close(); }, 0);
    };
    const eligible = (event: InputEvent) => ['deleteContentBackward', 'deleteContentForward'].includes(event.inputType) || (event.inputType === 'insertText' && !!event.data && [...event.data].every((character) => queryCharacter.test(character) || character === (kind === 'mentions' ? '@' : '/')));
    const api: SuggestionController<T> = {
      getState: () => { active(); ensureValid(); return snapshot(); },
      subscribe: (listener) => { active(); if (typeof listener !== 'function') throw new TypeError('Expected a suggestion listener.'); listeners.add(listener); return () => { listeners.delete(listener); }; },
      onDispose: (listener) => { active(); if (typeof listener !== 'function') throw new TypeError('Expected a disposal listener.'); disposal.add(listener); return () => { disposal.delete(listener); }; },
      open: () => { active(); observer?.takeRecords(); if (composing) { close(); return false; } const next = detect(editor, kind, minQueryLength); if (!next) { close(); return false; } return begin(next); },
      close: () => { active(); close(); },
      move: (direction) => { active(); if (direction !== -1 && direction !== 1) throw new TypeError('Direction must be -1 or 1.'); if (!ensureValid() || state.status !== 'ready' || !state.items.length) return; state = { ...state, activeIndex: (state.activeIndex + direction + state.items.length) % state.items.length }; notify(); },
      choose: (id) => {
        active(); if (!bounded(id, 1, 256)) throw new TypeError('Expected a suggestion ID.');
        if (!ensureValid() || state.status !== 'ready' || !candidate || mutating) return false;
        const item = state.items.find((entry) => entry.id === id); if (!item) return false;
        const selected = candidate; const text = kind === 'mentions' ? `@${item.label} ` : (item as unknown as SlashOption).text;
        if ((editor.surface.textContent?.length ?? 0) - selected.text.length + text.length > 5_000_000) return false;
        const choosing = ++generation; candidate = undefined; state = { status: 'closed', query: '', items: [], activeIndex: -1 }; clearNative(); cancelRequest(); observer?.takeRecords();
        if (disposed || choosing !== generation) return false;
        let changed = false; mutating = true;
        try {
          editor.transact(() => { if (composing || editor.isReadOnly() || !same(selected, detect(editor, kind, minQueryLength))) return; insertText(editor, selected, text); changed = true; });
        } finally { mutating = false; observer?.takeRecords(); if (!disposed) notify(); }
        return changed;
      },
    };
    const unprovide = editor.providePlugin(kind, api); owners.set(api, editor);
    const beforeinput = (event: InputEvent) => { if (event.defaultPrevented) return; if (disposed || composing || event.isComposing || editor.isReadOnly() || !eligible(event)) { close(); return; } markNative(); };
    const input = (native: Event) => { const event = native as InputEvent; if (disposed || composing || event.isComposing || !eligible(event)) { close(); return; } markNative(); processNative(); };
    const keydown = (event: KeyboardEvent) => {
      if (disposed || event.defaultPrevented || state.status === 'closed') return;
      if (composing || event.isComposing || editor.isReadOnly() || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) { close(); return; }
      if (['ArrowUp', 'ArrowDown', 'Enter'].includes(event.key) && ensureValid() && state.status === 'ready' && state.items.length) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (event.key === 'Enter') api.choose(state.items[state.activeIndex].id); else api.move(event.key === 'ArrowDown' ? 1 : -1);
      } else if (['Escape', 'Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Enter'].includes(event.key)) {
        if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); } close();
      }
    };
    const compositionstart = () => { composing = true; close(); };
    const compositionend = () => { composing = false; observer?.takeRecords(); };
    const blur = () => close(); const interrupt = () => close();
    const changed = (change: EditorChange) => { if (disposed || mutating) return; if (change.source === 'api') close(); else if (nativeEdit) processNative(); else close(); };
    const unsubscribe = editor.subscribe(changed);
    const unselect = editor.onSelectionChange(() => { if (!disposed && candidate && !mutating && !valid()) close(); });
    observer = new MutationObserver((records) => { if (records.length && !disposed && !mutating && !nativeEdit) close(); });
    observer.observe(editor.surface, { childList: true, characterData: true, subtree: true });
    editor.surface.addEventListener('beforeinput', beforeinput, true); editor.surface.addEventListener('input', input, true); editor.surface.addEventListener('keydown', keydown, true);
    editor.surface.addEventListener('compositionstart', compositionstart, true); editor.surface.addEventListener('compositionend', compositionend, true); editor.surface.addEventListener('blur', blur);
    for (const type of ['paste', 'cut', 'drop']) editor.surface.addEventListener(type, interrupt, true);
    return () => {
      if (disposed) return; disposed = true; owners.delete(api); candidate = undefined; state = { status: 'closed', query: '', items: [], activeIndex: -1 }; clearNative(); cancelRequest(); observer?.disconnect(); unsubscribe(); unselect(); unprovide(); listeners.clear();
      editor.surface.removeEventListener('beforeinput', beforeinput, true); editor.surface.removeEventListener('input', input, true); editor.surface.removeEventListener('keydown', keydown, true);
      editor.surface.removeEventListener('compositionstart', compositionstart, true); editor.surface.removeEventListener('compositionend', compositionend, true); editor.surface.removeEventListener('blur', blur);
      for (const type of ['paste', 'cut', 'drop']) editor.surface.removeEventListener(type, interrupt, true);
      const failures: unknown[] = []; for (const callback of [...disposal]) { try { callback(); } catch (error) { failures.push(error); } } disposal.clear();
      if (failures.length) throw new AggregateError(failures, 'Suggestion disposal failed.');
    };
  } };
};
