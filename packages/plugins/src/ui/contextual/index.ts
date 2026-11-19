import { localize } from '@morfira-dev/wysiwyg-core';
import type { Editor } from '@morfira-dev/wysiwyg-core';
import { createEditorUI } from '../editor/index.js';
import { createFormSelection } from '../shared/selection.js';
import { listenToUI } from '../shared/events.js';
import { onContextualPreferenceChange, prefersContextualRange } from '../shared/contextual-preference.js';
import { contextualToolbarMessages } from './messages.js';
import { contextualAnchor, placeContextualToolbar } from './geometry.js';
import { nativeContextualRange, sameContextualRange, validContextualRange } from './selection.js';
import type { ContextualToolbarController, ContextualToolbarOptions } from './types.js';

export { contextualToolbarMessages } from './messages.js';
export type { ContextualToolbarController, ContextualToolbarOptions, ContextualToolbarMessageKey } from './types.js';

export const createContextualToolbar = (host: HTMLElement, editor: Editor, options: ContextualToolbarOptions = {}): ContextualToolbarController => {
  editor.getLocale();
  const surface = editor.surface;
  const document = surface.ownerDocument;
  if (host.ownerDocument !== document || !host.isConnected || host.childNodes.length || surface.contains(host)
    || host.namespaceURI !== 'http://www.w3.org/1999/xhtml') throw new Error('Contextual tools need an empty connected external host in the editor document.');
  if (!options || typeof options !== 'object' || Array.isArray(options)
    || Object.keys(options).some((key) => !['groups', 'density', 'label', 'onError', 'gap'].includes(key)))
    throw new TypeError('Expected contextual toolbar options.');
  const gap = options.gap === undefined ? 8 : options.gap;
  if (typeof gap !== 'number' || !Number.isFinite(gap) || gap < 0 || gap > 32) throw new TypeError('Contextual gap must be 0–32 CSS pixels.');
  if (options.groups !== undefined && !Array.isArray(options.groups)) throw new TypeError('Contextual groups must be an array.');
  const view = document.defaultView!;
  const element = document.createElement('section');
  element.className = 'mw-contextual-toolbar';
  element.hidden = true;
  const inner = document.createElement('div');
  element.append(inner);
  const message = (key: keyof typeof contextualToolbarMessages.en): string => localize(editor.getLocale(), key, contextualToolbarMessages);
  const shell = createEditorUI(inner, editor, {
    groups: options.groups === undefined ? [['bold', 'italic', 'underline', 'strike', 'code'], ['clear']] : options.groups,
    density: options.density, label: options.label === undefined ? message('ui.contextual.label') : options.label, onError: options.onError,
  });
  const selection = (() => {
    try { return createFormSelection(editor); }
    catch (error) {
      try { shell.destroy(); }
      catch { /* Preserve the setup error after releasing the inner shell. */ }
      throw error;
    }
  })();
  const cleanups: (() => void)[] = [];
  let geometryCleanups: (() => void)[] = [];
  let observedNodes: HTMLElement[] = [];
  let remembered: Range | undefined;
  let suppressed: Range | undefined;
  let disposed = false;
  let composing = false;
  let frame = 0;
  let geometryEpoch = 0;
  let focusRequested = false;
  const report = (error: unknown): void => {
    try { options.onError?.(error); }
    catch { /* Diagnostics cannot interrupt cleanup or committed editing. */ }
  };
  const release = (operations: (() => void)[]): unknown[] => {
    const failures: unknown[] = [];
    for (const operation of operations.splice(0).reverse()) {
      try { operation(); }
      catch (error) { failures.push(error); }
    }
    return failures;
  };
  const stopGeometry = (): void => {
    geometryEpoch++;
    focusRequested = false;
    if (frame) view.cancelAnimationFrame(frame);
    frame = 0;
    observedNodes = [];
    const failures = release(geometryCleanups);
    if (failures.length) throw new AggregateError(failures, 'Contextual geometry cleanup failed.');
  };
  const dismiss = (): void => {
    if (remembered) suppressed = remembered.cloneRange();
    else suppressed = nativeContextualRange(editor);
    focusRequested = false;
    element.hidden = true;
    stopGeometry();
  };
  const layout = (): void => {
    if (disposed || !geometryCleanups.length) return;
    if (editor.isReadOnly() || composing || !remembered || !validContextualRange(editor, remembered, false)
      || prefersContextualRange(editor, remembered)) {
      element.hidden = true;
      stopGeometry();
      remembered = undefined;
      return;
    }
    if (document.activeElement !== surface && !surface.contains(document.activeElement) && !element.contains(document.activeElement)) {
      dismiss();
      remembered = undefined;
      return;
    }
    const anchor = contextualAnchor(surface, remembered);
    if (!anchor) {
      element.hidden = true;
      focusRequested = false;
      return;
    }
    element.style.visibility = 'hidden';
    element.hidden = false;
    try {
      placeContextualToolbar(element, anchor, gap);
    }
    finally { element.style.removeProperty('visibility'); }
    if (focusRequested) {
      focusRequested = false;
      element.querySelector<HTMLElement>('button:enabled,select:enabled,input:enabled')?.focus();
    }
  };
  const schedule = (): void => {
    if (disposed || frame || !geometryCleanups.length) return;
    const epoch = geometryEpoch;
    frame = view.requestAnimationFrame(() => {
      if (disposed || epoch !== geometryEpoch || !geometryCleanups.length) return;
      frame = 0;
      try { layout(); }
      catch (error) {
        report(error);
        dismiss();
      }
    });
  };
  const startGeometry = (nodes: HTMLElement[]): void => {
    if (geometryCleanups.length) return;
    const pending: (() => void)[] = [];
    try {
      document.addEventListener('scroll', schedule, true);
      pending.push(() => document.removeEventListener('scroll', schedule, true));
      view.addEventListener('resize', schedule);
      pending.push(() => view.removeEventListener('resize', schedule));
      const viewport = view.visualViewport;
      if (viewport) {
        viewport.addEventListener('resize', schedule);
        viewport.addEventListener('scroll', schedule);
        pending.push(() => {
          viewport.removeEventListener('resize', schedule);
          viewport.removeEventListener('scroll', schedule);
        });
      }
      if (typeof view.ResizeObserver === 'function') {
        const observer = new view.ResizeObserver(schedule);
        pending.push(() => observer.disconnect());
        observer.observe(element);
        for (const node of nodes) observer.observe(node);
      }
      geometryCleanups = pending;
      observedNodes = nodes;
    }
    catch (error) {
      release(pending);
      throw error;
    }
  };
  const refresh = (): void => {
    if (disposed) throw new Error('Contextual toolbar has been destroyed.');
    if (editor.isReadOnly() || composing) {
      dismiss();
      return;
    }
    const editorFocused = document.activeElement === surface || surface.contains(document.activeElement);
    const ownFocused = element.contains(document.activeElement);
    const native = editorFocused ? nativeContextualRange(editor) : undefined;
    const range = native ?? (ownFocused && remembered && validContextualRange(editor, remembered) ? remembered : undefined);
    if (range && prefersContextualRange(editor, range)) {
      element.hidden = true;
      stopGeometry();
      remembered = undefined;
      return;
    }
    if (!range) {
      if (!editorFocused && !ownFocused && remembered) dismiss();
      else {
        element.hidden = true;
        stopGeometry();
      }
      remembered = undefined;
      return;
    }
    if (suppressed && sameContextualRange(range, suppressed)) {
      element.hidden = true;
      stopGeometry();
      return;
    }
    suppressed = undefined;
    remembered = range.cloneRange();
    if (native) selection.capture();
    shell.refresh();
    const toolbar = element.querySelector<HTMLElement>('[role="toolbar"]')!;
    toolbar.setAttribute('aria-label', options.label ?? message('ui.contextual.label'));
    toolbar.title = message('ui.contextual.help');
    const common = range.commonAncestorContainer;
    const nodes: HTMLElement[] = [];
    for (let node = common.nodeType === 1 ? common as HTMLElement : common.parentElement; node; node = node.parentElement) nodes.push(node);
    if (geometryCleanups.length && (nodes.length !== observedNodes.length || nodes.some((node, index) => node !== observedNodes[index]))) {
      const requested = focusRequested;
      stopGeometry();
      focusRequested = requested;
    }
    startGeometry(nodes);
    schedule();
  };
  const discover = (): void => {
    if (disposed) return;
    try { refresh(); }
    catch (error) {
      report(error);
      dismiss();
    }
  };
  const keyboard = (event: KeyboardEvent): void => {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape' && !element.hidden && (element.contains(event.target as Node) || surface.contains(event.target as Node))) {
      event.preventDefault();
      event.stopPropagation();
      dismiss();
      if (!selection.restore()) editor.focus();
      return;
    }
    if (event.altKey && !event.ctrlKey && !event.metaKey && event.key === 'F10' && surface.contains(event.target as Node)
      && !editor.isReadOnly() && !composing) {
      const range = nativeContextualRange(editor);
      if (!range || prefersContextualRange(editor, range)) return;
      event.preventDefault();
      suppressed = undefined;
      focusRequested = true;
      refresh();
    }
  };
  const fresh = (): void => {
    if (disposed) return;
    suppressed = undefined;
    discover();
  };
  const selectionKey = (event: KeyboardEvent): void => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)
      || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a')) fresh();
  };
  const outside = (event: PointerEvent): void => {
    if (!element.contains(event.target as Node)) dismiss();
  };
  const guard = (event: Event): void => {
    if (!element.hidden && !editor.isReadOnly() && !composing) {
      const ownFocused = element.contains(document.activeElement);
      const editorFocused = document.activeElement === surface || surface.contains(document.activeElement);
      const native = editorFocused ? nativeContextualRange(editor) : undefined;
      const range = native ?? (ownFocused && remembered && validContextualRange(editor, remembered) ? remembered : undefined);
      if (range && !prefersContextualRange(editor, range)) {
        if (native) {
          remembered = native.cloneRange();
          selection.capture();
        }
        return;
      }
      dismiss();
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const focusOut = (): void => {
    view.queueMicrotask(discover);
  };
  const startComposition = (): void => {
    if (editor.isReadOnly()) return;
    composing = true;
    dismiss();
  };
  const endComposition = (): void => {
    composing = false;
    dismiss();
  };
  const listen = (target: EventTarget, type: keyof HTMLElementEventMap, listener: EventListener, capture = false): void => {
    cleanups.push(listenToUI(target, type, listener, capture));
  };
  const destroy = (): void => {
    if (disposed) return;
    disposed = true;
    const failures = release(cleanups);
    for (const cleanup of [stopGeometry, () => selection.destroy(), () => shell.destroy()]) {
      try { cleanup(); }
      catch (error) { failures.push(error); }
    }
    element.remove();
    if (failures.length) throw new AggregateError(failures, 'Contextual toolbar cleanup failed.');
  };
  try {
    listen(element, 'keydown', keyboard as EventListener, true);
    listen(surface, 'keydown', keyboard as EventListener, true);
    listen(surface, 'keyup', selectionKey as EventListener);
    listen(surface, 'pointerup', fresh);
    listen(surface, 'focusin', discover);
    listen(element, 'focusout', focusOut);
    listen(surface, 'focusout', focusOut);
    listen(element, 'click', guard, true);
    listen(element, 'change', guard, true);
    listen(element, 'keydown', guard, true);
    listen(element, 'pointerdown', guard, true);
    listen(document, 'pointerdown', outside as EventListener, true);
    listen(surface, 'compositionstart', startComposition);
    listen(surface, 'compositionend', endComposition);
    cleanups.push(
      onContextualPreferenceChange(editor, discover),
      editor.onSelectionChange(discover),
      editor.events.on('localechange', discover),
      editor.events.on('readonlychange', () => {
        composing = false;
        dismiss();
      }),
      editor.subscribe((change) => {
        if (change.source === 'api') {
          composing = false;
          dismiss();
          remembered = undefined;
        }
        else discover();
      }),
      editor.events.on('destroy', destroy),
    );
    host.append(element);
    refresh();
  }
  catch (error) {
    try { destroy(); }
    catch { /* Preserve the setup failure after releasing all owned resources. */ }
    throw error;
  }
  return { element, refresh, destroy };
};
