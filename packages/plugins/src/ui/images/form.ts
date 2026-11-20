import { localize } from '@morfira-dev/wysiwyg-core';
import type { Editor } from '@morfira-dev/wysiwyg-core';
import { createImageFormBase } from './form-base.js';
import { createImageUploadUI } from './upload.js';
import { createImageDialog } from './dialog.js';
import { imageFormMessages } from './messages.js';
import { listenToUI } from '../shared/events.js';
import type { ImageFormController, ImageFormOptions } from './types.js';

const dialogMessages = {
  en: { 'ui.images.close': 'Close image dialog' },
  ru: { 'ui.images.close': 'Закрыть окно изображения' },
};

export const createImageForm = (host: HTMLElement, editor: Editor, options: ImageFormOptions = {}): ImageFormController => {
  const presentation = options.presentation ?? 'inline';
  if (presentation !== 'inline' && presentation !== 'dialog') throw new TypeError('Image presentation must be inline or dialog.');
  if (presentation === 'dialog' && (!host.isConnected || typeof host.ownerDocument.defaultView?.HTMLDialogElement?.prototype.showModal !== 'function'))
    throw new TypeError('Image dialogs need a connected host and native modal dialog support.');
  const base = createImageFormBase(host, editor, options, createImageUploadUI);
  const { element, refresh, getValues, setValues } = base;
  if (presentation === 'inline') return { element, refresh, getValues, setValues, open: base.open, close: base.close, isOpen: base.isOpen, destroy: base.destroy };
  let disposed = false;
  let command = false;
  let changed = false;
  let alignment = false;
  const dialog = createImageDialog(host, element, {
    inspect: refresh,
    cancel: base.cancelUpload,
    label: () => options.label ?? localize(editor.getLocale(), 'ui.images.label', imageFormMessages),
    closeLabel: () => localize(editor.getLocale(), 'ui.images.close', dialogMessages),
  });
  const finish = () => {
    if (disposed) return;
    if (changed && !alignment) dialog.close();
    else dialog.resume();
    command = false;
    changed = false;
    alignment = false;
  };
  const beforeCommand = (event: Event) => {
    if (disposed || command || !dialog.isOpen()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (event instanceof KeyboardEvent && (event.defaultPrevented || event.key !== 'Enter' || event.isComposing
      || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)) return;
    const target = event.target as Element;
    if (event.type === 'keydown' && (!(target instanceof HTMLInputElement) || ['file', 'checkbox'].includes(target.type))) return;
    if (event.type === 'click' && !target.closest('button')) return;
    if (event.type === 'change' && (!(target instanceof HTMLInputElement) || target.type !== 'file')) return;
    command = true;
    changed = false;
    alignment = Boolean(target.closest('[data-mw-image-alignment]'));
    base.suspendFocus(dialog.suspend);
  };
  // Schedule after the base target/form handlers. Native dispatch can checkpoint
  // microtasks between capture and bubble callbacks on the same input event.
  const afterCommand = () => { if (command) queueMicrotask(finish); };
  const cleanups = [
    listenToUI(element, 'click', beforeCommand, true),
    listenToUI(element, 'keydown', beforeCommand, true),
    listenToUI(element, 'change', beforeCommand, true),
    listenToUI(element, 'click', afterCommand),
    listenToUI(element, 'keydown', afterCommand),
    listenToUI(element, 'change', afterCommand),
    editor.subscribe((change) => {
      if (change.source === 'api') dialog.close(false);
      else if (command) changed = true;
      else if (dialog.isOpen()) dialog.close();
    }),
    editor.events.on('localechange', dialog.render),
    editor.events.on('readonlychange', (value) => { if (value) dialog.close(false); }),
    listenToUI(editor.surface, 'compositionstart', () => dialog.close(false)),
  ];
  const destroy = () => {
    if (disposed) return;
    disposed = true;
    for (const cleanup of cleanups) cleanup();
    dialog.destroy();
    base.destroy();
  };
  cleanups.push(editor.events.on('destroy', destroy));
  return {
    element, refresh, getValues, setValues,
    open: () => { if (!disposed && !editor.isReadOnly()) dialog.open(); },
    close: () => dialog.close(), isOpen: dialog.isOpen, destroy,
  };
};
