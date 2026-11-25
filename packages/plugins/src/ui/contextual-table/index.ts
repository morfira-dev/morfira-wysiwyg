import { localize } from '@morfira-dev/wysiwyg-core';
import type { Editor, EditorSelectionHandle } from '@morfira-dev/wysiwyg-core';
import { getTableSelection, tableCommands, tableSelectionChange } from '../../tables/index.js';
import { tablesMessages } from '../../tables/messages.js';
import { createFormSelection } from '../shared/selection.js';
import { contextualAnchor, placeContextualToolbar } from '../contextual/geometry.js';
import { sameContextualRange } from '../contextual/selection.js';
import { contextualTableUIMessages } from './messages.js';
import { ordinaryTableRange, sameTableRegion } from './target.js';
import type { ContextualTableAction, ContextualTableTarget } from './internal-types.js';
import type { ContextualTableUIController, ContextualTableUIOptions } from './types.js';
import type { TableSelectionState } from '../../tables/types.js';

export { contextualTableUIMessages } from './messages.js';
export type { ContextualTableUIController, ContextualTableUIOptions, ContextualTableUIMessageKey } from './types.js';

export const createContextualTableUI = (host: HTMLElement, editor: Editor, options: ContextualTableUIOptions = {}): ContextualTableUIController => {
  editor.getLocale();
  const api = tableCommands(editor);
  const surface = editor.surface;
  const document = surface.ownerDocument;
  if (host.ownerDocument !== document || !host.isConnected || host.childNodes.length || surface.contains(host)
    || host.contains(editor.element) || host.namespaceURI !== 'http://www.w3.org/1999/xhtml') throw new Error('Contextual tables need an empty connected external HTML host.');
  if (!options || typeof options !== 'object' || Array.isArray(options)
    || Object.keys(options).some((key) => !['label', 'gap', 'onError'].includes(key))) throw new TypeError('Expected contextual table options.');
  if (options.label !== undefined && typeof options.label !== 'string') throw new TypeError('The table action label must be text.');
  if (options.onError !== undefined && typeof options.onError !== 'function') throw new TypeError('The table error handler must be a callback.');
  const gap = options.gap === undefined ? 8 : options.gap;
  if (typeof gap !== 'number' || !Number.isFinite(gap) || gap < 0 || gap > 32) throw new TypeError('Table action gap must be 0–32 CSS pixels.');
  const view = document.defaultView!;
  const element = document.createElement('section');
  element.className = 'mw-contextual-table';
  element.setAttribute('role', 'group');
  element.hidden = true;
  const summary = document.createElement('span');
  summary.className = 'mw-contextual-table-summary';
  summary.setAttribute('role', 'status');
  element.append(summary);
  const actions: ContextualTableAction[] = ['rowAbove', 'rowBelow', 'deleteRow', 'columnLeft', 'columnRight', 'deleteColumn', 'merge', 'split', 'selectRow', 'selectColumn', 'selectTable'];
  const buttons = actions.map((action) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.mwTableAction = action;
    element.append(button);
    return button;
  });
  const selection = createFormSelection(editor);
  const cleanups: (() => void)[] = [];
  let geometryCleanups: (() => void)[] = [];
  let observed: HTMLElement[] = [];
  let current: ContextualTableTarget | undefined;
  let suppressed: ContextualTableTarget | undefined;
  let disposed = false;
  let composing = false;
  let apiRevision = 0;
  let epoch = 0;
  let frame = 0;
  let restoring = 0;
  let focusRequested = false;
  let explicitOpening = false;
  let invalidated = false;
  let invalidationRevision = 0;
  let readonlySelection: EditorSelectionHandle | undefined;
  const releaseReadonlySelection = (): void => {
    if (readonlySelection) editor.selection.release(readonlySelection);
    readonlySelection = undefined;
  };
  const message = (key: keyof typeof contextualTableUIMessages.en): string => localize(editor.getLocale(), key, contextualTableUIMessages);
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
  const stopGeometry = (): void => {
    epoch++;
    focusRequested = false;
    if (frame) view.cancelAnimationFrame(frame);
    frame = 0;
    observed = [];
    const failures = release(geometryCleanups);
    if (failures.length) throw new AggregateError(failures, 'Table geometry cleanup failed.');
  };
  const dismiss = (keepReadonlySelection = false): void => {
    if (!keepReadonlySelection) releaseReadonlySelection();
    if (current) suppressed = current;
    explicitOpening = false;
    element.hidden = true;
    stopGeometry();
  };
  const invalidate = (): void => {
    releaseReadonlySelection();
    const range = current?.range ?? suppressed?.range;
    const state = getTableSelection(editor, range);
    invalidationRevision = state?.revision ?? invalidationRevision;
    invalidated = true;
    dismiss();
    current = undefined;
  };
  const focusedEditor = (): boolean => document.activeElement === surface || surface.contains(document.activeElement);
  const nativeRange = (): Range | undefined => {
    const native = document.getSelection();
    return native?.rangeCount === 1 ? native.getRangeAt(0).cloneRange() : undefined;
  };
  const candidate = (): ContextualTableTarget | undefined => {
    if (composing) return;
    const readonlyBody = editor.isReadOnly() && document.activeElement === document.body;
    const range = focusedEditor() || readonlyBody ? nativeRange() : element.contains(document.activeElement) ? current?.range.cloneRange() : undefined;
    if (!range || !ordinaryTableRange(editor, range)) return;
    const state = getTableSelection(editor, range);
    if (!state) return;
    return { state, range, apiRevision };
  };
  const matches = (left: ContextualTableTarget, right: ContextualTableTarget): boolean => left.apiRevision === right.apiRevision
    && left.state.revision === right.state.revision && sameTableRegion(left.state, right.state);
  const enabled = (action: ContextualTableAction, state: TableSelectionState): boolean => {
    if (composing) return false;
    if (action === 'selectRow' || action === 'selectColumn' || action === 'selectTable') return true;
    if (editor.isReadOnly()) return false;
    if (action === 'merge') return state.canMerge;
    if (action === 'split') return state.canSplit;
    if (action === 'rowAbove' || action === 'rowBelow') return state.rows < 100;
    if (action === 'columnLeft' || action === 'columnRight') return state.columns < 100;
    return true;
  };
  // Layout uses cached identities only; grid projection is reserved for selection/data/activation.
  const anchor = () => {
    if (!current || !surface.contains(current.state.table) || current.state.cells.some((cell) => !current!.state.table.contains(cell))) return;
    for (const cell of current.state.cells) {
      const range = document.createRange();
      range.selectNode(cell);
      const bounds = contextualAnchor(surface, range);
      if (bounds) return bounds;
    }
  };
  const layout = (): void => {
    if (disposed || !geometryCleanups.length || !current) return;
    const bounds = anchor();
    if (!bounds) {
      element.hidden = true;
      focusRequested = false;
      return;
    }
    element.style.visibility = 'hidden';
    element.hidden = false;
    try { placeContextualToolbar(element, bounds, gap); }
    finally { element.style.removeProperty('visibility'); }
    if (focusRequested) {
      focusRequested = false;
      buttons.find((button) => !button.disabled)?.focus();
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
  const geometry = (table: HTMLTableElement): void => {
    const nodes: HTMLElement[] = [];
    for (let node: HTMLElement | null = table; node; node = node.parentElement) nodes.push(node);
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
    if (disposed) throw new Error('Contextual table UI has been destroyed.');
    if (restoring) return;
    const next = candidate();
    if (invalidated) {
      if (next?.state.explicit && next.state.revision > invalidationRevision) invalidated = false;
      else {
        element.hidden = true;
        stopGeometry();
        return;
      }
    }
    if (!next || (!next.range.collapsed && !(next.state.explicit && next.state.cells.length > 1) && !explicitOpening)) {
      dismiss();
      current = undefined;
      return;
    }
    if (suppressed && matches(suppressed, next) && sameContextualRange(suppressed.range, next.range)) {
      element.hidden = true;
      stopGeometry();
      return;
    }
    suppressed = undefined;
    current = next;
    selection.capture();
    if (editor.isReadOnly() && (focusedEditor() || document.activeElement === document.body)) {
      const captured = editor.selection.capture();
      releaseReadonlySelection();
      readonlySelection = captured;
    }
    else if (!editor.isReadOnly()) releaseReadonlySelection();
    element.setAttribute('aria-label', options.label ?? message('ui.contextualTable.label'));
    element.title = message('ui.contextualTable.help');
    summary.textContent = message('ui.contextualTable.selection')
      .replace('{rows}', String(next.state.rectangle.bottom - next.state.rectangle.top + 1))
      .replace('{columns}', String(next.state.rectangle.right - next.state.rectangle.left + 1))
      .replace('{cells}', String(next.state.cells.length));
    actions.forEach((action, index) => {
      buttons[index]!.textContent = localize(editor.getLocale(), `tables.${action}`, tablesMessages);
      buttons[index]!.disabled = !enabled(action, next.state);
    });
    geometry(next.state.table);
    schedule();
  };
  const discover = (): void => {
    if (disposed || restoring) return;
    try { refresh(); }
    catch (error) { report(error); dismiss(); }
  };
  const restoreTarget = (): ContextualTableTarget | undefined => {
    const previous = current;
    if (!previous || previous.apiRevision !== apiRevision) return;
    const projected = candidate();
    if (!projected || !matches(previous, projected)) return;
    restoring++;
    try {
      const restored = editor.isReadOnly()
        ? !!readonlySelection && editor.selection.restore(readonlySelection)
        : selection.restore();
      if (!restored || disposed || composing || previous.apiRevision !== apiRevision) return;
      const next = candidate();
      if (next && matches(previous, next)) {
        current = next;
        return next;
      }
    }
    finally { restoring--; }
  };
  const activate = (action: ContextualTableAction): void => {
    if (disposed || element.hidden || !element.isConnected || composing) return;
    try {
      const next = restoreTarget();
      if (!next || !enabled(action, next.state) || !anchor()) { dismiss(); return; }
      api[action]();
      if (disposed) return;
      // Suppress the command's resulting caret/revision, including queued table notifications.
      current = candidate();
      dismiss();
    }
    catch (error) { report(error); if (!disposed) dismiss(); }
  };
  const keyboard = (event: KeyboardEvent): void => {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape' && (!element.hidden || focusRequested) && (element.contains(event.target as Node) || surface.contains(event.target as Node))) {
      event.preventDefault();
      event.stopPropagation();
      dismiss(true);
      restoring++;
      try {
        if (!disposed) {
          if (editor.isReadOnly() && readonlySelection) editor.selection.restore(readonlySelection);
          else selection.restore();
        }
      }
      finally {
        restoring--;
        releaseReadonlySelection();
      }
      return;
    }
    if (event.altKey && !event.ctrlKey && !event.metaKey && event.key === 'F10' && surface.contains(event.target as Node)
      && !composing && candidate()) {
      event.preventDefault();
      event.stopPropagation();
      suppressed = undefined;
      invalidated = false;
      explicitOpening = true;
      focusRequested = true;
      refresh();
    }
  };
  const pointer = (event: PointerEvent): void => {
    selection.capture();
    if ((event.target as Element).closest('button')) event.preventDefault();
  };
  const outside = (event: PointerEvent): void => { if (!element.contains(event.target as Node)) dismiss(); };
  const fresh = (): void => { suppressed = undefined; invalidated = false; explicitOpening = false; discover(); };
  const selectionKey = (event: KeyboardEvent): void => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Tab'].includes(event.key)) fresh();
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
  const startComposition = (): void => { if (!editor.isReadOnly()) { composing = true; invalidate(); } };
  const endComposition = (): void => { composing = false; invalidate(); };
  const listen = (target: EventTarget, type: string, callback: EventListener, capture = false): void => {
    target.addEventListener(type, callback, capture);
    cleanups.push(() => target.removeEventListener(type, callback, capture));
  };
  const destroy = (): void => {
    if (disposed) return;
    disposed = true;
    const failures = release(cleanups);
    for (const cleanup of [stopGeometry, releaseReadonlySelection, () => selection.destroy()]) {
      try { cleanup(); }
      catch (error) { failures.push(error); }
    }
    current = suppressed = undefined;
    element.remove();
    if (failures.length) throw new AggregateError(failures, 'Contextual table cleanup failed.');
  };
  try {
    listen(element, 'keydown', keyboard as EventListener, true);
    // Capture eligible Alt+F10 before a contextual text toolbar handles the same cell range.
    listen(document, 'keydown', keyboard as EventListener, true);
    listen(element, 'pointerdown', pointer as EventListener);
    buttons.forEach((button, index) => listen(button, 'click', () => activate(actions[index]!)));
    listen(surface, 'click', fresh);
    listen(surface, 'pointerup', fresh);
    listen(surface, 'beforeinput', fresh);
    listen(surface, 'keyup', selectionKey as EventListener);
    listen(surface, 'focusin', focusIn as EventListener);
    listen(surface, 'focusout', focusOut as EventListener);
    listen(element, 'focusout', focusOut as EventListener);
    listen(document, 'pointerdown', outside as EventListener, true);
    listen(surface, 'compositionstart', startComposition);
    listen(surface, 'compositionend', endComposition);
    cleanups.push(
      editor.onSelectionChange(discover),
      editor.events.on(tableSelectionChange, discover),
      editor.events.on('localechange', discover),
      editor.events.on('readonlychange', () => {
        composing = false;
        invalidate();
      }),
      editor.subscribe((change) => {
        if (change.source === 'api') {
          apiRevision++;
          composing = false;
          invalidate();
        }
        else discover();
      }),
      editor.events.on('destroy', destroy),
    );
    host.append(element);
    cleanups.push(api.registerSelectionHost(element));
    refresh();
  }
  catch (error) {
    try { destroy(); }
    catch { /* Preserve setup failure after releasing every owned resource. */ }
    throw error;
  }
  return { element, refresh, destroy };
};
