import { localize } from '@morfira-dev/wysiwyg-core';
import type { Editor } from '@morfira-dev/wysiwyg-core';
import { createFormSelection } from '../shared/selection.js';
import { createLinkForm } from '../links/index.js';
import type { LinkFormController } from '../links/types.js';
import { contextualAnchor, placeContextualToolbar } from '../contextual/geometry.js';
import { sameContextualRange } from '../contextual/selection.js';
import { contextualLinkUIMessages } from './messages.js';
import { contextualLinkRange, contextualLinkTarget, contextualLinkURL, nativeContextualLink, ordinaryContextualAnchor } from './target.js';
import type { ContextualLinkTarget } from './internal-types.js';
import type { ContextualLinkUIController, ContextualLinkUIOptions } from './types.js';

export { contextualLinkUIMessages } from './messages.js';
export type { ContextualLinkUIController, ContextualLinkUIOptions, ContextualLinkUIMessageKey } from './types.js';

export const createContextualLinkUI = (host: HTMLElement, editor: Editor, options: ContextualLinkUIOptions = {}): ContextualLinkUIController => {
  editor.getLocale();
  const surface = editor.surface;
  const document = surface.ownerDocument;
  if (host.ownerDocument !== document || !host.isConnected || host.childNodes.length || surface.contains(host)
    || host.namespaceURI !== 'http://www.w3.org/1999/xhtml') throw new Error('Contextual links need an empty connected external HTML host.');
  if (!options || typeof options !== 'object' || Array.isArray(options)
    || Object.keys(options).some((key) => !['label', 'gap', 'onError'].includes(key))) throw new TypeError('Expected contextual link options.');
  if (options.label !== undefined && typeof options.label !== 'string') throw new TypeError('The link action label must be text.');
  if (options.onError !== undefined && typeof options.onError !== 'function') throw new TypeError('The link error handler must be a callback.');
  const gap = options.gap === undefined ? 8 : options.gap;
  if (typeof gap !== 'number' || !Number.isFinite(gap) || gap < 0 || gap > 32) throw new TypeError('Link action gap must be 0–32 CSS pixels.');
  const view = document.defaultView!;
  const element = document.createElement('section');
  element.className = 'mw-contextual-link';
  element.setAttribute('role', 'group');
  element.hidden = true;
  const preview = document.createElement('div');
  preview.className = 'mw-contextual-link-preview';
  const url = document.createElement('span');
  url.className = 'mw-contextual-link-url';
  const actions = document.createElement('div');
  actions.className = 'mw-contextual-link-actions';
  const open = document.createElement('a');
  open.dataset.mwLinkAction = 'open';
  open.target = '_blank';
  open.rel = 'noopener noreferrer';
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.dataset.mwLinkAction = 'edit';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.dataset.mwLinkAction = 'remove';
  actions.append(open, edit, remove);
  preview.append(url, actions);
  const formHost = document.createElement('div');
  formHost.hidden = true;
  element.append(preview, formHost);
  const selection = createFormSelection(editor);
  const cleanups: (() => void)[] = [];
  let geometryCleanups: (() => void)[] = [];
  let observed: HTMLElement[] = [];
  let current: ContextualLinkTarget | undefined;
  let suppressed: ContextualLinkTarget | undefined;
  let form: LinkFormController | undefined;
  let disposed = false;
  let composing = false;
  let apiRevision = 0;
  let epoch = 0;
  let frame = 0;
  let focusRequested = false;
  let openEvent: MouseEvent | undefined;
  let restoring = 0;
  let closingForm = false;
  const message = (key: keyof typeof contextualLinkUIMessages.en): string => localize(editor.getLocale(), key, contextualLinkUIMessages);
  const report = (error: unknown): void => {
    try { options.onError?.(error); }
    catch { /* Diagnostics cannot prevent required cleanup. */ }
  };
  const release = (operations: (() => void)[]): unknown[] => {
    const failures: unknown[] = [];
    for (const operation of operations.splice(0).reverse()) {
      try { operation(); }
      catch (error) { failures.push(error); }
    }
    return failures;
  };
  const scrubOpen = (): void => {
    openEvent?.preventDefault();
    openEvent = undefined;
    open.removeAttribute('href');
  };
  const closeForm = (): void => {
    if (closingForm) return;
    closingForm = true;
    const previous = form;
    form = undefined;
    try { previous?.destroy(); }
    finally {
      try {
        formHost.replaceChildren();
        formHost.hidden = true;
        preview.hidden = false;
      }
      finally { closingForm = false; }
    }
  };
  const stopGeometry = (): void => {
    epoch++;
    focusRequested = false;
    if (frame) view.cancelAnimationFrame(frame);
    frame = 0;
    observed = [];
    const failures = release(geometryCleanups);
    if (failures.length) throw new AggregateError(failures, 'Link geometry cleanup failed.');
  };
  const dismiss = (): void => {
    if (current) suppressed = { ...current, range: current.range.cloneRange() };
    element.hidden = true;
    scrubOpen();
    const failures: unknown[] = [];
    for (const cleanup of [stopGeometry, closeForm]) {
      try { cleanup(); }
      catch (error) { failures.push(error); }
    }
    if (failures.length) throw new AggregateError(failures, 'Link dismissal failed.');
  };
  const focusedEditor = (): boolean => document.activeElement === surface || surface.contains(document.activeElement);
  const inspectCurrent = (): ContextualLinkTarget | undefined => {
    if (!current || !ordinaryContextualAnchor(editor, current.anchor)) return;
    const candidate = focusedEditor() ? nativeContextualLink(editor)
      : element.contains(document.activeElement) ? contextualLinkTarget(editor, current.range) : undefined;
    return candidate?.anchor === current.anchor ? candidate : undefined;
  };
  const layout = (): void => {
    if (disposed || !geometryCleanups.length || !current) return;
    if (composing || !ordinaryContextualAnchor(editor, current.anchor)
      || (!focusedEditor() && !element.contains(document.activeElement))) {
      dismiss();
      return;
    }
    const freshURL = contextualLinkURL(editor, current.anchor);
    if (!freshURL) { dismiss(); return; }
    current.url = freshURL;
    url.textContent = freshURL.display;
    url.title = freshURL.display;
    const anchor = contextualAnchor(surface, contextualLinkRange(current.anchor));
    if (!anchor) {
      element.hidden = true;
      scrubOpen();
      focusRequested = false;
      return;
    }
    element.style.visibility = 'hidden';
    element.hidden = false;
    try { placeContextualToolbar(element, anchor, gap); }
    finally { element.style.removeProperty('visibility'); }
    if (preview.hidden) scrubOpen();
    else open.href = current.url.href;
    if (focusRequested) {
      focusRequested = false;
      open.focus();
    }
  };
  const schedule = (): void => {
    if (disposed || frame || !geometryCleanups.length) return;
    const revision = epoch;
    frame = view.requestAnimationFrame(() => {
      if (disposed || revision !== epoch || !geometryCleanups.length) return;
      frame = 0;
      try { layout(); }
      catch (error) { report(error); dismiss(); }
    });
  };
  const geometry = (nodes: HTMLElement[]): void => {
    if (geometryCleanups.length && observed.length === nodes.length && nodes.every((node, index) => node === observed[index])) return;
    const requested = focusRequested;
    stopGeometry();
    focusRequested = requested;
    const pending: (() => void)[] = [];
    try {
      document.addEventListener('scroll', schedule, true);
      view.addEventListener('resize', schedule);
      pending.push(() => document.removeEventListener('scroll', schedule, true), () => view.removeEventListener('resize', schedule));
      const viewport = view.visualViewport;
      if (viewport) {
        viewport.addEventListener('scroll', schedule);
        viewport.addEventListener('resize', schedule);
        pending.push(() => {
          viewport.removeEventListener('scroll', schedule);
          viewport.removeEventListener('resize', schedule);
        });
      }
      if (typeof view.ResizeObserver === 'function') {
        const observer = new view.ResizeObserver(schedule);
        pending.push(() => observer.disconnect());
        observer.observe(element);
        for (const node of nodes) observer.observe(node);
      }
      geometryCleanups = pending;
      observed = nodes;
    }
    catch (error) { release(pending); throw error; }
  };
  const refresh = (): void => {
    if (disposed) throw new Error('Contextual link UI has been destroyed.');
    if (restoring) return;
    if (composing) { dismiss(); return; }
    const candidate = focusedEditor() ? nativeContextualLink(editor)
      : element.contains(document.activeElement) && current ? contextualLinkTarget(editor, current.range) : undefined;
    if (!candidate) {
      if (current) dismiss();
      else { element.hidden = true; scrubOpen(); stopGeometry(); }
      current = undefined;
      return;
    }
    if (suppressed?.anchor === candidate.anchor && sameContextualRange(suppressed.range, candidate.range)) {
      element.hidden = true;
      scrubOpen();
      stopGeometry();
      return;
    }
    suppressed = undefined;
    if (form && current?.anchor !== candidate.anchor) closeForm();
    current = candidate;
    selection.capture();
    element.setAttribute('aria-label', options.label ?? message('ui.contextualLink.label'));
    element.title = message('ui.contextualLink.help');
    open.textContent = message('ui.contextualLink.open');
    edit.textContent = message('ui.contextualLink.edit');
    remove.textContent = message('ui.contextualLink.remove');
    edit.disabled = remove.disabled = editor.isReadOnly();
    url.textContent = candidate.url.display;
    url.title = candidate.url.display;
    if (preview.hidden) scrubOpen();
    else open.href = candidate.url.href;
    const nodes: HTMLElement[] = [];
    for (let node: HTMLElement | null = candidate.anchor; node; node = node.parentElement) nodes.push(node);
    geometry(nodes);
    schedule();
  };
  const discover = (): void => {
    if (disposed || restoring) return;
    try { refresh(); }
    catch (error) { report(error); dismiss(); }
  };
  const restoreTarget = (): ContextualLinkTarget | undefined => {
    const previous = current;
    const revision = apiRevision;
    if (!previous) return;
    restoring++;
    try {
      if (!selection.restore() || disposed || revision !== apiRevision) return;
      const target = nativeContextualLink(editor);
      if (target?.anchor !== previous.anchor) return;
      current = target;
      return target;
    }
    finally {
      restoring--;
      if (!disposed && revision === apiRevision) discover();
    }
  };
  const guard = (event: Event): void => {
    if (closingForm) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const node = event.target as Node;
    const control = node.nodeType === 1 ? node as Element : node.parentElement;
    if (control?.closest('[hidden]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (!disposed && !element.hidden && !composing) {
      const target = inspectCurrent();
      if (target && contextualAnchor(surface, contextualLinkRange(target.anchor))) {
        current = target;
        selection.capture();
        return;
      }
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!disposed) dismiss();
  };
  const opened = (event: MouseEvent): void => {
    const target = inspectCurrent();
    if (!target || disposed || element.hidden || composing) {
      event.preventDefault();
      scrubOpen();
      return;
    }
    open.href = target.url.href;
    open.target = '_blank';
    open.rel = 'noopener noreferrer';
    openEvent = event;
    view.queueMicrotask(() => { if (openEvent === event) openEvent = undefined; });
  };
  const edited = (): void => {
    if (disposed || composing || editor.isReadOnly()) return;
    const revision = apiRevision;
    const target = restoreTarget();
    if (!target) { dismiss(); return; }
    if (disposed || composing || editor.isReadOnly() || revision !== apiRevision) return;
    if (form) return;
    const created = createLinkForm(formHost, editor, { onError: report });
    form = created;
    scrubOpen();
    preview.hidden = true;
    formHost.hidden = false;
    created.element.querySelector<HTMLInputElement>('input')?.focus();
    if (disposed || revision !== apiRevision || form !== created || !current || current.anchor !== target.anchor
      || !contextualLinkTarget(editor, target.range)) {
      if (!disposed) dismiss();
      return;
    }
    schedule();
  };
  const removed = (): void => {
    if (disposed || composing || editor.isReadOnly()) return;
    if (!restoreTarget()) { dismiss(); return; }
    if (disposed || composing || editor.isReadOnly()) return;
    editor.format('link', false);
    dismiss();
    current = undefined;
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
      && !composing && nativeContextualLink(editor)) {
      event.preventDefault();
      suppressed = undefined;
      focusRequested = true;
      refresh();
    }
  };
  const pointer = (event: PointerEvent): void => {
    selection.capture();
    if (event.target instanceof Element && event.target.closest('button,[data-mw-link-action="open"]')) event.preventDefault();
  };
  const outside = (event: PointerEvent): void => { if (!element.contains(event.target as Node)) dismiss(); };
  const fresh = (): void => { suppressed = undefined; discover(); };
  const selectionKey = (event: KeyboardEvent): void => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) fresh();
  };
  const contentClick = (event: MouseEvent): void => {
    if (editor.isReadOnly() || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const node = event.target as Node;
    const anchor = (node.nodeType === 1 ? node as Element : node.parentElement)?.closest<HTMLAnchorElement>('a');
    if (anchor && ordinaryContextualAnchor(editor, anchor)) {
      const range = contextualLinkRange(anchor);
      range.collapse(true);
      if (contextualLinkTarget(editor, range)) event.preventDefault();
    }
  };
  const focusOut = (event: FocusEvent): void => {
    const next = event.relatedTarget;
    if (next instanceof view.Node && (surface.contains(next) || element.contains(next))) return;
    view.queueMicrotask(discover);
  };
  const focusIn = (event: FocusEvent): void => {
    const previous = event.relatedTarget;
    if (previous instanceof view.Node && element.contains(previous)) view.queueMicrotask(discover);
    else discover();
  };
  const startComposition = (): void => { if (!editor.isReadOnly()) { composing = true; dismiss(); } };
  const endComposition = (): void => { composing = false; dismiss(); };
  const listen = (target: EventTarget, type: string, callback: EventListener, capture = false): void => {
    target.addEventListener(type, callback, capture);
    cleanups.push(() => target.removeEventListener(type, callback, capture));
  };
  const destroy = (): void => {
    if (disposed) return;
    disposed = true;
    scrubOpen();
    const failures = release(cleanups);
    for (const cleanup of [stopGeometry, closeForm, () => selection.destroy()]) {
      try { cleanup(); }
      catch (error) { failures.push(error); }
    }
    element.remove();
    if (failures.length) throw new AggregateError(failures, 'Contextual link cleanup failed.');
  };
  try {
    listen(element, 'keydown', keyboard as EventListener, true);
    listen(surface, 'keydown', keyboard as EventListener, true);
    for (const type of ['click', 'auxclick', 'pointerdown', 'keydown']) listen(element, type, guard, true);
    listen(element, 'pointerdown', pointer as EventListener);
    listen(open, 'click', opened as EventListener);
    listen(open, 'auxclick', opened as EventListener);
    listen(edit, 'click', edited);
    listen(remove, 'click', removed);
    listen(surface, 'click', contentClick as EventListener, true);
    listen(surface, 'pointerup', fresh);
    listen(surface, 'keyup', selectionKey as EventListener);
    listen(surface, 'focusin', focusIn as EventListener);
    listen(surface, 'focusout', focusOut as EventListener);
    listen(element, 'focusout', focusOut as EventListener);
    listen(document, 'pointerdown', outside as EventListener, true);
    listen(surface, 'compositionstart', startComposition);
    listen(surface, 'compositionend', endComposition);
    cleanups.push(
      editor.onSelectionChange(discover),
      editor.events.on('localechange', discover),
      editor.events.on('readonlychange', () => {
        composing = false;
        if (editor.isReadOnly()) closeForm();
        discover();
      }),
      editor.subscribe((change) => {
        if (change.source === 'api') {
          apiRevision++;
          composing = false;
          dismiss();
          current = undefined;
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
    catch { /* Preserve setup failure after releasing every owned resource. */ }
    throw error;
  }
  return { element, refresh, destroy };
};
