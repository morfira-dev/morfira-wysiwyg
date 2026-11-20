import { localize } from '@morfira-dev/wysiwyg-core';
import type { Editor } from '@morfira-dev/wysiwyg-core';
import type { TableSelectionReader } from '../../tables/internal-types.js';
import { createFormSelection } from '../shared/selection.js';
import { createFormInput, createUIButton, createUIStatus } from '../shared/elements.js';
import { defaultCharacters, snapshotCharacters, validPanelLabel } from './catalog.js';
import { specialCharacterUIMessages } from './messages.js';
import { ordinaryCharacterRange } from './target.js';
import type { CharacterTarget } from './internal-types.js';
import type { SpecialCharacter, SpecialCharacterUIController, SpecialCharacterUIMessageKey, SpecialCharacterUIOptions } from './types.js';

export { specialCharacterUIMessages } from './messages.js';
export type { SpecialCharacter, SpecialCharacterUIController, SpecialCharacterUIMessageKey, SpecialCharacterUIOptions } from './types.js';

const sameRange = (range: Range, target: CharacterTarget): boolean => range.startContainer === target.start && range.startOffset === target.startOffset
  && range.endContainer === target.end && range.endOffset === target.endOffset;
const escapeText = (value: string): string => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export const createSpecialCharacterUI = (host: HTMLElement, editor: Editor, options: SpecialCharacterUIOptions = {}): SpecialCharacterUIController => {
  editor.getLocale();
  const root = editor.surface;
  const document = root.ownerDocument;
  const view = document.defaultView!;
  if (!host || host.ownerDocument !== document || !host.isConnected || host.childNodes.length || root.contains(host)
    || host.namespaceURI !== 'http://www.w3.org/1999/xhtml') throw new TypeError('Special characters need an empty connected external HTML host.');
  if (!options || typeof options !== 'object' || Array.isArray(options)
    || Object.keys(options).some((key) => !['label', 'characters', 'onError'].includes(key))) throw new TypeError('Expected special-character UI options.');
  if (options.label !== undefined && !validPanelLabel(options.label)) throw new TypeError('The panel label must be bounded literal text.');
  if (options.onError !== undefined && typeof options.onError !== 'function') throw new TypeError('The error handler must be a callback.');
  const custom = options.characters === undefined ? undefined : snapshotCharacters(options.characters);
  const label = options.label;
  const onError = options.onError;
  const message = (key: SpecialCharacterUIMessageKey): string => localize(editor.getLocale(), key, specialCharacterUIMessages);
  const element = document.createElement('section');
  element.className = 'mw-special-characters';
  element.setAttribute('role', 'group');
  const search = createFormInput(document, 'search');
  search.input.maxLength = 160;
  search.input.autocomplete = 'off';
  const grid = document.createElement('div');
  grid.className = 'mw-special-characters-grid';
  grid.setAttribute('role', 'group');
  const status = createUIStatus(document, 'mw-special-characters-status');
  element.append(search.label, grid, status);
  const saved = createFormSelection(editor);
  const cleanups: (() => void)[] = [];
  let target: CharacterTarget | undefined;
  let disposed = false;
  let composing = false;
  let inserting = false;
  let restoring = false;
  let generation = 0;
  let domRevision = 0;
  let activeID: string | undefined;
  let buttons: HTMLButtonElement[] = [];
  let visible: readonly SpecialCharacter[] = [];
  let statusKey: SpecialCharacterUIMessageKey | undefined;
  const report = (error: unknown): void => {
    try { onError?.(error); }
    catch { /* Application diagnostics cannot interrupt required cleanup. */ }
  };
  const documentMutation = (record: MutationRecord): boolean => record.type !== 'attributes' || record.target !== root;
  const observer = new view.MutationObserver((records) => {
    // Surface metadata (locale, placeholder, focus styling) is not persisted content.
    if (disposed || !records.some(documentMutation)) return;
    domRevision++;
    target = undefined;
    if (!disposed) updateDisabled();
  });
  const drain = (): number => {
    if (observer.takeRecords().some(documentMutation)) domRevision++;
    return domRevision;
  };
  const tableOwnsTarget = (): boolean => {
    const reader = editor.getPlugin<TableSelectionReader>('tables:selection');
    return !!reader?.()[0].some((cell) => root.contains(cell));
  };
  const current = (snapshot: CharacterTarget): boolean => !disposed && !composing && root.contentEditable !== 'false' && !editor.isReadOnly() && !tableOwnsTarget()
    && drain() === snapshot.revision && ordinaryCharacterRange(root, snapshot.range)
    && snapshot.range.startContainer === snapshot.start && snapshot.range.startOffset === snapshot.startOffset
    && snapshot.range.endContainer === snapshot.end && snapshot.range.endOffset === snapshot.endOffset;
  const updateDisabled = (): void => {
    const disabled = !target || !current(target);
    for (const button of buttons) button.disabled = disabled;
  };
  const capture = (): void => {
    if (disposed || inserting || restoring || composing || editor.isReadOnly()) return;
    const active = document.activeElement;
    if (active !== root && !root.contains(active)) return;
    saved.capture();
    const native = document.getSelection();
    if (!native || native.rangeCount !== 1 || tableOwnsTarget()) {
      target = undefined;
      updateDisabled();
      return;
    }
    const range = native.getRangeAt(0);
    if (!ordinaryCharacterRange(root, range)) target = undefined;
    else {
      target = { range: range.cloneRange(), start: range.startContainer, startOffset: range.startOffset,
        end: range.endContainer, endOffset: range.endOffset,
        backward: !range.collapsed && native.anchorNode === range.endContainer && native.anchorOffset === range.endOffset,
        revision: drain() };
    }
    statusKey = undefined;
    updateDisabled();
  };
  const renderStatus = (): void => {
    status.textContent = statusKey ? message(statusKey) : visible.length ? `${message('ui.specialCharacters.results')}: ${visible.length}` : message('ui.specialCharacters.empty');
  };
  const render = (): void => {
    const focusedCharacter = buttons.find((button) => button === document.activeElement)?.dataset.mwCharacter;
    element.setAttribute('aria-label', label ?? message('ui.specialCharacters.label'));
    search.caption.textContent = message('ui.specialCharacters.search');
    grid.setAttribute('aria-label', message('ui.specialCharacters.characters'));
    const query = search.input.value.trim().toLowerCase();
    visible = (custom ?? defaultCharacters(message)).filter((character) => !query
      || `${character.label} ${character.id} ${character.text}`.toLowerCase().includes(query));
    if (!visible.some((character) => character.id === activeID)) activeID = visible[0]?.id;
    buttons = visible.map((character) => {
      const button = createUIButton(document, 'mw-special-character');
      button.dataset.mwCharacter = character.id;
      button.textContent = character.text;
      const name = `${message('ui.specialCharacters.insert')}: ${character.label} (${character.text})`;
      button.setAttribute('aria-label', name);
      button.title = name;
      button.tabIndex = character.id === activeID ? 0 : -1;
      return button;
    });
    grid.replaceChildren(...buttons);
    updateDisabled();
    renderStatus();
    if (focusedCharacter) {
      const next = buttons.find((button) => button.dataset.mwCharacter === focusedCharacter && !button.disabled);
      next?.focus({ preventScroll: true });
    }
  };
  const refresh = (): void => {
    if (disposed) throw new Error('Special-character UI has been destroyed.');
    capture();
    render();
  };
  const invalidate = (): void => {
    generation++;
    target = undefined;
    statusKey = undefined;
    if (!disposed) {
      updateDisabled();
      renderStatus();
    }
  };
  const nativeMatches = (snapshot: CharacterTarget): boolean => {
    const native = document.getSelection();
    return native?.rangeCount === 1 && sameRange(native.getRangeAt(0), snapshot);
  };
  const restore = (snapshot: CharacterTarget, revision: number): boolean => {
    restoring = true;
    try {
      return saved.restore(() => generation === revision && current(snapshot) && nativeMatches(snapshot), true)
        && generation === revision && current(snapshot) && nativeMatches(snapshot);
    }
    finally { restoring = false; }
  };
  const insert = (event: MouseEvent): void => {
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    if (event.defaultPrevented || index < 0 || !element.isConnected || element.ownerDocument !== document
      || root.contains(element) || !target || !current(target)) return;
    const character = visible[index];
    const snapshot = target;
    const revision = generation;
    event.preventDefault();
    event.stopPropagation();
    try {
      if (!restore(snapshot, revision)) return;
      inserting = true;
      editor.transact(() => {
        if (generation !== revision || !current(snapshot) || !nativeMatches(snapshot)) return;
        // Nested core insertion shares this transaction without another focus callback.
        editor.insertHTML(escapeText(character.text));
      });
      statusKey = undefined;
    }
    catch (error) {
      statusKey = 'ui.specialCharacters.invalid';
      report(error);
    }
    finally {
      inserting = false;
      if (!disposed) {
        capture();
        updateDisabled();
        renderStatus();
      }
    }
  };
  const keyboard = (event: KeyboardEvent): void => {
    if (event.defaultPrevented) return;
    if (event.isComposing || event.keyCode === 229) {
      if (event.key === 'Enter' || event.key === ' ') event.preventDefault();
      return;
    }
    if (event.key === 'Escape') {
      if (target && current(target)) {
        event.preventDefault();
        event.stopPropagation();
        restore(target, generation);
      }
      return;
    }
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    if (index < 0 || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    let next = index;
    if (event.key === 'ArrowLeft') next = Math.max(0, index - 1);
    if (event.key === 'ArrowRight') next = Math.min(buttons.length - 1, index + 1);
    if (event.key === 'ArrowUp') next = Math.max(0, index - 8);
    if (event.key === 'ArrowDown') next = Math.min(buttons.length - 1, index + 8);
    if (event.key === 'Home') next = event.ctrlKey || event.metaKey ? 0 : Math.floor(index / 8) * 8;
    if (event.key === 'End') next = event.ctrlKey || event.metaKey ? buttons.length - 1 : Math.min(buttons.length - 1, Math.floor(index / 8) * 8 + 7);
    activeID = visible[next].id;
    buttons.forEach((button, position) => { button.tabIndex = position === next ? 0 : -1; });
    buttons[next].focus();
  };
  const pointer = (event: PointerEvent): void => {
    capture();
    if (event.target instanceof view.Element && event.target.closest('button') && event.button === 0) event.preventDefault();
  };
  const focusButton = (event: FocusEvent): void => {
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    if (index < 0) return;
    activeID = visible[index].id;
    buttons.forEach((button, position) => { button.tabIndex = position === index ? 0 : -1; });
  };
  const listen = (owner: EventTarget, type: string, callback: EventListener): void => {
    owner.addEventListener(type, callback);
    cleanups.push(() => owner.removeEventListener(type, callback));
  };
  const destroy = (): void => {
    if (disposed) return;
    disposed = true;
    generation++;
    target = undefined;
    observer.disconnect();
    const errors: unknown[] = [];
    for (const stop of [...cleanups.splice(0).reverse(), () => saved.destroy(), () => element.remove()]) {
      try { stop(); }
      catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, 'Special-character cleanup failed.');
  };
  try {
    observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true });
    listen(grid, 'click', insert as EventListener);
    listen(element, 'keydown', keyboard as EventListener);
    listen(element, 'pointerdown', pointer as EventListener);
    listen(grid, 'focusin', focusButton as EventListener);
    listen(search.input, 'input', () => { statusKey = undefined; render(); });
    listen(root, 'focusin', capture);
    listen(root, 'pointerup', capture);
    listen(root, 'compositionstart', () => { composing = true; invalidate(); });
    listen(root, 'compositionend', () => { composing = false; invalidate(); });
    cleanups.push(editor.onSelectionChange(capture));
    cleanups.push(editor.subscribe((change) => {
      if (change.source === 'api') {
        composing = false;
        invalidate();
      }
      else capture();
    }));
    cleanups.push(editor.events.on('readonlychange', () => {
      composing = false;
      invalidate();
    }));
    cleanups.push(editor.events.on('localechange', refresh));
    cleanups.push(editor.events.on('destroy', destroy));
    host.append(element);
    refresh();
  }
  catch (error) {
    try { destroy(); }
    catch { /* Preserve setup error after every owned cleanup was attempted. */ }
    throw error;
  }
  return { element, refresh, destroy };
};
