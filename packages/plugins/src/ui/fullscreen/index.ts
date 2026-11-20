import { localize } from '@morfira-dev/wysiwyg-core';
import type { Editor } from '@morfira-dev/wysiwyg-core';
import { createFormSelection } from '../shared/selection.js';
import { fullscreenUIMessages } from './messages.js';
import { fullscreenAncestors, supportedFullscreenLayout } from './layout.js';
import { claimFullscreenDocument, lockFullscreenScroll, releaseFullscreenDocument, restoreFullscreenScroll } from './ownership.js';
import type { FullscreenSelection, FullscreenWindowScroll, OverflowAxisSnapshot } from './internal-types.js';
import type { FullscreenUIController, FullscreenUIOptions } from './types.js';

export { fullscreenUIMessages } from './messages.js';
export type { FullscreenUIController, FullscreenUIMessageKey, FullscreenUIOptions } from './types.js';

const validLabel = (label: unknown): label is string => typeof label === 'string' && label.length > 0
  && label.length <= 160 && !/[\u0000-\u001f\u007f-\u009f]/.test(label);

export const createFullscreenUI = (host: HTMLElement, editor: Editor, options: FullscreenUIOptions): FullscreenUIController => {
  editor.getLocale();
  const root = editor.surface;
  const document = root.ownerDocument;
  const view = document.defaultView!;
  if (!options || typeof options !== 'object' || Array.isArray(options)
    || Object.keys(options).some((key) => !['target', 'label', 'onChange', 'onError'].includes(key))) throw new TypeError('Expected fullscreen UI options.');
  const { target, label, onChange, onError } = options;
  if (!(target instanceof view.HTMLElement) || !(host instanceof view.HTMLElement)
    || target.ownerDocument !== document || host.ownerDocument !== document
    || target.getRootNode() !== document || host.getRootNode() !== document
    || !target.isConnected || !host.isConnected || host.childNodes.length
    || target.namespaceURI !== 'http://www.w3.org/1999/xhtml' || host.namespaceURI !== 'http://www.w3.org/1999/xhtml'
    || target === document.body || target === document.documentElement
    || root.contains(target) || root.contains(host) || !target.contains(editor.element) || !target.contains(host))
    throw new TypeError('Fullscreen requires an empty external host inside the connected editor workspace.');
  if (label !== undefined && !validLabel(label)) throw new TypeError('The fullscreen label must be bounded literal text.');
  if (onChange !== undefined && typeof onChange !== 'function') throw new TypeError('The fullscreen change handler must be a callback.');
  if (onError !== undefined && typeof onError !== 'function') throw new TypeError('The fullscreen error handler must be a callback.');
  if (!supportedFullscreenLayout(target)) throw new TypeError('The fullscreen workspace has an unsupported ancestor layout.');
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'mw-fullscreen-toggle';
  element.dataset.mwFullscreen = '';
  const cleanups: (() => void)[] = [];
  const owner = Symbol('fullscreen-owner');
  let disposed = false;
  let active = false;
  let composing = false;
  let apiRevision = 0;
  let lockBody: HTMLElement | undefined;
  let overflow: readonly OverflowAxisSnapshot[] = [];
  let windowScroll: FullscreenWindowScroll | undefined;
  const report = (error: unknown): void => {
    try { onError?.(error); }
    catch { /* Diagnostics cannot prevent releasing owned view state. */ }
  };
  const assertActive = (): void => {
    if (disposed) throw new Error('Fullscreen UI has been destroyed.');
  };
  const structurallyOwned = (): boolean => target.ownerDocument === document && host.ownerDocument === document
    && target.getRootNode() === document && host.getRootNode() === document
    && target.isConnected && host.isConnected && element.ownerDocument === document
    && target.contains(editor.element) && target.contains(host) && host.contains(element)
    && !root.contains(host) && !root.contains(target);
  const update = (): void => {
    if (disposed) return;
    const caption = localize(editor.getLocale(), active ? 'ui.fullscreen.exit' : 'ui.fullscreen.enter', fullscreenUIMessages);
    element.textContent = caption;
    element.setAttribute('aria-label', label ?? caption);
    element.title = caption;
    element.setAttribute('aria-pressed', String(active));
    element.disabled = composing || !structurallyOwned();
  };
  const notify = (): void => {
    try { onChange?.(active); }
    catch (error) { report(error); }
  };
  const observer = new view.MutationObserver(() => {
    if (disposed || !active) return;
    if (!structurallyOwned() || !target.classList.contains('mw-fullscreen') || !supportedFullscreenLayout(target, true)
      || lockBody !== document.body) {
      leave();
      return;
    }
    watch();
  });
  const watch = (): void => {
    observer.disconnect();
    const nodes = new Set<HTMLElement>([target, ...fullscreenAncestors(target)]);
    for (const leaf of [editor.element, host]) {
      for (let node: HTMLElement | null = leaf; node && node !== target; node = node.parentElement) nodes.add(node);
    }
    for (const node of nodes) observer.observe(node, {
      childList: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'],
    });
  };
  const leave = (publish = true): void => {
    if (!active) return;
    const scroll = windowScroll;
    const restoreWindow = scroll && lockBody === document.body
      && view.scrollX === scroll.lockedX && view.scrollY === scroll.lockedY;
    active = false;
    observer.disconnect();
    document.removeEventListener('keydown', keyboard);
    const failures: unknown[] = [];
    for (const cleanup of [
      () => target.classList.remove('mw-fullscreen'),
      () => { if (lockBody) restoreFullscreenScroll(lockBody, overflow); },
      () => releaseFullscreenDocument(document, owner),
      () => { if (restoreWindow && scroll) view.scrollTo({ left: scroll.entryX, top: scroll.entryY, behavior: 'instant' }); },
    ]) {
      try { cleanup(); }
      catch (error) { failures.push(error); }
    }
    lockBody = undefined;
    overflow = [];
    windowScroll = undefined;
    if (!disposed) {
      try { update(); }
      catch (error) { failures.push(error); }
    }
    if (publish) notify();
    for (const error of failures) report(error);
  };
  const enter = (): boolean => {
    assertActive();
    if (active) return true;
    if (composing || !structurallyOwned() || !supportedFullscreenLayout(target, true)
      || target.classList.contains('mw-fullscreen') || !document.body || !claimFullscreenDocument(document, owner)) return false;
    try {
      const entryX = view.scrollX;
      const entryY = view.scrollY;
      lockBody = document.body;
      overflow = lockFullscreenScroll(lockBody);
      active = true;
      target.classList.add('mw-fullscreen');
      // Force the fixed-layout geometry before recording the background position:
      // removal from normal flow may clamp the document's current scroll offset.
      target.getBoundingClientRect();
      windowScroll = { entryX, entryY, lockedX: view.scrollX, lockedY: view.scrollY };
      watch();
      document.addEventListener('keydown', keyboard);
      update();
    }
    catch (error) {
      if (active) leave(false);
      else {
        try { if (lockBody) restoreFullscreenScroll(lockBody, overflow); }
        finally { releaseFullscreenDocument(document, owner); }
        lockBody = undefined;
        overflow = [];
      }
      report(error);
      return false;
    }
    notify();
    if (!disposed && active && (!structurallyOwned() || !target.classList.contains('mw-fullscreen') || !supportedFullscreenLayout(target, true))) leave();
    return active && !disposed;
  };
  const exit = (): void => { assertActive(); leave(); };
  const toggle = (): boolean => {
    assertActive();
    if (active) leave();
    else enter();
    return active && !disposed;
  };
  const remember = (): FullscreenSelection | undefined => {
    saved.capture();
    const range = saved.peek();
    return range ? { range, revision: apiRevision, start: range.startContainer, startOffset: range.startOffset,
      end: range.endContainer, endOffset: range.endOffset } : undefined;
  };
  const restore = (snapshot: FullscreenSelection | undefined): void => {
    if (!snapshot || disposed || snapshot.revision !== apiRevision || composing || !saved.peek()) return;
    if (!root.contains(snapshot.start) || !root.contains(snapshot.end)
      || snapshot.range.startContainer !== snapshot.start || snapshot.range.startOffset !== snapshot.startOffset
      || snapshot.range.endContainer !== snapshot.end || snapshot.range.endOffset !== snapshot.endOffset) return;
    const beforeFocus = document.getSelection();
    if (beforeFocus?.rangeCount === 1) {
      const current = beforeFocus.getRangeAt(0);
      if ((root.contains(current.startContainer) || root.contains(current.endContainer))
        && (current.startContainer !== snapshot.start || current.startOffset !== snapshot.startOffset
          || current.endContainer !== snapshot.end || current.endOffset !== snapshot.endOffset)) return;
    }
    const accepts = (): boolean => {
      if (disposed || snapshot.revision !== apiRevision || composing
        || (document.activeElement !== root && !root.contains(document.activeElement))) return false;
      const native = document.getSelection();
      if (!native || native.rangeCount !== 1) return false;
      const range = native.getRangeAt(0);
      return root.contains(snapshot.start) && root.contains(snapshot.end)
        && range.startContainer === snapshot.start && range.startOffset === snapshot.startOffset
        && range.endContainer === snapshot.end && range.endOffset === snapshot.endOffset;
    };
    saved.restore(accepts, true);
  };
  const click = (event: MouseEvent): void => {
    if (disposed || event.defaultPrevented || composing || !structurallyOwned()) return;
    const focused = document.activeElement === element;
    const selection = remember();
    event.preventDefault();
    toggle();
    if (focused && document.activeElement === element) restore(selection);
  };
  const pointer = (event: PointerEvent): void => {
    if (disposed || event.defaultPrevented || !event.cancelable || event.button !== 0) return;
    saved.capture();
    event.preventDefault();
    if (document.activeElement !== root && !root.contains(document.activeElement)) element.focus({ preventScroll: true });
  };
  const keyboard = (event: KeyboardEvent): void => {
    if (disposed || !active || composing || event.defaultPrevented || !event.cancelable || event.isComposing || event.keyCode === 229
      || event.key !== 'Escape' || !(event.target instanceof view.Node) || !target.contains(event.target)) return;
    const focused = document.activeElement === element;
    const selection = remember();
    event.preventDefault();
    leave();
    if (focused && document.activeElement === element) restore(selection);
  };
  const refresh = (): void => {
    assertActive();
    if (active && (!structurallyOwned() || !supportedFullscreenLayout(target, true) || !target.classList.contains('mw-fullscreen'))) leave();
    if (!disposed) update();
  };
  const listen = (owner: EventTarget, type: string, callback: EventListener): void => {
    owner.addEventListener(type, callback);
    cleanups.push(() => owner.removeEventListener(type, callback));
  };
  const destroy = (): void => {
    if (disposed) return;
    disposed = true;
    apiRevision++;
    leave();
    observer.disconnect();
    const failures: unknown[] = [];
    for (const cleanup of [...cleanups.splice(0).reverse(), () => saved.destroy(), () => element.remove()]) {
      try { cleanup(); }
      catch (error) { failures.push(error); }
    }
    if (failures.length) throw new AggregateError(failures, 'Fullscreen cleanup failed.');
  };
  const saved = createFormSelection(editor);
  try {
    listen(element, 'pointerdown', pointer as EventListener);
    listen(element, 'click', click as EventListener);
    listen(root, 'compositionstart', () => {
      if (disposed) return;
      composing = true;
      update();
    });
    listen(root, 'compositionend', () => {
      if (disposed) return;
      composing = false;
      update();
    });
    cleanups.push(editor.events.on('localechange', () => { if (!disposed) refresh(); }));
    cleanups.push(editor.events.on('readonlychange', () => {
      if (disposed) return;
      composing = false;
      refresh();
    }));
    cleanups.push(editor.subscribe((change) => {
      if (disposed) return;
      if (change.source === 'api') { apiRevision++; composing = false; }
      if (!disposed) update();
    }));
    cleanups.push(editor.events.on('destroy', destroy));
    host.append(element);
    update();
  }
  catch (error) {
    try { destroy(); }
    catch { /* Keep setup failure after every owned cleanup attempt. */ }
    throw error;
  }
  return { element, enter, exit, toggle, isActive: () => { assertActive(); return active; }, refresh, destroy };
};
