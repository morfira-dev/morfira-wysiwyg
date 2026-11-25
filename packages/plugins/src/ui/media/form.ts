import { localize } from '@morfira-dev/wysiwyg-core';
import type { Editor, EditorSelectionHandle } from '@morfira-dev/wysiwyg-core';
import { mediaCommands } from '../../media/index.js';
import { mediaMessages } from './messages.js';
import type { MediaFormController, MediaFormOptions, MediaFormValues } from './types.js';

export const createMediaForm = (host: HTMLElement, editor: Editor, options: MediaFormOptions = {}): MediaFormController => {
  const commands = mediaCommands(editor);
  const document = editor.surface.ownerDocument;
  if (host.ownerDocument !== document || editor.surface.contains(host) || host.contains(editor.surface))
    throw new Error('Media forms require a separate host in the editor document.');
  const presentation = options.presentation ?? 'dialog';
  if (!['dialog', 'inline'].includes(presentation) || options.onError !== undefined && typeof options.onError !== 'function')
    throw new TypeError('Unsupported media form options.');
  const onError = options.onError;
  const element = document.createElement('section');
  element.className = 'mw-media-form';
  element.setAttribute('role', 'form');
  const urlLabel = document.createElement('label');
  const titleLabel = document.createElement('label');
  const urlCaption = document.createElement('span');
  const titleCaption = document.createElement('span');
  const url = document.createElement('input');
  const title = document.createElement('input');
  url.type = 'url';
  url.maxLength = 2048;
  title.maxLength = 256;
  urlLabel.append(urlCaption, url);
  titleLabel.append(titleCaption, title);
  const apply = document.createElement('button');
  const remove = document.createElement('button');
  const closeButton = document.createElement('button');
  apply.type = remove.type = closeButton.type = 'button';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  element.append(urlLabel, titleLabel, apply, remove, closeButton, status);
  const dialog = presentation === 'dialog' ? document.createElement('dialog') : undefined;
  if (dialog) {
    dialog.className = 'mw-media-dialog';
    dialog.append(element);
    host.append(dialog);
  }
  else host.append(element);
  let saved: EditorSelectionHandle | undefined;
  let target: HTMLElement | undefined;
  let targetSignature: string | undefined;
  let origin: HTMLElement | undefined;
  let opened = presentation === 'inline';
  let disposed = false;
  let composing = false;
  let performing = false;
  let suspended = false;
  let ignoredClose = 0;
  let message: 'ui.media.invalid' | 'ui.media.stale' | 'ui.media.saved' | 'ui.media.removed' | undefined;
  const cleanups: (() => void)[] = [];
  const text = (key: keyof typeof mediaMessages.en) => localize(editor.getLocale(), key, mediaMessages);
  const release = () => {
    if (saved) editor.selection.release(saved);
    saved = undefined;
    target = undefined;
    targetSignature = undefined;
  };
  const update = () => {
    if (disposed) return;
    const label = text('ui.media.label');
    element.setAttribute('aria-label', label);
    dialog?.setAttribute('aria-label', label);
    urlCaption.textContent = text('ui.media.url');
    titleCaption.textContent = text('ui.media.title');
    apply.textContent = text(target ? 'ui.media.update' : 'ui.media.insert');
    remove.textContent = text('ui.media.remove');
    closeButton.textContent = text('ui.media.close');
    url.disabled = title.disabled = apply.disabled = editor.isReadOnly() || composing;
    remove.disabled = editor.isReadOnly() || composing || !target;
    status.textContent = message ? text(message) : '';
  };
  const physicalClose = () => {
    if (!dialog?.open) return;
    ignoredClose++;
    dialog.close();
  };
  const close = (restoreFocus = true) => {
    if (disposed || !opened) return;
    if (presentation === 'inline') { release(); update(); return; }
    opened = false;
    suspended = false;
    physicalClose();
    release();
    const previous = origin;
    origin = undefined;
    if (restoreFocus && previous?.isConnected && !element.contains(previous)) previous.focus({ preventScroll: true });
  };
  const inspect = () => {
    release();
    saved = editor.selection.capture();
    const range = saved ? editor.selection.getRange(saved) : undefined;
    if (!range) return;
    const node = range.startContainer.nodeType === 1 ? range.startContainer as Element : range.startContainer.parentElement;
    let candidate = node?.closest<HTMLElement>('[data-mw-node="morfira:media"]');
    if (!candidate && range.startContainer === range.endContainer && range.startContainer.nodeType === 1
      && range.endOffset === range.startOffset + 1) {
      const selected = range.startContainer.childNodes[range.startOffset];
      if (selected?.nodeType === 1) candidate = selected as HTMLElement;
    }
    const value = candidate ? commands.get(candidate) : undefined;
    if (value && candidate) {
      target = candidate;
      targetSignature = candidate.outerHTML;
      url.value = value.url;
      title.value = value.title;
    }
  };
  const open = () => {
    if (disposed || composing || editor.isReadOnly() || !host.isConnected || dialog && (opened || typeof dialog.showModal !== 'function')) return;
    origin = document.activeElement instanceof document.defaultView!.HTMLElement ? document.activeElement : undefined;
    inspect();
    message = undefined;
    update();
    opened = true;
    dialog?.showModal();
    url.focus();
  };
  const getValues = (): MediaFormValues => {
    if (disposed) throw new Error('Media form has been destroyed.');
    return { url: url.value, title: title.value };
  };
  const setValues = (values: Partial<MediaFormValues>) => {
    if (disposed) throw new Error('Media form has been destroyed.');
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw new TypeError('Invalid media form values.');
    for (const [key, value] of Object.entries(values)) {
      if ((key !== 'url' && key !== 'title') || typeof value !== 'string') throw new TypeError('Invalid media form field.');
    }
    if (values.url !== undefined) url.value = values.url;
    if (values.title !== undefined) title.value = values.title;
    message = undefined;
    update();
  };
  const perform = (deleting: boolean) => {
    if (disposed || performing || !opened || composing || editor.isReadOnly()) return;
    const handle = saved;
    const range = handle ? editor.selection.getRange(handle) : undefined;
    const expected = target;
    const signature = targetSignature;
    const values = getValues();
    const current = () => !disposed && !composing && !editor.isReadOnly() && !!handle && editor.selection.isCurrent(handle)
      && (!expected || commands.get(expected) !== undefined && expected.outerHTML === signature);
    const sameIntent = () => {
      const native = document.getSelection();
      return !!range && native?.rangeCount === 1 && native.anchorNode !== null
        && native.getRangeAt(0).startContainer === range.startContainer && native.getRangeAt(0).startOffset === range.startOffset
        && native.getRangeAt(0).endContainer === range.endContainer && native.getRangeAt(0).endOffset === range.endOffset;
    };
    const native = document.getSelection();
    const nativeInEditor = native?.anchorNode && editor.surface.contains(native.anchorNode);
    if (!current() || nativeInEditor && !sameIntent()) { message = 'ui.media.stale'; update(); return; }
    performing = true;
    try {
      if (dialog) { suspended = true; physicalClose(); }
      if (!current() || !handle || !editor.selection.restore(handle)) { message = 'ui.media.stale'; return; }
      editor.focus();
      if (!current() || !sameIntent()) { message = 'ui.media.stale'; return; }
      const accepted = deleting ? !!expected && commands.remove(expected) : expected ? commands.update(expected, values) : commands.insert(values);
      if (!accepted) { message = 'ui.media.stale'; return; }
      message = deleting ? 'ui.media.removed' : 'ui.media.saved';
      if (dialog) close();
      else { inspect(); update(); }
    }
    catch (error) {
      message = 'ui.media.invalid';
      onError?.(error);
    }
    finally {
      performing = false;
      if (!disposed) {
        if (dialog && opened && suspended) {
          suspended = false;
          if (host.isConnected && !dialog.open) dialog.showModal();
        }
        update();
      }
    }
  };
  const listen = (target: EventTarget, type: string, handler: EventListener) => {
    target.addEventListener(type, handler);
    cleanups.push(() => target.removeEventListener(type, handler));
  };
  const destroy = () => {
    if (disposed) return;
    disposed = true;
    release();
    for (const stop of cleanups) stop();
    physicalClose();
    (dialog ?? element).remove();
  };
  listen(apply, 'click', () => perform(false));
  listen(remove, 'click', () => perform(true));
  listen(closeButton, 'click', () => close());
  listen(element, 'keydown', ((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey
      && event.target instanceof document.defaultView!.HTMLInputElement) {
      event.preventDefault(); perform(false);
    }
    else if (event.key === 'Escape') { event.preventDefault(); close(); }
  }) as EventListener);
  if (dialog) {
    listen(dialog, 'cancel', (event) => { event.preventDefault(); close(); });
    listen(dialog, 'close', () => { if (ignoredClose) { ignoredClose--; return; } if (!suspended) close(); });
  }
  listen(editor.surface, 'compositionstart', () => {
    composing = true;
    if (dialog) close(false);
    else release();
    update();
  });
  listen(editor.surface, 'compositionend', () => { composing = false; update(); });
  cleanups.push(editor.subscribe((change) => {
    if (performing) return;
    release();
    if (change.source === 'api') {
      composing = false;
      if (dialog) close(false);
    }
    update();
  }), editor.events.on('readonlychange', (readonly) => {
    if (readonly) {
      composing = false;
      if (dialog) close(false);
    }
    update();
  }),
  editor.events.on('localechange', update), editor.events.on('destroy', destroy));
  if (!dialog) inspect();
  update();
  return { element, open, close, isOpen: () => !disposed && opened, refresh: () => { if (!disposed) { inspect(); update(); } }, getValues, setValues, destroy };
};
