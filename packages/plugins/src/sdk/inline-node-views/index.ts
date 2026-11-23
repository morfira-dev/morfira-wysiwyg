import type { Editor } from '@morfira-dev/wysiwyg-core';
import { registeredNode } from '../node-extension/index.js';
import type { InlineNodeViewsController, InlineNodeViewsOptions, NodeView, NodeViewContext } from '../types.js';
import type { InlineViewEntry } from './internal-types.js';

/** Visual projection inside the editor box; canonical source always stays in surface. */
export const createInlineNodeViews = (editor: Editor, options: InlineNodeViewsOptions): InlineNodeViewsController => {
  const registration = registeredNode(editor, options.name);
  const root = editor.surface;
  const container = editor.element;
  const document = root.ownerDocument;
  const window = document.defaultView;
  if (!window || !container.isConnected || !root.isConnected || root.parentElement !== container)
    throw new Error('Inline node views require a connected editor.');
  if (window.getComputedStyle(container).position === 'static')
    throw new Error('Inline node views require a positioned editor container.');
  if (typeof options.create !== 'function' || options.onError !== undefined && typeof options.onError !== 'function')
    throw new TypeError('Inline node views require create and an optional error callback.');
  if (!registration.atomic && (registration.spec.kind !== 'block' || registration.spec.content?.type !== 'text'))
    throw new TypeError('Inline node views support atomic inline or text-only block extensions.');
  const key = `sdk:inline-views:${options.name}`;
  if (editor.getPlugin(key)) throw new Error('This node already has an inline view controller.');
  const create = options.create;
  const onError = options.onError;
  const layer = document.createElement('div');
  layer.className = 'mw-inline-node-views';
  layer.setAttribute('aria-hidden', 'true');
  Object.assign(layer.style, { position: 'absolute', inset: '0', overflow: 'hidden', pointerEvents: 'none', zIndex: 'var(--mw-node-view-z-index, 2)' });
  const entries = new Map<HTMLElement, InlineViewEntry>();
  const elements = new Set<HTMLElement>();
  const cleanups: (() => void)[] = [];
  let disposed = false;
  let refreshing = false;
  let composing = false;
  let frame: number | undefined;
  let contextVersion = 0;
  const owned = (): boolean => !disposed && container.isConnected && root.isConnected
    && root.parentElement === container && layer.parentElement === container && !root.contains(layer);
  const eligible = (node: Element): node is HTMLElement => {
    if (!registration.owns(node) || [...node.childNodes].some((child) => child.nodeType !== 3)) return false;
    if (registration.atomic && node.getAttribute('contenteditable') !== 'false') return false;
    const copy = node.cloneNode(true) as HTMLElement;
    copy.removeAttribute('contenteditable');
    try { return editor.schema.sanitizeHTML(copy.outerHTML) === copy.outerHTML; }
    catch { return false; }
  };
  const context = (node: HTMLElement): NodeViewContext => Object.freeze({
    editor, node,
    attributes: Object.freeze(Object.fromEntries([...node.attributes].filter((attribute) => attribute.name !== 'contenteditable').map((attribute) => [attribute.name, attribute.value]))),
    text: node.textContent ?? '',
    getRect: () => owned() && eligible(node) ? node.getBoundingClientRect() : undefined,
  });
  const remove = (node: HTMLElement): void => {
    const entry = entries.get(node);
    if (!entry) return;
    entries.delete(node);
    elements.delete(entry.view.element);
    resize?.unobserve(node);
    entry.stop();
    try { entry.view.destroy?.(); }
    finally { entry.view.element.remove(); entry.wrapper.remove(); }
  };
  const clear = (): void => {
    const errors: unknown[] = [];
    for (const node of [...entries.keys()]) {
      try { remove(node); }
      catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, 'Inline node view disposal failed.');
  };
  const destroy = (): void => {
    if (disposed) return;
    disposed = true;
    if (frame !== undefined) window.cancelAnimationFrame(frame);
    frame = undefined;
    const errors: unknown[] = [];
    for (const cleanup of cleanups.splice(0).reverse()) {
      try { cleanup(); }
      catch (error) { errors.push(error); }
    }
    try { clear(); }
    catch (error) { errors.push(error); }
    layer.remove();
    if (errors.length) throw new AggregateError(errors, 'Inline node view cleanup failed.');
  };
  const report = (error: unknown): void => {
    try { onError?.(error); }
    catch { /* Error reporting is application-owned and must not leak a scheduled rejection. */ }
  };
  const schedule = (): void => {
    if (disposed || frame !== undefined) return;
    frame = window.requestAnimationFrame(() => {
      frame = undefined;
      try { refresh(false); }
      catch (error) { report(error); }
    });
  };
  const resize = typeof window.ResizeObserver === 'function' ? new window.ResizeObserver(schedule) : undefined;
  const entryOwned = (entry: InlineViewEntry): boolean => entry.wrapper.parentElement === layer
    && entry.view.element.parentElement === entry.wrapper && !root.contains(entry.view.element);
  const geometry = (node: HTMLElement, entry: InlineViewEntry): void => {
    if (!entryOwned(entry)) throw new Error('Inline view output lost its owned layer.');
    const rectangles = node.getClientRects();
    const bounds = node.getBoundingClientRect();
    const origin = layer.getBoundingClientRect();
    const surface = root.getBoundingClientRect();
    const scaleX = origin.width / layer.clientWidth;
    const scaleY = origin.height / layer.clientHeight;
    const visible = rectangles.length === 1 && bounds.width > 0 && bounds.height > 0
      && bounds.right > surface.left && bounds.left < surface.right && bounds.bottom > surface.top && bounds.top < surface.bottom
      && Number.isFinite(scaleX) && scaleX > 0 && Number.isFinite(scaleY) && scaleY > 0;
    entry.wrapper.hidden = !visible;
    if (!visible) return;
    Object.assign(entry.wrapper.style, {
      left: `${(bounds.left - origin.left) / scaleX}px`, top: `${(bounds.top - origin.top) / scaleY}px`,
      width: `${bounds.width / scaleX}px`, height: `${bounds.height / scaleY}px`,
      clipPath: `inset(${Math.max(0, surface.top - bounds.top) / scaleY}px ${Math.max(0, bounds.right - surface.right) / scaleX}px ${Math.max(0, bounds.bottom - surface.bottom) / scaleY}px ${Math.max(0, surface.left - bounds.left) / scaleX}px)`,
    });
  };
  const select = (node: HTMLElement, event: PointerEvent): void => {
    if (event.defaultPrevented || !event.cancelable || event.button !== 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!owned() || composing || editor.isReadOnly() || !eligible(node)) return;
    const before = editor.getHTML();
    const selection = document.getSelection();
    if (!selection) return;
    const previous = selection.rangeCount === 1 ? selection.getRangeAt(0) : undefined;
    const inside = previous && (previous.startContainer === root || root.contains(previous.startContainer))
      && (previous.endContainer === root || root.contains(previous.endContainer));
    const capture = editor.selection.capture();
    if (inside && !capture) return;
    if (capture) editor.selection.release(capture);
    const range = document.createRange();
    range.selectNode(node);
    selection.removeAllRanges();
    selection.addRange(range);
    const current = (): boolean => {
      const actual = selection.rangeCount === 1 ? selection.getRangeAt(0) : undefined;
      return owned() && eligible(node) && editor.getHTML() === before && !!actual
        && actual.startContainer === range.startContainer && actual.startOffset === range.startOffset
        && actual.endContainer === range.endContainer && actual.endOffset === range.endOffset;
    };
    if (!current()) return;
    editor.focus();
    // Native Selection assignment or focus can synchronously run application hooks.
    if (!current()) schedule();
  };
  const refresh = (force = true): void => {
    if (disposed || refreshing) return;
    if (!owned()) { destroy(); return; }
    if (frame !== undefined) window.cancelAnimationFrame(frame);
    frame = undefined;
    refreshing = true;
    try {
      const nodes = [...root.querySelectorAll('[data-mw-node]')].filter(eligible);
      if (nodes.length > 2048) throw new RangeError('Too many inline node views.');
      for (const node of [...entries.keys()]) if (!nodes.includes(node)) remove(node);
      for (const node of nodes) {
        if (!owned() || !eligible(node)) continue;
        let entry = entries.get(node);
        const signature = JSON.stringify(context(node).attributes);
        if (!entry) {
          const returned = create(context(node));
          const element = returned?.element;
          const update = returned?.update;
          const teardown = returned?.destroy;
          if (!returned || !(element instanceof window.HTMLElement) || element.ownerDocument !== document || element.isConnected || elements.has(element)
            || element.contains(container) || update !== undefined && typeof update !== 'function'
            || teardown !== undefined && typeof teardown !== 'function') {
            if (typeof teardown === 'function') teardown.call(returned);
            throw new TypeError('Inline views require fresh detached HTML elements and optional lifecycle callbacks.');
          }
          if (!owned() || !eligible(node)) { teardown?.call(returned); continue; }
          const view: NodeView = { element,
            ...(update ? { update: (next: NodeViewContext) => update.call(returned, next) } : {}),
            ...(teardown ? { destroy: () => teardown.call(returned) } : {}),
          };
          const wrapper = document.createElement('div');
          wrapper.className = 'mw-inline-node-view';
          Object.assign(wrapper.style, { position: 'absolute', overflow: 'hidden', pointerEvents: 'auto', boxSizing: 'border-box', background: 'var(--mw-node-view-bg, var(--mw-surface, #fff))' });
          const inert = element.inert;
          const pointer = element.style.pointerEvents;
          element.inert = true;
          element.style.pointerEvents = 'none';
          wrapper.append(element);
          const pointerdown = (event: PointerEvent): void => select(node, event);
          wrapper.addEventListener('pointerdown', pointerdown);
          const stop = (): void => {
            wrapper.removeEventListener('pointerdown', pointerdown);
            element.inert = inert;
            element.style.pointerEvents = pointer;
          };
          entry = { view, wrapper, text: node.textContent ?? '', attributes: signature, version: contextVersion, stop };
          entries.set(node, entry);
          elements.add(element);
          layer.append(wrapper);
          if (!owned()) continue;
          if (!entryOwned(entry) || !eligible(node)) throw new Error('Inline view ownership changed while mounting.');
          resize?.observe(node);
        }
        else if (force || entry.version !== contextVersion || entry.text !== node.textContent || entry.attributes !== signature) {
          entry.view.update?.(context(node));
          if (!owned() || !eligible(node)) { remove(node); continue; }
          if (!entryOwned(entry)) throw new Error('Inline view ownership changed while updating.');
          entry.text = node.textContent ?? '';
          entry.attributes = signature;
          entry.version = contextVersion;
        }
        geometry(node, entry);
      }
    }
    catch (error) {
      try { destroy(); }
      catch { /* Preserve original rendering failure after releasing every owned view. */ }
      throw error;
    }
    finally { refreshing = false; }
  };
  const controller: InlineNodeViewsController = { element: layer, refresh: () => refresh(true), destroy };
  try {
    container.append(layer);
    cleanups.push(editor.providePlugin(key, controller));
    cleanups.push(editor.subscribe((change) => { if (change.source === 'api') composing = false; schedule(); }));
    cleanups.push(editor.events.on('readonlychange', () => { if (editor.isReadOnly()) composing = false; contextVersion++; schedule(); }), editor.events.on('localechange', () => { contextVersion++; schedule(); }), editor.events.on('destroy', destroy));
    const observer = new window.MutationObserver((records) => {
      if (disposed) return;
      if (!owned()) { try { destroy(); } catch (error) { report(error); } return; }
      if (records.some((record) => record.target === root || root.contains(record.target))) schedule();
    });
    observer.observe(container, { childList: true, subtree: true, characterData: true, attributes: true });
    cleanups.push(() => observer.disconnect());
    resize?.observe(container);
    cleanups.push(() => resize?.disconnect());
    const compositionStart = (): void => { composing = true; };
    const compositionEnd = (): void => { composing = false; schedule(); };
    root.addEventListener('compositionstart', compositionStart);
    root.addEventListener('compositionend', compositionEnd);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    cleanups.push(() => {
      root.removeEventListener('compositionstart', compositionStart);
      root.removeEventListener('compositionend', compositionEnd);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
    });
    refresh();
  }
  catch (error) {
    try { destroy(); }
    catch { /* Preserve setup failure. */ }
    throw error;
  }
  return controller;
};
