import { localize } from '@morfira-dev/wysiwyg-core';
import type { Editor, EditorSelectionHandle } from '@morfira-dev/wysiwyg-core';
import { codeBlockCommands } from '../../code-blocks/index.js';
import { createUIButton, createUIStatus } from '../shared/elements.js';
import { listenToUI } from '../shared/events.js';
import { codeBlockMessages } from './messages.js';
import type { CodeBlockFormController, CodeBlockFormOptions, CodeBlockMessageKey } from './types.js';

/** An owned native modal with revision-bound insertion and explicit target editing. */
export const createCodeBlockForm = (host: HTMLElement, editor: Editor, options: CodeBlockFormOptions = {}): CodeBlockFormController => {
  const root = editor.surface;
  const document = host.ownerDocument;
  if (document !== root.ownerDocument || root.contains(host) || host.contains(root)) throw new Error('Code form host must be outside the document.');
  if (options.label !== undefined && typeof options.label !== 'string') throw new TypeError('Code form label must be a string.');
  if (options.onError !== undefined && typeof options.onError !== 'function') throw new TypeError('Code onError must be a function.');
  const ownsHost = () => host.ownerDocument === document && host.isConnected
    && !root.contains(host) && !host.contains(root);
  const api = codeBlockCommands(editor);
  const label = options.label;
  const onError = options.onError;
  const element = document.createElement('dialog');
  element.className = 'mw-code-form';
  const field = document.createElement('label');
  const caption = document.createElement('span');
  const input = document.createElement('textarea');
  input.maxLength = 20000;
  input.rows = 12;
  input.spellcheck = false;
  input.autocomplete = 'off';
  field.append(caption, input);
  const languageField = document.createElement('label');
  const languageCaption = document.createElement('span');
  const language = document.createElement('select');
  for (const id of api.languages) {
    const option = document.createElement('option');
    option.value = option.textContent = id;
    language.append(option);
  }
  languageField.append(languageCaption, language);
  const status = createUIStatus(document, 'mw-code-status');
  const actions = document.createElement('div');
  actions.className = 'mw-code-actions';
  const apply = createUIButton(document);
  const remove = createUIButton(document);
  const closeButton = createUIButton(document);
  const copyButton = createUIButton(document);
  actions.append(apply, remove, copyButton, closeButton);
  element.append(languageField, field, status, actions);
  host.append(element);
  let disposed = false;
  let opened = false;
  let composing = false;
  let draftComposing = false;
  let applying = false;
  let ignoredCloseEvents = 0;
  let handle: EditorSelectionHandle | undefined;
  let target: HTMLElement | undefined;
  let initialHTML = '';
  let origin: HTMLElement | undefined;
  let statusKey: CodeBlockMessageKey | undefined;
  const cleanups: (() => void)[] = [];
  const text = (key: CodeBlockMessageKey) => localize(editor.getLocale(), key, codeBlockMessages);
  const owns = (node: HTMLElement) => api.get(node) !== undefined;
  let copyEpoch = 0;
  const release = () => {
    if (handle) editor.selection.release(handle);
    handle = undefined;
    target = undefined;
  };
  const physicalClose = () => {
    if (!element.open) return;
    ignoredCloseEvents++;
    element.close();
  };
  const close = (restoreFocus = true) => {
    if (!opened) return;
    opened = false;
    copyEpoch++;
    const previous = origin;
    origin = undefined;
    physicalClose();
    release();
    if (restoreFocus && ownsHost() && previous?.isConnected && !element.contains(previous)) previous.focus({ preventScroll: true });
  };
  const update = () => {
    if (disposed) return;
    if (!ownsHost()) { destroy(); return; }
    element.setAttribute('aria-label', label ?? text('ui.code.label'));
    caption.textContent = text('ui.code.source');
    apply.textContent = text('ui.code.apply');
    remove.textContent = text('ui.code.remove');
    closeButton.textContent = text('ui.code.close');
    languageCaption.textContent = text('ui.code.language');
    copyButton.textContent = text('ui.code.copy');
    input.disabled = language.disabled = editor.isReadOnly() || composing;
    apply.disabled = editor.isReadOnly() || composing || draftComposing;
    remove.hidden = !target;
    remove.disabled = editor.isReadOnly() || composing || draftComposing;
    status.textContent = statusKey ? text(statusKey) : '';
  };
  const refreshPreview = () => {
    if (disposed) return;
    statusKey = undefined;
    update();
  };
  const copy = async () => {
    if (disposed || !opened) return;
    if (!ownsHost()) { destroy(); return; }
    const epoch = ++copyEpoch;
    const source = input.value;
    try {
      const clipboard = document.defaultView?.navigator.clipboard;
      if (!clipboard?.writeText) throw new Error('Clipboard writing is unavailable.');
      await clipboard.writeText(source);
      if (disposed || !opened || epoch !== copyEpoch) return;
      statusKey = 'ui.code.copied';
    }
    catch (error) {
      if (disposed || !opened || epoch !== copyEpoch) return;
      statusKey = 'ui.code.copyFailed';
      try { onError?.(error); }
      catch { /* Report clipboard errors without creating an unhandled rejection. */ }
    }
    update();
  };
  const valid = () => !disposed && ownsHost() && opened && !composing && !draftComposing && !editor.isReadOnly() && !!handle
    && editor.selection.isCurrent(handle) && editor.getHTML() === initialHTML && (!target || owns(target));
  const open = (node?: HTMLElement) => {
    if (disposed || opened || composing || draftComposing || editor.isReadOnly() || !ownsHost()) return;
    if (typeof element.showModal !== 'function') throw new Error('Native dialogs are unavailable.');
    if (node !== undefined && !owns(node)) throw new TypeError('Choose an actual registered code block.');
    const before = editor.getHTML();
    const openingControl = document.activeElement instanceof document.defaultView!.HTMLElement ? document.activeElement as HTMLElement : undefined;
    if (node) {
      const native = document.getSelection();
      if (!native) return;
      const parent = node.parentNode!;
      const index = [...parent.childNodes].indexOf(node);
      native.setBaseAndExtent(parent, index, parent, index + 1);
      const selected = native.rangeCount === 1 ? native.getRangeAt(0) : undefined;
      if (disposed || !owns(node) || editor.getHTML() !== before || editor.isReadOnly() || composing
        || !selected || selected.startContainer !== parent || selected.startOffset !== index
        || selected.endContainer !== parent || selected.endOffset !== index + 1) return;
    }
    const next = editor.selection.capture();
    if (!next) return;
    handle = next;
    target = node;
    initialHTML = before;
    origin = openingControl;
    input.value = node?.textContent ?? '';
    language.value = node ? api.get(node)!.language : 'plaintext';
    statusKey = undefined;
    opened = true;
    refreshPreview();
    try {
      element.showModal();
      input.focus({ preventScroll: true });
    }
    catch (error) {
      close(false);
      throw error;
    }
  };
  const perform = (deleting: boolean) => {
    if (!ownsHost()) { destroy(); return; }
    if (!valid()) {
      statusKey = 'ui.code.stale';
      update();
      return;
    }
    if (!deleting && (input.value.length > 20000 || !api.languages.includes(language.value))) {
      statusKey = 'ui.code.invalid';
      update();
      return;
    }
    const currentHandle = handle!;
    const expected = editor.selection.getRange(currentHandle)!;
    const node = target;
    let changed = false;
    applying = true;
    try {
      physicalClose();
      if (!editor.selection.restore(currentHandle) || !valid()) return;
      editor.focus();
      const native = document.getSelection();
      const actual = native?.rangeCount === 1 ? native.getRangeAt(0) : undefined;
      if (!valid() || !actual || actual.startContainer !== expected.startContainer || actual.startOffset !== expected.startOffset
        || actual.endContainer !== expected.endContainer || actual.endOffset !== expected.endOffset) return;
      changed = deleting ? !!node && api.remove(node) : node ? api.update(node, { source: input.value, language: language.value }) : api.insert({ source: input.value, language: language.value });
    }
    catch (error) {
      if (!disposed) {
        statusKey = 'ui.code.invalid';
        onError?.(error);
      }
    }
    finally {
      applying = false;
      if (!disposed) {
        if (changed || !valid()) close(changed);
        else if (opened && host.isConnected) {
          element.showModal();
          input.focus();
          update();
        }
      }
    }
  };
  const destroy = () => {
    if (disposed) return;
    close(false);
    disposed = true;
    release();
    for (const stop of cleanups) stop();
    element.remove();
  };
  cleanups.push(
    listenToUI(input, 'input', refreshPreview),
    listenToUI(input, 'keydown', (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing) {
        event.preventDefault();
        perform(false);
      }
    }),
    listenToUI(input, 'compositionstart', () => { draftComposing = true; update(); }),
    listenToUI(input, 'compositionend', () => { draftComposing = false; update(); }),
    listenToUI(language, 'change', refreshPreview),
    listenToUI(copyButton, 'click', () => { void copy(); }),
    listenToUI(apply, 'click', () => perform(false)),
    listenToUI(remove, 'click', () => perform(true)),
    listenToUI(closeButton, 'click', () => close()),
    listenToUI(element, 'cancel', (event) => {
      event.preventDefault();
      close();
    }),
    listenToUI(element, 'close', () => {
      if (ignoredCloseEvents) ignoredCloseEvents--;
      else close();
    }),
    listenToUI(root, 'compositionstart', () => {
      composing = true;
      close(false);
    }),
    listenToUI(root, 'compositionend', () => {
      composing = false;
      update();
    }),
    editor.events.on('readonlychange', (readOnly) => {
      if (readOnly) { composing = false; draftComposing = false; close(false); }
      update();
    }),
    editor.events.on('localechange', () => {
      update();
      refreshPreview();
    }),
    editor.events.on('destroy', destroy),
    editor.subscribe((change) => {
      if (change.source === 'api') { composing = false; draftComposing = false; }
      if (!applying) close(false);
    }),
  );
  update();
  return { element, open, close: () => close(), isOpen: () => opened && element.open && !disposed,
    getValue: () => ({ source: input.value, language: language.value }),
    setValue: (value) => {
      if (disposed || !ownsHost()) throw new Error('Code form is unavailable or has been destroyed.');
      if (!value || typeof value !== 'object' || typeof value.source !== 'string' || value.source.length > 20000
        || !api.languages.includes(value.language ?? 'plaintext')) throw new TypeError('Invalid code draft.');
      input.value = value.source;
      language.value = value.language ?? 'plaintext';
      refreshPreview();
    },
    destroy };
};
