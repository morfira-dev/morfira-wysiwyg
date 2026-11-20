import { localize } from '@morfira-dev/wysiwyg-core';
import type { Editor } from '@morfira-dev/wysiwyg-core';
import { createUIButton, createUIStatus } from '../shared/elements.js';
import { previewUIMessages } from './messages.js';
import { renderPreview } from './render.js';
import type { PreviewUIController, PreviewUIMessageKey, PreviewUIOptions } from './types.js';

export { previewUIMessages } from './messages.js';
export type { PreviewUIController, PreviewUIMessageKey, PreviewUIOptions } from './types.js';

export const createPreviewUI = (host: HTMLElement, editor: Editor, options: PreviewUIOptions = {}): PreviewUIController => {
  editor.getLocale();
  const root = editor.surface;
  const document = root.ownerDocument;
  const view = document.defaultView!;
  if (!(host instanceof view.HTMLElement) || host.ownerDocument !== document || !host.isConnected
    || host.childNodes.length || root.contains(host) || host.namespaceURI !== 'http://www.w3.org/1999/xhtml')
    throw new TypeError('Preview needs an empty connected external HTML host.');
  if (!options || typeof options !== 'object' || Array.isArray(options)
    || Object.keys(options).some((key) => !['label', 'live', 'images', 'onError'].includes(key))) throw new TypeError('Expected preview UI options.');
  const { label, live = true, images = 'omit', onError } = options;
  if (label !== undefined && (typeof label !== 'string' || !label || label.length > 160 || /[\u0000-\u001f\u007f-\u009f]/.test(label)))
    throw new TypeError('Preview label must be bounded literal text.');
  if (typeof live !== 'boolean' || !['omit', 'load'].includes(images)) throw new TypeError('Invalid preview rendering policy.');
  if (onError !== undefined && typeof onError !== 'function') throw new TypeError('Preview diagnostics must be a callback.');
  const element = document.createElement('section');
  element.className = 'mw-preview';
  const controls = document.createElement('div');
  controls.className = 'mw-preview-controls';
  const toggleButton = createUIButton(document);
  const refreshButton = createUIButton(document);
  controls.append(toggleButton, refreshButton);
  const content = document.createElement('div');
  content.className = 'mw-preview-content';
  content.setAttribute('role', 'region');
  content.tabIndex = 0;
  const status = createUIStatus(document, 'mw-preview-status');
  element.append(controls, content, status);
  const cleanups: (() => void)[] = [];
  let disposed = false;
  let opened = false;
  let generation = 0;
  let frame = 0;
  let failed = false;
  const message = (key: PreviewUIMessageKey): string => localize(editor.getLocale(), key, previewUIMessages);
  const owned = (): boolean => host.ownerDocument === document && root.ownerDocument === document
    && element.ownerDocument === document && host.isConnected && root.isConnected && element.isConnected
    && host.contains(element) && !root.contains(host);
  const report = (error: unknown): void => {
    try { onError?.(error); }
    catch { /* Application diagnostics cannot prevent owned cleanup. */ }
  };
  const assertActive = (): void => { if (disposed) throw new Error('Preview UI has been destroyed.'); };
  const labels = (): void => {
    if (disposed) return;
    const caption = message(opened ? 'ui.preview.close' : 'ui.preview.open');
    toggleButton.textContent = caption;
    toggleButton.setAttribute('aria-expanded', String(opened));
    toggleButton.disabled = !owned();
    refreshButton.textContent = message('ui.preview.refresh');
    refreshButton.hidden = !opened;
    refreshButton.disabled = !owned();
    content.setAttribute('aria-label', label ?? message('ui.preview.label'));
    content.hidden = !opened;
    status.hidden = !opened || !failed;
    status.textContent = failed ? message('ui.preview.error') : '';
  };
  const cancel = (): void => {
    if (frame) view.cancelAnimationFrame(frame);
    frame = 0;
  };
  const observer = new view.MutationObserver(() => {
    if (!disposed && opened) {
      if (!owned()) close();
      else watch();
    }
  });
  const watch = (): void => {
    observer.disconnect();
    // Observe removal paths, never the document's complete editing subtree.
    const paths = new Set<Node>([host, element]);
    for (const leaf of [host, root]) {
      for (let node: Node | null = leaf.parentNode; node; node = node.parentNode) paths.add(node);
    }
    for (const node of paths) observer.observe(node, { childList: true });
  };
  const render = (): void => {
    if (disposed || !opened) return;
    if (!owned()) { close(); return; }
    const revision = generation;
    try {
      const value = editor.schema.validateDocument(editor.getJSON());
      if (disposed || !opened || revision !== generation || !owned()) return;
      const fragment = renderPreview(document, value, images, message('ui.preview.image'));
      if (disposed || !opened || revision !== generation || !owned()) return;
      content.replaceChildren(fragment);
      failed = false;
      labels();
    }
    catch (error) {
      if (disposed || !opened || revision !== generation) return;
      failed = true;
      labels();
      report(error);
    }
  };
  const schedule = (): void => {
    if (disposed || !opened || !live || frame) return;
    const revision = generation;
    frame = view.requestAnimationFrame(() => {
      frame = 0;
      if (!disposed && opened && revision === generation) render();
    });
  };
  const close = (): void => {
    assertActive();
    opened = false;
    generation++;
    cancel();
    observer.disconnect();
    content.replaceChildren();
    failed = false;
    labels();
  };
  const open = (): void => {
    assertActive();
    if (!owned()) { close(); return; }
    if (!opened) {
      opened = true;
      generation++;
      watch();
    }
    cancel();
    render();
  };
  const refresh = (): void => {
    assertActive();
    cancel();
    if (opened) render();
    else labels();
  };
  const toggle = (): boolean => {
    assertActive();
    if (opened) close();
    else open();
    return opened;
  };
  const interact = (event: MouseEvent, action: () => void): void => {
    if (disposed || event.defaultPrevented || !owned()) return;
    event.preventDefault();
    action();
  };
  const keyboard = (event: KeyboardEvent): void => {
    if (disposed || !opened || event.defaultPrevented || !event.cancelable || event.isComposing || event.keyCode === 229 || event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    const insideContent = content.contains(document.activeElement);
    close();
    if (!disposed && insideContent && owned() && (document.activeElement === document.body || content.contains(document.activeElement))) toggleButton.focus({ preventScroll: true });
  };
  const pointer = (event: PointerEvent): void => {
    if (!disposed && !event.defaultPrevented && event.cancelable && event.button === 0
      && event.target instanceof view.Element && event.target.closest('button')) event.preventDefault();
  };
  const listen = (owner: EventTarget, type: string, callback: EventListener): void => {
    owner.addEventListener(type, callback);
    cleanups.push(() => owner.removeEventListener(type, callback));
  };
  const destroy = (): void => {
    if (disposed) return;
    disposed = true;
    opened = false;
    generation++;
    cancel();
    observer.disconnect();
    const failures: unknown[] = [];
    for (const cleanup of [...cleanups.splice(0).reverse(), () => content.replaceChildren(), () => element.remove()]) {
      try { cleanup(); }
      catch (error) { failures.push(error); }
    }
    if (failures.length) throw new AggregateError(failures, 'Preview cleanup failed.');
  };
  try {
    listen(toggleButton, 'click', ((event: MouseEvent) => interact(event, toggle)) as EventListener);
    listen(refreshButton, 'click', ((event: MouseEvent) => interact(event, refresh)) as EventListener);
    listen(element, 'pointerdown', pointer as EventListener);
    listen(element, 'keydown', keyboard as EventListener);
    cleanups.push(editor.subscribe(schedule));
    cleanups.push(editor.events.on('localechange', () => {
      if (!disposed) { labels(); if (opened) render(); }
    }));
    cleanups.push(editor.events.on('destroy', destroy));
    host.append(element);
    labels();
  }
  catch (error) {
    try { destroy(); }
    catch { /* Preserve setup failure after releasing every owned resource. */ }
    throw error;
  }
  return { element, open, close, toggle, isOpen: () => { assertActive(); return opened; }, refresh, destroy };
};
