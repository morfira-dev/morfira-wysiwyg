import { localize } from '@morfira-dev/wysiwyg-core';
import type { Editor } from '@morfira-dev/wysiwyg-core';
import { createUIButton, createUIStatus } from '../shared/elements.js';
import { renderPreview } from '../preview/render.js';
import { printUIMessages } from './messages.js';
import type { PrintUIController, PrintUIMessageKey, PrintUIOptions } from './types.js';
import type { PrintSession } from './internal-types.js';

export { printUIMessages } from './messages.js';
export type { PrintUIController, PrintUIMessageKey, PrintUIOptions } from './types.js';

const markerAttribute = 'data-mw-print-active';
const leases = new WeakMap<Document, PrintSession>();
let sequence = 0;

export const createPrintUI = (host: HTMLElement, editor: Editor, options: PrintUIOptions = {}): PrintUIController => {
  editor.getLocale();
  const root = editor.surface;
  const wrapper = editor.element;
  const document = root.ownerDocument;
  const view = document.defaultView!;
  if (!(host instanceof view.HTMLElement) || host.ownerDocument !== document || !host.isConnected
    || host.childNodes.length || root.contains(host) || host.namespaceURI !== 'http://www.w3.org/1999/xhtml')
    throw new TypeError('Printing needs an empty connected external HTML host.');
  if (!options || typeof options !== 'object' || Array.isArray(options)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(options))
    || Reflect.ownKeys(options).some((key) => key !== 'label' && key !== 'onError'))
    throw new TypeError('Expected print UI options.');
  const { label, onError } = options;
  if (label !== undefined && (typeof label !== 'string' || !label || label.length > 160 || /[\u0000-\u001f\u007f-\u009f]/.test(label)))
    throw new TypeError('Print label must be bounded literal text.');
  if (onError !== undefined && typeof onError !== 'function') throw new TypeError('Print diagnostics must be a callback.');
  const element = document.createElement('section');
  element.className = 'mw-print';
  element.setAttribute('role', 'group');
  const controls = document.createElement('div');
  controls.className = 'mw-print-controls';
  const button = createUIButton(document);
  const cancelButton = createUIButton(document);
  const status = createUIStatus(document, 'mw-print-status');
  controls.append(button, cancelButton);
  element.append(controls, status);
  const cleanups: (() => void)[] = [];
  let disposed = false;
  let composing = false;
  let failed = false;
  let session: PrintSession | undefined;
  const message = (key: PrintUIMessageKey): string => localize(editor.getLocale(), key, printUIMessages);
  const owned = (): boolean => host.ownerDocument === document && root.ownerDocument === document
    && wrapper.ownerDocument === document && wrapper.isConnected && wrapper.contains(root)
    && element.ownerDocument === document && host.isConnected && root.isConnected && element.isConnected
    && host.contains(element) && !root.contains(host);
  const assertActive = (): void => { if (disposed) throw new Error('Print UI has been destroyed.'); };
  const report = (error: unknown): void => {
    try { onError?.(error); }
    catch { /* Diagnostics do not own printing state or its cleanup. */ }
  };
  const labels = (): void => {
    if (disposed) return;
    element.setAttribute('aria-label', label ?? message('ui.print.label'));
    button.textContent = message('ui.print.print');
    button.disabled = !owned() || composing || Boolean(session);
    cancelButton.textContent = message('ui.print.cancel');
    cancelButton.hidden = !session;
    status.hidden = !session && !failed;
    status.textContent = session ? message('ui.print.pending') : failed ? message('ui.print.error') : '';
  };
  const observer = new view.MutationObserver(() => {
    const pending = session;
    if (!disposed && pending && (!owned() || pending.body.ownerDocument !== document
      || pending.surface.parentNode !== pending.body || pending.body.getAttribute(markerAttribute) !== pending.marker
      || conflictingSurface(pending.body, pending.surface))) release(pending);
    else if (!disposed && pending) watch(pending);
  });
  const watch = (pending: PrintSession): void => {
    observer.disconnect();
    const paths = new Set<Node>([host, element, pending.body]);
    for (const leaf of [host, root]) {
      for (let node: Node | null = leaf.parentNode; node; node = node.parentNode) paths.add(node);
    }
    for (const node of paths) observer.observe(node, { childList: true });
    observer.observe(pending.body, { childList: true, attributes: true, attributeFilter: [markerAttribute] });
  };
  const release = (expected?: PrintSession): void => {
    const pending = session;
    if (!pending || (expected && pending !== expected)) return;
    session = undefined;
    observer.disconnect();
    if (leases.get(document) === pending) leases.delete(document);
    if (pending.body.getAttribute(markerAttribute) === pending.marker) pending.body.removeAttribute(markerAttribute);
    pending.surface.remove();
    labels();
  };
  const current = (pending: PrintSession): boolean => !disposed && session === pending
    && leases.get(document) === pending && owned() && document.body === pending.body;
  const conflictingSurface = (body: HTMLElement, own?: HTMLElement): boolean => [...body.children]
    .some((child) => child !== own && child.classList.contains('mw-print-surface'));
  const print = (): boolean => {
    assertActive();
    const body = document.body;
    if (session || leases.has(document) || composing || !owned() || !body || body.localName !== 'body'
      || body.hasAttribute(markerAttribute) || conflictingSurface(body)) return false;
    const surface = document.createElement('section');
    surface.className = 'mw-print-surface';
    surface.setAttribute('data-mw-print-surface', '');
    surface.hidden = true;
    const pending: PrintSession = { surface, body, marker: `mw-${++sequence}`, enteredMedia: false };
    session = pending;
    leases.set(document, pending);
    failed = false;
    try {
      labels();
      const value = editor.schema.validateDocument(editor.getJSON());
      if (!current(pending)) { release(pending); return false; }
      const fragment = renderPreview(document, value, 'omit', message('ui.print.image'));
      if (!current(pending)) { release(pending); return false; }
      // Source font families can activate application-owned @font-face resources.
      // This print profile deliberately uses system fonts without loading fonts.
      for (const node of fragment.querySelectorAll<HTMLElement>('[style]')) {
        node.style.removeProperty('font-family');
        if (!node.style.length) node.removeAttribute('style');
      }
      surface.append(fragment);
      body.append(surface);
      if (view.getComputedStyle(surface).getPropertyValue('--mw-print-ready').trim() !== '1')
        throw new Error('Import the required print stylesheet before requesting printing.');
      if (!current(pending) || body.hasAttribute(markerAttribute) || conflictingSurface(body, surface)) { release(pending); return false; }
      body.setAttribute(markerAttribute, pending.marker);
      watch(pending);
      view.print();
      return true;
    }
    catch (error) {
      const active = session === pending;
      release(pending);
      if (!disposed && active) {
        failed = true;
        labels();
        report(error);
      }
      return false;
    }
  };
  const cancel = (): void => {
    assertActive();
    release();
    failed = false;
    labels();
  };
  const destroy = (): void => {
    if (disposed) return;
    disposed = true;
    const failures: unknown[] = [];
    for (const cleanup of [() => release(), ...cleanups.splice(0).reverse(), () => element.remove()]) {
      try { cleanup(); }
      catch (error) { failures.push(error); }
    }
    if (failures.length) throw new AggregateError(failures, 'Print cleanup failed.');
  };
  const listen = (owner: EventTarget, type: string, listener: EventListener): void => {
    owner.addEventListener(type, listener);
    cleanups.push(() => owner.removeEventListener(type, listener));
  };
  const click = (event: MouseEvent, action: () => unknown): void => {
    if (disposed || event.defaultPrevented || !owned()) return;
    event.preventDefault();
    action();
  };
  const pointer = (event: PointerEvent): void => {
    if (!disposed && event.cancelable && !event.defaultPrevented && event.button === 0
      && event.target instanceof view.Element && event.target.closest('button')) event.preventDefault();
  };
  const resetComposition = (): void => { composing = false; labels(); };
  try {
    listen(button, 'click', ((event: MouseEvent) => click(event, print)) as EventListener);
    listen(cancelButton, 'click', ((event: MouseEvent) => click(event, cancel)) as EventListener);
    listen(element, 'pointerdown', pointer as EventListener);
    listen(view, 'afterprint', () => release());
    listen(root, 'compositionstart', () => { composing = true; labels(); });
    listen(root, 'compositionend', resetComposition);
    if (typeof view.matchMedia === 'function') {
      const media = view.matchMedia('print');
      const change = (event: MediaQueryListEvent): void => {
        if (!session) return;
        if (event.matches) session.enteredMedia = true;
        else if (session.enteredMedia) release();
      };
      listen(media, 'change', change as EventListener);
    }
    cleanups.push(editor.subscribe((change) => { if (change.source === 'api') resetComposition(); }));
    cleanups.push(editor.events.on('readonlychange', (readOnly) => { if (readOnly) resetComposition(); }));
    cleanups.push(editor.events.on('localechange', labels));
    cleanups.push(editor.events.on('destroy', destroy));
    host.append(element);
    labels();
  }
  catch (error) {
    try { destroy(); }
    catch { /* Keep the setup error after attempting all owned cleanup. */ }
    throw error;
  }
  return { element, print, cancel, isPrinting: () => { assertActive(); return Boolean(session); }, destroy };
};
