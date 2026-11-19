import { localize } from '@morfira-dev/wysiwyg-core';
import type { Editor } from '@morfira-dev/wysiwyg-core';
import { createFormSelection } from '../shared/selection.js';
import { createImageFormBase as createImageForm } from '../images/form-base.js';
import { imageCommands } from '../../images/index.js';
import type { ImageFormController } from '../images/types.js';
import { contextualAnchor, placeContextualToolbar } from '../contextual/geometry.js';
import { sameContextualRange } from '../contextual/selection.js';
import { contextualImageUIMessages } from './messages.js';
import { contextualImageTarget, nativeContextualImage, ordinaryContextualImage } from './target.js';
import type { ContextualImageTarget } from './internal-types.js';
import type { ContextualImageUIController, ContextualImageUIOptions } from './types.js';

export { contextualImageUIMessages } from './messages.js';
export type { ContextualImageUIController, ContextualImageUIOptions, ContextualImageUIMessageKey } from './types.js';

export const createContextualImageUI = (host: HTMLElement, editor: Editor, options: ContextualImageUIOptions = {}): ContextualImageUIController => {
  editor.getLocale();
  const api = imageCommands(editor);
  const surface = editor.surface;
  const document = surface.ownerDocument;
  if (host.ownerDocument !== document || !host.isConnected || host.childNodes.length || surface.contains(host)
    || host.namespaceURI !== 'http://www.w3.org/1999/xhtml') throw new Error('Contextual images need an empty connected external HTML host.');
  if (!options || typeof options !== 'object' || Array.isArray(options)
    || Object.keys(options).some((key) => !['label', 'gap', 'onError'].includes(key))) throw new TypeError('Expected contextual image options.');
  if (options.label !== undefined && typeof options.label !== 'string') throw new TypeError('The image action label must be text.');
  if (options.onError !== undefined && typeof options.onError !== 'function') throw new TypeError('The image error handler must be a callback.');
  const gap = options.gap === undefined ? 8 : options.gap;
  if (typeof gap !== 'number' || !Number.isFinite(gap) || gap < 0 || gap > 32) throw new TypeError('Image action gap must be 0–32 CSS pixels.');
  const view = document.defaultView!;
  const element = document.createElement('section');
  element.className = 'mw-contextual-image';
  element.setAttribute('role', 'group');
  element.hidden = true;
  const preview = document.createElement('div');
  preview.className = 'mw-contextual-image-preview';
  const summary = document.createElement('span');
  summary.className = 'mw-contextual-image-summary';
  const dimensions = document.createElement('span');
  dimensions.className = 'mw-contextual-image-dimensions';
  const actions = document.createElement('div');
  actions.className = 'mw-contextual-image-actions';
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.dataset.mwImageAction = 'edit';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.dataset.mwImageAction = 'remove';
  actions.append(edit, remove);
  preview.append(summary, dimensions, actions);
  const formHost = document.createElement('div');
  formHost.hidden = true;
  element.append(preview, formHost);
  const selection = createFormSelection(editor);
  const cleanups: (() => void)[] = [];
  let geometryCleanups: (() => void)[] = [];
  let observed: HTMLElement[] = [];
  let current: ContextualImageTarget | undefined;
  let suppressed: ContextualImageTarget | undefined;
  let form: ImageFormController | undefined;
  let disposed = false;
  let composing = false;
  let apiRevision = 0;
  let epoch = 0;
  let frame = 0;
  let focusRequested = false;
  let restoring = 0;
  let closingForm = false;
  const message = (key: keyof typeof contextualImageUIMessages.en): string => localize(editor.getLocale(), key, contextualImageUIMessages);
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
    if (failures.length) throw new AggregateError(failures, 'Image geometry cleanup failed.');
  };
  const dismiss = (): void => {
    if (current) suppressed = { ...current, range: current.range.cloneRange() };
    element.hidden = true;
    const failures: unknown[] = [];
    for (const cleanup of [stopGeometry, closeForm]) {
      try { cleanup(); }
      catch (error) { failures.push(error); }
    }
    if (failures.length) throw new AggregateError(failures, 'Image dismissal failed.');
  };
  const focusedEditor = (): boolean => document.activeElement === surface || surface.contains(document.activeElement);
  const inspectCurrent = (): ContextualImageTarget | undefined => {
    if (!current || !ordinaryContextualImage(editor, current.image)) return;
    const candidate = focusedEditor() ? nativeContextualImage(editor)
      : element.contains(document.activeElement) ? contextualImageTarget(editor, current.range) : undefined;
    return candidate?.image === current.image ? candidate : undefined;
  };
  const layout = (): void => {
    if (disposed || !geometryCleanups.length || !current) return;
    const target = inspectCurrent();
    if (composing || !target) {
      dismiss();
      return;
    }
    current = target;
    const anchor = contextualAnchor(surface, target.range);
    if (!anchor) {
      element.hidden = true;
      focusRequested = false;
      return;
    }
    element.style.visibility = 'hidden';
    element.hidden = false;
    try { placeContextualToolbar(element, anchor, gap); }
    finally { element.style.removeProperty('visibility'); }
    if (focusRequested) {
      focusRequested = false;
      if (form) form.element.querySelector<HTMLInputElement>('input:enabled')?.focus();
      else if (!edit.disabled) edit.focus();
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
    if (disposed) throw new Error('Contextual image UI has been destroyed.');
    if (restoring) return;
    if (composing) { dismiss(); return; }
    const candidate = focusedEditor() ? nativeContextualImage(editor)
      : element.contains(document.activeElement) && current ? contextualImageTarget(editor, current.range) : undefined;
    if (!candidate) {
      if (current) dismiss();
      else { element.hidden = true; stopGeometry(); }
      current = undefined;
      return;
    }
    if (suppressed?.image === candidate.image && sameContextualRange(suppressed.range, candidate.range)) {
      element.hidden = true;
      stopGeometry();
      return;
    }
    suppressed = undefined;
    if (form && current?.image !== candidate.image) closeForm();
    current = candidate;
    selection.capture();
    element.setAttribute('aria-label', options.label ?? message('ui.contextualImage.label'));
    element.title = message('ui.contextualImage.help');
    edit.textContent = message('ui.contextualImage.edit');
    remove.textContent = message('ui.contextualImage.remove');
    edit.disabled = remove.disabled = editor.isReadOnly();
    summary.textContent = candidate.image.getAttribute('alt') || message('ui.contextualImage.image');
    summary.title = summary.textContent;
    const width = candidate.image.getAttribute('width');
    const height = candidate.image.getAttribute('height');
    dimensions.textContent = width || height ? `${width || message('ui.contextualImage.auto')} × ${height || message('ui.contextualImage.auto')}` : message('ui.contextualImage.natural');
    const nodes: HTMLElement[] = [];
    for (let node: HTMLElement | null = candidate.image; node; node = node.parentElement) nodes.push(node);
    geometry(nodes);
    schedule();
  };
  const discover = (): void => {
    if (disposed || restoring) return;
    try { refresh(); }
    catch (error) { report(error); dismiss(); }
  };
  const restoreTarget = (): ContextualImageTarget | undefined => {
    const previous = current;
    const revision = apiRevision;
    if (!previous) return;
    restoring++;
    try {
      if (!selection.restore() || disposed || revision !== apiRevision) return;
      const target = nativeContextualImage(editor);
      if (target?.image !== previous.image) return;
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
      if (target && contextualAnchor(surface, target.range)) {
        current = target;
        selection.capture();
        return;
      }
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!disposed) dismiss();
  };
  const edited = (): void => {
    if (disposed || composing || editor.isReadOnly()) return;
    const revision = apiRevision;
    const target = restoreTarget();
    if (!target) { dismiss(); return; }
    if (disposed || composing || editor.isReadOnly() || revision !== apiRevision) return;
    if (form) return;
    const created = createImageForm(formHost, editor, { mode: 'edit', onError: report });
    form = created;
    preview.hidden = true;
    formHost.hidden = false;
    created.element.querySelector<HTMLInputElement>('input')?.focus();
    if (disposed || revision !== apiRevision || form !== created || !current || current.image !== target.image
      || !contextualImageTarget(editor, target.range)) {
      if (!disposed) dismiss();
      return;
    }
    schedule();
  };
  const removed = (): void => {
    if (disposed || composing || editor.isReadOnly()) return;
    if (!restoreTarget()) { dismiss(); return; }
    if (disposed || composing || editor.isReadOnly()) return;
    api.remove();
    dismiss();
    current = undefined;
  };
  const keyboard = (event: KeyboardEvent): void => {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape' && (!element.hidden || focusRequested) && (element.contains(event.target as Node) || surface.contains(event.target as Node))) {
      event.preventDefault();
      event.stopPropagation();
      dismiss();
      if (!disposed) selection.restore();
      return;
    }
    if (event.altKey && !event.ctrlKey && !event.metaKey && event.key === 'F10' && surface.contains(event.target as Node)
      && !composing && !editor.isReadOnly() && nativeContextualImage(editor)) {
      event.preventDefault();
      suppressed = undefined;
      focusRequested = true;
      refresh();
    }
  };
  const pointer = (event: PointerEvent): void => {
    selection.capture();
    if (event.target instanceof Element && event.target.closest('button')) event.preventDefault();
    if (event.button !== 0 || !event.cancelable || !(event.target instanceof view.Element)) return;
    const target = event.target.closest('input[type="checkbox"],label');
    const input = target instanceof view.HTMLLabelElement ? target.control : target;
    if (input instanceof view.HTMLInputElement && input.type === 'checkbox' && !input.disabled) {
      // WebKit on macOS blurs text inputs without focusing a clicked checkbox.
      // Keep ownership inside this form; the subsequent native click still toggles it.
      event.preventDefault();
      input.focus({ preventScroll: true });
    }
  };
  const outside = (event: PointerEvent): void => { if (!element.contains(event.target as Node)) dismiss(); };
  const fresh = (): void => { suppressed = undefined; discover(); };
  const selectionKey = (event: KeyboardEvent): void => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) fresh();
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
    const failures = release(cleanups);
    for (const cleanup of [stopGeometry, closeForm, () => selection.destroy()]) {
      try { cleanup(); }
      catch (error) { failures.push(error); }
    }
    element.remove();
    if (failures.length) throw new AggregateError(failures, 'Contextual image cleanup failed.');
  };
  try {
    listen(element, 'keydown', keyboard as EventListener, true);
    listen(surface, 'keydown', keyboard as EventListener, true);
    for (const type of ['click', 'pointerdown', 'keydown']) listen(element, type, guard, true);
    listen(element, 'pointerdown', pointer as EventListener);
    listen(edit, 'click', edited);
    listen(remove, 'click', removed);
    listen(surface, 'click', fresh);
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
