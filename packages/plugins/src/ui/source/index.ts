import { localize } from '@morfira-dev/wysiwyg-core';
import type { Editor, EditorSelectionHandle } from '@morfira-dev/wysiwyg-core';
import { createUIButton, createUIStatus } from '../shared/elements.js';
import { listenToUI } from '../shared/events.js';
import { sourceEditorMessages } from './messages.js';
import type { SourceEditorController, SourceEditorMessageKey, SourceEditorOptions, SourceEditorPreview } from './types.js';
export { sourceEditorMessages } from './messages.js';
export type { SourceEditorController, SourceEditorOptions, SourceEditorPreview } from './types.js';

const maximumSourceLength = 5000000;
const checkedDraft = (value: unknown): string => {
  if (typeof value !== 'string' || value.length > maximumSourceLength) throw new TypeError('HTML source must be a string bounded to 5000000 UTF-16 units.');
  return value;
};
const sameRange = (left: Range, right: Range): boolean => left.startContainer === right.startContainer
  && left.startOffset === right.startOffset && left.endContainer === right.endContainer && left.endOffset === right.endOffset;

/** Whole-document source editing; normalization is inert until an explicit Apply. */
export const createSourceEditor = (host: HTMLElement, editor: Editor, options: SourceEditorOptions = {}): SourceEditorController => {
  const root = editor.surface;
  const document = root.ownerDocument;
  if (!host.isConnected || host.ownerDocument !== document || host.hasChildNodes() || root.contains(host) || host.contains(editor.element))
    throw new TypeError('Source editing requires an empty connected external host.');
  if (options.label !== undefined && typeof options.label !== 'string') throw new TypeError('Source editor label must be a string.');
  if (options.onError !== undefined && typeof options.onError !== 'function') throw new TypeError('Source editor onError must be a function.');
  const label = options.label;
  const onError = options.onError;
  const element = document.createElement('dialog');
  element.className = 'mw-source';
  const draftField = document.createElement('label');
  const draftCaption = document.createElement('span');
  const draft = document.createElement('textarea');
  draft.rows = 12;
  draft.maxLength = maximumSourceLength;
  draft.spellcheck = false;
  draft.autocomplete = 'off';
  draftField.append(draftCaption, draft);
  const previewField = document.createElement('label');
  const previewCaption = document.createElement('span');
  const normalized = document.createElement('textarea');
  normalized.rows = 8;
  normalized.readOnly = true;
  normalized.spellcheck = false;
  previewField.append(previewCaption, normalized);
  const status = createUIStatus(document, 'mw-source-status');
  const actions = document.createElement('div');
  actions.className = 'mw-source-actions';
  const check = createUIButton(document);
  const apply = createUIButton(document);
  const cancel = createUIButton(document);
  actions.append(check, apply, cancel);
  element.append(draftField, previewField, status, actions);
  host.append(element);
  let disposed = false;
  let opened = false;
  let applying = false;
  let composing = false;
  let draftComposing = false;
  let ignoredCloseEvents = 0;
  let handle: EditorSelectionHandle | undefined;
  let initialHTML = '';
  let origin: HTMLElement | undefined;
  let statusKey: SourceEditorMessageKey = 'ui.source.unchanged';
  const cleanups: (() => void)[] = [];
  const text = (key: SourceEditorMessageKey): string => localize(editor.getLocale(), key, sourceEditorMessages);
  const ownsHost = (): boolean => host.isConnected && host.ownerDocument === document && host.contains(element)
    && !root.contains(host) && !host.contains(editor.element);
  const physicalClose = (): void => {
    if (!element.open) return;
    ignoredCloseEvents++;
    element.close();
  };
  const release = (): void => {
    if (handle) editor.selection.release(handle);
    handle = undefined;
  };
  const close = (restoreFocus = true): void => {
    if (!opened) return;
    opened = false;
    const previous = origin;
    origin = undefined;
    physicalClose();
    release();
    if (restoreFocus && ownsHost() && previous?.isConnected && !element.contains(previous)) previous.focus({ preventScroll: true });
  };
  const destroy = (): void => {
    if (disposed) return;
    close(false);
    disposed = true;
    release();
    for (const cleanup of cleanups.splice(0).reverse()) cleanup();
    element.remove();
  };
  const refresh = (): void => {
    if (disposed) return;
    if (!ownsHost()) { destroy(); return; }
    element.setAttribute('aria-label', label ?? text('ui.source.title'));
    draftCaption.textContent = text('ui.source.draft');
    previewCaption.textContent = text('ui.source.preview');
    draft.setAttribute('aria-label', draftCaption.textContent);
    normalized.setAttribute('aria-label', previewCaption.textContent);
    check.textContent = text('ui.source.check');
    apply.textContent = text('ui.source.apply');
    cancel.textContent = text('ui.source.cancel');
    draft.disabled = editor.isReadOnly() || composing;
    check.disabled = apply.disabled = editor.isReadOnly() || composing || draftComposing;
    status.textContent = text(statusKey);
  };
  const notifyError = (error: unknown): void => {
    try { onError?.(error); }
    catch { /* Reporting application errors cannot mutate or escape the source draft. */ }
  };
  const preview = (): SourceEditorPreview | undefined => {
    if (disposed || !opened || composing || draftComposing) return;
    if (!ownsHost()) { destroy(); return; }
    try {
      const source = checkedDraft(draft.value);
      const html = editor.schema.documentHTML(editor.schema.parseHTML(source));
      const changed = source !== html;
      normalized.value = html;
      statusKey = changed ? 'ui.source.normalized' : 'ui.source.unchanged';
      refresh();
      return { html, changed };
    }
    catch (error) {
      normalized.value = '';
      statusKey = 'ui.source.invalid';
      refresh();
      notifyError(error);
    }
  };
  const valid = (): boolean => !disposed && ownsHost() && opened && !composing && !draftComposing && !editor.isReadOnly()
    && !!handle && editor.selection.isCurrent(handle) && editor.getHTML() === initialHTML;
  const newerOwnedSelection = (expected: Range): boolean => {
    const selection = document.getSelection();
    const range = selection?.rangeCount === 1 ? selection.getRangeAt(0) : undefined;
    return !!range && (range.startContainer === root || root.contains(range.startContainer))
      && (range.endContainer === root || root.contains(range.endContainer)) && !sameRange(expected, range);
  };
  const open = (): boolean => {
    if (!disposed && !ownsHost()) destroy();
    if (disposed || opened || composing || draftComposing || editor.isReadOnly() || !ownsHost()) return false;
    if (typeof element.showModal !== 'function') throw new Error('Native dialogs are unavailable.');
    const html = editor.getHTML();
    const openingControl = document.activeElement instanceof document.defaultView!.HTMLElement ? document.activeElement as HTMLElement : undefined;
    let captured = editor.selection.capture();
    if (!captured) {
      editor.focus();
      if (disposed || composing || editor.isReadOnly() || !ownsHost() || editor.getHTML() !== html) return false;
      const range = document.createRange();
      range.setStart(root, 0);
      range.collapse(true);
      const selection = document.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      if (editor.getHTML() !== html || editor.isReadOnly() || composing) return false;
      captured = editor.selection.capture();
    }
    if (!captured) return false;
    handle = captured;
    initialHTML = html;
    origin = openingControl;
    draft.value = normalized.value = html;
    opened = true;
    statusKey = 'ui.source.unchanged';
    refresh();
    try {
      element.showModal();
      if (!valid()) { close(false); return false; }
      draft.focus({ preventScroll: true });
      return valid();
    }
    catch (error) {
      close(false);
      throw error;
    }
  };
  const perform = (): void => {
    if (!ownsHost()) { destroy(); return; }
    const expected = handle ? editor.selection.getRange(handle) : undefined;
    if (!valid() || !expected || newerOwnedSelection(expected)) {
      statusKey = 'ui.source.stale';
      refresh();
      return;
    }
    const accepted = preview();
    if (!accepted || !valid()) return;
    if (accepted.html === initialHTML) { close(); return; }
    let changed = false;
    applying = true;
    try {
      physicalClose();
      if (!editor.selection.restore(handle!) || !valid()) return;
      editor.focus();
      const native = document.getSelection();
      const actual = native?.rangeCount === 1 ? native.getRangeAt(0) : undefined;
      if (!valid() || !actual || !sameRange(expected, actual)) return;
      editor.transact((surface) => {
        const selection = document.getSelection();
        const range = selection?.rangeCount === 1 ? selection.getRangeAt(0) : undefined;
        if (!valid() || !range || !sameRange(expected, range)) return;
        const parsed = editor.schema.parseHTML(accepted.html);
        if (!parsed.children.length) parsed.children.push({ type: 'element', tag: 'p', attributes: {}, children: [{ type: 'element', tag: 'br', attributes: {}, children: [] }] });
        const fragment = editor.schema.renderDocument(parsed);
        if (!valid()) return;
        surface.replaceChildren(fragment);
        const first = surface.firstChild?.nodeType === 1 ? surface.firstChild as HTMLElement : undefined;
        const ordinaryStart = first?.namespaceURI === 'http://www.w3.org/1999/xhtml' && /^(?:p|h[1-6])$/.test(first.localName)
          && !first.hasAttribute('data-mw-node') && first.getAttribute('contenteditable') !== 'false';
        const caret = document.createRange();
        // A root-child gap makes Firefox insert a separate paragraph on typing.
        // Stay before the ordinary body's children, never inside an atomic label.
        if (ordinaryStart && first) caret.setStart(first, 0);
        else caret.setStart(surface, 0);
        caret.collapse(true);
        selection?.removeAllRanges();
        selection?.addRange(caret);
        changed = true;
      }, { resetTyping: true });
    }
    catch (error) {
      if (!disposed) {
        statusKey = 'ui.source.invalid';
        notifyError(error);
      }
    }
    finally {
      applying = false;
      if (!disposed) {
        if (changed || !valid()) close(changed);
        else if (opened && ownsHost()) {
          statusKey = 'ui.source.stale';
          element.showModal();
          draft.focus({ preventScroll: true });
          refresh();
        }
      }
    }
  };
  cleanups.push(
    listenToUI(draft, 'input', () => { normalized.value = ''; statusKey = 'ui.source.pending'; refresh(); }),
    listenToUI(draft, 'compositionstart', () => { draftComposing = true; refresh(); }),
    listenToUI(draft, 'compositionend', () => { draftComposing = false; refresh(); }),
    listenToUI(draft, 'keydown', (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing) { event.preventDefault(); perform(); }
    }),
    listenToUI(check, 'click', () => { preview(); }),
    listenToUI(apply, 'click', perform),
    listenToUI(cancel, 'click', () => close()),
    listenToUI(element, 'cancel', (event) => { event.preventDefault(); close(); }),
    listenToUI(element, 'close', () => { if (ignoredCloseEvents) ignoredCloseEvents--; else close(); }),
    listenToUI(root, 'compositionstart', () => { composing = true; close(false); }),
    listenToUI(root, 'compositionend', () => { composing = false; refresh(); }),
    editor.events.on('readonlychange', (readOnly) => {
      if (readOnly) { composing = false; draftComposing = false; close(false); }
      refresh();
    }),
    editor.events.on('localechange', refresh),
    editor.events.on('destroy', destroy),
    editor.subscribe((change) => {
      if (change.source === 'api') { composing = false; draftComposing = false; }
      if (!applying) close(false);
    }),
  );
  refresh();
  return {
    element, open, close: () => close(), isOpen: () => {
      if (!disposed && !ownsHost()) destroy();
      return !disposed && opened && element.open;
    },
    getValue: () => draft.value,
    setValue: (value) => {
      if (!disposed && !ownsHost()) destroy();
      if (disposed) throw new Error('Source editor has been disposed or lost its external host.');
      draft.value = checkedDraft(value);
      normalized.value = '';
      statusKey = 'ui.source.pending';
      refresh();
    },
    preview, destroy,
  };
};
