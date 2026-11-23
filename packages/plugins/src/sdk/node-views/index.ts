import type { Editor } from '@morfira-dev/wysiwyg-core';
import type { NodeView, NodeViewContext, NodeViewsController, NodeViewsOptions } from '../types.js';
import { registeredNode } from '../node-extension/index.js';

/** External UI lifecycle keyed by actual semantic nodes, never persisted callback DOM. */
export const createNodeViews = (host: HTMLElement, editor: Editor, options: NodeViewsOptions): NodeViewsController => {
  const registration = registeredNode(editor, options.name);
  const root = editor.surface;
  if (host.ownerDocument !== root.ownerDocument || root.contains(host) || host === root || host.contains(root))
    throw new Error('Node views require a separate external host in the editor document.');
  if (typeof options.create !== 'function') throw new TypeError('A node view create callback is required.');
  const create = options.create;
  const views = new Map<HTMLElement, NodeView>();
  const elements = new Set<HTMLElement>();
  const cleanups: (() => void)[] = [];
  let disposed = false;
  let refreshing = false;
  const context = (node: HTMLElement): NodeViewContext => Object.freeze({
    editor, node,
    attributes: Object.freeze(Object.fromEntries([...node.attributes].filter((attribute) => attribute.name !== 'contenteditable')
      .map((attribute) => [attribute.name, attribute.value]))),
    text: node.textContent ?? '',
    getRect: () => !disposed && registration.owns(node) && node.isConnected ? node.getBoundingClientRect() : undefined,
  });
  const remove = (node: HTMLElement) => {
    const view = views.get(node);
    if (!view) return;
    views.delete(node);
    elements.delete(view.element);
    try { view.destroy?.(); }
    finally { view.element.remove(); }
  };
  const clear = () => {
    const failures: unknown[] = [];
    for (const node of [...views.keys()]) {
      try { remove(node); }
      catch (error) { failures.push(error); }
    }
    if (failures.length) throw new AggregateError(failures, 'Node view disposal failed.');
  };
  const refresh = () => {
    if (disposed || refreshing) return;
    refreshing = true;
    try {
      const nodes = [...root.querySelectorAll('[data-mw-node]')].filter(registration.owns);
      if (nodes.length > 2048) throw new RangeError('Too many node views.');
      for (const node of [...views.keys()]) if (!nodes.includes(node)) remove(node);
      for (const node of nodes) {
        if (disposed) break;
        if (!registration.owns(node)) continue;
        const previous = views.get(node);
        if (previous) {
          previous.update?.(context(node));
          if (disposed) break;
          if (!registration.owns(node)) remove(node);
          continue;
        }
        const next = create(context(node));
        const element = next?.element;
        const update = next?.update;
        const dispose = next?.destroy;
        const cleanReturned = () => {
          if (typeof dispose === 'function') dispose.call(next);
        };
        if (!next || !(element instanceof root.ownerDocument.defaultView!.HTMLElement)
          || element.isConnected || elements.has(element) || element === host || element.contains(host)
          || element.contains(root) || update !== undefined && typeof update !== 'function'
          || dispose !== undefined && typeof dispose !== 'function') {
          cleanReturned();
          throw new TypeError('Node views must return a fresh detached HTML element and optional lifecycle callbacks.');
        }
        if (disposed || !registration.owns(node)) {
          cleanReturned();
          continue;
        }
        const stable: NodeView = { element,
          ...(update ? { update: (nextContext: NodeViewContext) => update.call(next, nextContext) } : {}),
          ...(dispose ? { destroy: () => dispose.call(next) } : {}),
        };
        views.set(node, stable);
        elements.add(element);
        host.append(element);
      }
    }
    catch (error) {
      try { clear(); }
      catch { /* Preserve the original callback error after disposing every view. */ }
      throw error;
    }
    finally { refreshing = false; }
  };
  const destroy = () => {
    if (disposed) return;
    disposed = true;
    const failures: unknown[] = [];
    for (const stop of cleanups) {
      try { stop(); }
      catch (error) { failures.push(error); }
    }
    try { clear(); }
    catch (error) { failures.push(error); }
    if (failures.length) throw new AggregateError(failures, 'Node view cleanup failed.');
  };
  try {
    refresh();
    cleanups.push(editor.subscribe(refresh), editor.events.on('readonlychange', refresh), editor.events.on('localechange', refresh), editor.events.on('destroy', destroy));
  }
  catch (error) {
    try { destroy(); }
    catch { /* Preserve original setup failure. */ }
    throw error;
  }
  return { refresh, destroy };
};
