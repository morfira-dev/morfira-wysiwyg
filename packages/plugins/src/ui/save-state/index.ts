import { localize } from '@morfira-dev/wysiwyg-core';
import type { Editor } from '@morfira-dev/wysiwyg-core';
import { saveStateCommands } from '../../save-state/index.js';
import { saveStateUIMessages } from './messages.js';
import type { SaveStateUIController, SaveStateUIMessageKey, SaveStateUIOptions } from './types.js';

export { saveStateUIMessages } from './messages.js';
export type { SaveStateUIController, SaveStateUIMessageKey, SaveStateUIOptions } from './types.js';

export const createSaveStateUI = (host: HTMLElement, editor: Editor, options: SaveStateUIOptions = {}): SaveStateUIController => {
  const api = saveStateCommands(editor);
  editor.getLocale();
  const root = editor.surface;
  const document = root.ownerDocument;
  const view = document.defaultView!;
  if (!(host instanceof view.HTMLElement) || host.ownerDocument !== document || !host.isConnected
    || host.childNodes.length || root.contains(host) || host.namespaceURI !== 'http://www.w3.org/1999/xhtml')
    throw new TypeError('Save-state UI requires an empty connected external HTML host.');
  if (!options || typeof options !== 'object' || Array.isArray(options)
    || Object.keys(options).some((key) => !['label', 'onError'].includes(key))
    || (options.label !== undefined && (typeof options.label !== 'string' || !options.label || options.label.length > 160 || /[\u0000-\u001f\u007f-\u009f]/.test(options.label)))
    || (options.onError !== undefined && typeof options.onError !== 'function')) throw new TypeError('Expected save-state UI options.');
  const { label, onError } = options;
  const element = document.createElement('section');
  element.className = 'mw-save-state';
  element.setAttribute('role', 'group');
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.mwSaveAction = '';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  element.append(button, status);
  let disposed = false;
  let composing = false;
  const cleanups: (() => void)[] = [];
  const report = (error: unknown): void => {
    try { onError?.(error); }
    catch { /* Diagnostics must not block cleanup or request settlement. */ }
  };
  const structurallyOwned = (): boolean => host.ownerDocument === document && element.ownerDocument === document
    && root.ownerDocument === document && root.isConnected && editor.element.ownerDocument === document
    && editor.element.isConnected && editor.element.contains(root) && host.isConnected && element.isConnected
    && host.contains(element) && !root.contains(element);
  const render = (): void => {
    if (disposed) return;
    let locale: ReturnType<Editor['getLocale']>;
    try { locale = editor.getLocale(); }
    catch { return; /* Editor destruction may abort transport before this UI's destroy listener runs. */ }
    const message = (key: SaveStateUIMessageKey): string => localize(locale, key, saveStateUIMessages);
    const state = api.getState();
    element.setAttribute('aria-label', label ?? message('ui.saveState.label'));
    element.dataset.mwSaveStatus = state.status;
    status.textContent = message(`ui.saveState.${state.status}`);
    button.textContent = message(state.status === 'error' ? 'ui.saveState.retry' : 'ui.saveState.save');
    button.disabled = composing || !state.dirty || state.status === 'saving' || !structurallyOwned();
  };
  const refresh = (): void => {
    if (disposed) throw new Error('Save-state UI has been destroyed.');
    render();
  };
  const click = (event: MouseEvent): void => {
    if (disposed || event.defaultPrevented || composing || !structurallyOwned() || button.disabled) return;
    event.preventDefault();
    try {
      const state = api.getState();
      const result = state.status === 'error' ? api.retry() : api.save();
      void result.catch(report);
    }
    catch (error) { report(error); }
  };
  const listen = (owner: EventTarget, type: string, callback: EventListener): void => {
    owner.addEventListener(type, callback);
    cleanups.push(() => owner.removeEventListener(type, callback));
  };
  const destroy = (): void => {
    if (disposed) return;
    disposed = true;
    const failures: unknown[] = [];
    for (const stop of [...cleanups.splice(0).reverse(), () => element.remove()]) {
      try { stop(); }
      catch (error) { failures.push(error); }
    }
    if (failures.length) throw new AggregateError(failures, 'Save-state UI cleanup failed.');
  };
  try {
    host.append(element);
    cleanups.push(api.subscribe(render));
    listen(button, 'click', click as EventListener);
    listen(root, 'compositionstart', () => { if (!disposed) { composing = true; render(); } });
    listen(root, 'compositionend', () => { if (!disposed) { composing = false; render(); } });
    cleanups.push(editor.events.on('readonlychange', () => { if (!disposed) { composing = false; render(); } }));
    cleanups.push(editor.events.on('localechange', () => { if (!disposed) render(); }));
    cleanups.push(editor.subscribe((change) => { if (!disposed && change.source === 'api') { composing = false; render(); } }));
    cleanups.push(editor.events.on('destroy', destroy));
    render();
  }
  catch (error) {
    try { destroy(); }
    catch { /* Preserve setup failure after releasing all owned UI. */ }
    throw error;
  }
  return { element, refresh, destroy };
};
