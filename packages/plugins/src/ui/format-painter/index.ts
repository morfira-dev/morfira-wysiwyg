import { localize } from '@morfira-dev/wysiwyg-core';
import type { Editor, EditorSelectionHandle } from '@morfira-dev/wysiwyg-core';
import { formatPainterCommands } from '../../format-painter/index.js';
import { formatPainterUIMessages } from './messages.js';
import type { FormatPainterUIController } from './types.js';

export type { FormatPainterUIController } from './types.js';
export { formatPainterUIMessages } from './messages.js';

export const createFormatPainterUI = (host: HTMLElement, editor: Editor): FormatPainterUIController => {
  const commands = formatPainterCommands(editor);
  const root = editor.surface;
  const document = root.ownerDocument;
  const view = document.defaultView!;
  if (!(host instanceof view.HTMLElement) || !host.isConnected || host.ownerDocument !== document || host.childNodes.length || root.contains(host) || host.contains(editor.element)) throw new TypeError('Format painter UI needs an empty connected external host.');
  const element = document.createElement('div');
  element.className = 'mw-format-painter';
  element.setAttribute('role', 'group');
  const copy = document.createElement('button');
  const apply = document.createElement('button');
  const clear = document.createElement('button');
  const status = document.createElement('span');
  status.setAttribute('role', 'status');
  for (const button of [copy, apply, clear]) button.type = 'button';
  element.append(copy, apply, clear, status);
  let disposed = false;
  let pointerFocus = false;
  let handle: EditorSelectionHandle | undefined;
  const cleanups: (() => void)[] = [];
  const owned = (): boolean => host.isConnected && host.contains(element) && !root.contains(host) && !host.contains(editor.element);
  const release = (): void => {
    if (handle) editor.selection.release(handle);
    handle = undefined;
  };
  const remember = (): void => {
    if (disposed || !owned()) return;
    release();
    handle = editor.selection.capture();
  };
  const restoreTarget = (): boolean => {
    if (!handle || !editor.selection.isCurrent(handle)) return false;
    const saved = editor.selection.getRange(handle);
    const selection = document.getSelection();
    const current = selection?.rangeCount === 1 ? selection.getRangeAt(0) : undefined;
    if (!saved) return false;
    if (current && root.contains(current.startContainer) && root.contains(current.endContainer)
      && (current.startContainer !== saved.startContainer || current.startOffset !== saved.startOffset
        || current.endContainer !== saved.endContainer || current.endOffset !== saved.endOffset)) return false;
    return editor.selection.restore(handle);
  };
  const refresh = (): void => {
    if (disposed) return;
    const state = commands.getState();
    const translate = (key: keyof typeof formatPainterUIMessages.en): string => localize(editor.getLocale(), key, formatPainterUIMessages);
    element.setAttribute('aria-label', translate('ui.formatPainter.label'));
    copy.textContent = translate('ui.formatPainter.copy');
    apply.textContent = translate('ui.formatPainter.apply');
    clear.textContent = translate('ui.formatPainter.clear');
    status.textContent = translate(state.captured ? 'ui.formatPainter.ready' : 'ui.formatPainter.empty');
    copy.disabled = !owned() || !state.canCapture;
    apply.disabled = !owned() || !state.canApply;
    clear.disabled = !owned() || !state.captured;
  };
  const destroy = (): void => {
    if (disposed) return;
    disposed = true;
    release();
    for (const cleanup of cleanups.splice(0).reverse()) cleanup();
    element.remove();
  };
  const listen = (owner: EventTarget, name: string, callback: EventListener): void => {
    owner.addEventListener(name, callback);
    cleanups.push(() => owner.removeEventListener(name, callback));
  };
  try {
    for (const button of [copy, apply]) {
      listen(button, 'pointerdown', () => { pointerFocus = true; remember(); });
      listen(button, 'pointerup', () => { pointerFocus = false; });
      listen(button, 'pointercancel', () => { pointerFocus = false; });
      listen(button, 'focus', () => {
        if (!pointerFocus) remember();
        pointerFocus = false;
      });
      listen(button, 'click', () => {
        if (disposed || !owned() || !restoreTarget()) {
          refresh();
          return;
        }
        if (button === copy) commands.capture();
        else commands.apply();
        release();
        refresh();
      });
    }
    listen(clear, 'click', () => {
      if (disposed || !owned()) return;
      commands.clear();
      release();
      refresh();
    });
    cleanups.push(editor.onSelectionChange(refresh), editor.subscribe(refresh), editor.events.on('localechange', refresh), editor.events.on('readonlychange', refresh), editor.events.on('destroy', destroy));
    host.append(element);
    refresh();
  }
  catch (error) {
    destroy();
    throw error;
  }
  return { element, refresh, destroy };
};
