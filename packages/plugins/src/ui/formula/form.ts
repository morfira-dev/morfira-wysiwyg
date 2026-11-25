import { localize } from '@morfira-dev/wysiwyg-core';
import type { Editor, EditorSelectionHandle } from '@morfira-dev/wysiwyg-core';
import { formulaCommands, formulaNodeName, parseFormula, renderFormula } from '../../formula/index.js';
import { createUIButton, createFormInput, createUIStatus } from '../shared/elements.js';
import { listenToUI } from '../shared/events.js';
import { formulaMessages } from './messages.js';
import type { FormulaFormController, FormulaFormOptions, FormulaMessageKey } from './types.js';

/** An owned native modal with revision-bound insertion and explicit target editing. */
export const createFormulaForm = (host: HTMLElement, editor: Editor, options: FormulaFormOptions = {}): FormulaFormController => {
  const root = editor.surface;
  const document = host.ownerDocument;
  if (document !== root.ownerDocument || root.contains(host) || host.contains(root)) throw new Error('Formula form host must be outside the document.');
  if (options.label !== undefined && typeof options.label !== 'string') throw new TypeError('Formula form label must be a string.');
  if (options.onError !== undefined && typeof options.onError !== 'function') throw new TypeError('Formula onError must be a function.');
  const api = formulaCommands(editor);
  const label = options.label;
  const onError = options.onError;
  const element = document.createElement('dialog');
  element.className = 'mw-formula-form';
  const { label: field, caption, input } = createFormInput(document, 'text');
  input.maxLength = 1024;
  input.autocomplete = 'off';
  input.spellcheck = false;
  const preview = document.createElement('div');
  preview.className = 'mw-formula-preview';
  const status = createUIStatus(document, 'mw-formula-status');
  const actions = document.createElement('div');
  actions.className = 'mw-formula-actions';
  const apply = createUIButton(document);
  const remove = createUIButton(document);
  const closeButton = createUIButton(document);
  actions.append(apply, remove, closeButton);
  element.append(field, preview, status, actions);
  host.append(element);
  let disposed = false;
  let opened = false;
  let composing = false;
  let applying = false;
  let ignoredCloseEvents = 0;
  let handle: EditorSelectionHandle | undefined;
  let target: HTMLElement | undefined;
  let initialHTML = '';
  let origin: HTMLElement | undefined;
  let statusKey: FormulaMessageKey | undefined;
  const cleanups: (() => void)[] = [];
  const text = (key: FormulaMessageKey) => localize(editor.getLocale(), key, formulaMessages);
  const owns = (node: HTMLElement) => root.contains(node) && node.localName === 'span'
    && node.namespaceURI === 'http://www.w3.org/1999/xhtml' && node.getAttribute('data-mw-node') === formulaNodeName;
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
    const previous = origin;
    origin = undefined;
    physicalClose();
    release();
    if (restoreFocus && previous?.isConnected && !element.contains(previous)) previous.focus({ preventScroll: true });
  };
  const update = () => {
    if (disposed) return;
    element.setAttribute('aria-label', label ?? text('ui.formula.label'));
    caption.textContent = text('ui.formula.source');
    apply.textContent = text('ui.formula.apply');
    remove.textContent = text('ui.formula.remove');
    closeButton.textContent = text('ui.formula.close');
    preview.setAttribute('aria-label', text('ui.formula.preview'));
    apply.disabled = editor.isReadOnly() || composing;
    remove.hidden = !target;
    remove.disabled = editor.isReadOnly() || composing;
    status.textContent = statusKey ? text(statusKey) : '';
  };
  const refreshPreview = () => {
    if (disposed) return;
    try {
      preview.replaceChildren(renderFormula(document, input.value, { display: 'block' }));
      statusKey = undefined;
    }
    catch {
      preview.replaceChildren();
      statusKey = input.value ? 'ui.formula.invalid' : undefined;
    }
    update();
  };
  const valid = () => !disposed && opened && !composing && !editor.isReadOnly() && !!handle
    && editor.selection.isCurrent(handle) && editor.getHTML() === initialHTML && (!target || owns(target));
  const open = (node?: HTMLElement) => {
    if (disposed || opened || composing || editor.isReadOnly() || !host.isConnected) return;
    if (typeof element.showModal !== 'function') throw new Error('Native dialogs are unavailable.');
    if (node !== undefined && !owns(node)) throw new TypeError('Choose an actual registered formula.');
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
    if (!valid()) {
      statusKey = 'ui.formula.stale';
      update();
      return;
    }
    if (!deleting) {
      try { parseFormula(input.value); }
      catch (error) {
        statusKey = 'ui.formula.invalid';
        update();
        onError?.(error);
        return;
      }
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
      changed = deleting ? !!node && api.remove(node) : node ? api.update(node, input.value) : api.insert(input.value);
    }
    catch (error) {
      if (!disposed) {
        statusKey = 'ui.formula.invalid';
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
      if (!event.defaultPrevented && event.key === 'Enter' && !event.isComposing && event.keyCode !== 229
        && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        perform(false);
      }
    }),
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
      if (readOnly) {
        composing = false;
        close(false);
      }
      update();
    }),
    editor.events.on('localechange', () => {
      update();
      refreshPreview();
    }),
    editor.events.on('destroy', destroy),
    editor.subscribe((change) => {
      if (change.source === 'api') composing = false;
      if (!applying) close(false);
    }),
  );
  update();
  return { element, open, close: () => close(), isOpen: () => opened && element.open && !disposed,
    getSource: () => input.value,
    setSource: (source) => {
      if (disposed) throw new Error('Formula form has been destroyed.');
      if (typeof source !== 'string' || source.length > 1024) throw new RangeError('Formula draft exceeds source limit.');
      input.value = source;
      refreshPreview();
    },
    destroy };
};
