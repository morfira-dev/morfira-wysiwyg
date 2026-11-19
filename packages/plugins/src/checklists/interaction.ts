import type { Editor } from '@morfira-dev/wysiwyg-core';
import { checklistAttribute } from './schema.js';
import { hitChecklistMarker } from './geometry.js';
import type { ChecklistInteractionReceipt, ChecklistNativeRange, ChecklistPointerIntent } from './internal-types.js';

const namespace = 'http://www.w3.org/1999/xhtml';
const runtimeClass = 'mw-checklists-interactive';

/** Direct marker gestures never insert control nodes into document content. */
export const setupChecklistInteraction = (editor: Editor, selectedTask: () => HTMLElement | undefined): (() => void) => {
  const root = editor.surface;
  const document = root.ownerDocument;
  const view = document.defaultView!;
  const ownsClass = !root.classList.contains(runtimeClass);
  if (ownsClass) root.classList.add(runtimeClass);
  let disposed = false;
  let composing = false;
  let revision = 0;
  let domRevision = 0;
  let pending: ChecklistPointerIntent | undefined;
  const cleanups: (() => void)[] = [];
  const observer = new view.MutationObserver(() => { domRevision++; });
  observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true });
  const drain = (): number => {
    if (observer.takeRecords().length) domRevision++;
    return domRevision;
  };
  const ready = (): boolean => !disposed && !composing && !editor.isReadOnly();
  const task = (node: EventTarget | Node | null): HTMLLIElement | undefined => {
    if (!(node instanceof view.Node)) return;
    const element = node.nodeType === 1 ? node as Element : node.parentElement;
    const item = element?.closest<HTMLLIElement>('li');
    if (!item || !root.contains(item) || item.namespaceURI !== namespace) return;
    const list = item.parentElement;
    const checked = item.getAttribute(checklistAttribute);
    if (!list || list.namespaceURI !== namespace || !['ul', 'ol'].includes(list.localName)
      || (checked !== 'true' && checked !== 'false')) return;
    for (let parent: Element | null = item; parent && parent !== root; parent = parent.parentElement)
      if (parent.namespaceURI !== namespace || parent.hasAttribute('data-mw-node')) return;
    return item;
  };
  const nativeRange = (): ChecklistNativeRange | undefined => {
    const native = document.getSelection();
    if (!native || native.rangeCount !== 1) return;
    const range = native.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return;
    return { start: { node: range.startContainer, offset: range.startOffset },
      end: { node: range.endContainer, offset: range.endOffset },
      backward: !range.collapsed && native.anchorNode === range.endContainer && native.anchorOffset === range.endOffset };
  };
  const capture = (item: HTMLLIElement): ChecklistInteractionReceipt => ({
    item, checked: item.getAttribute(checklistAttribute)!, revision, domRevision: drain(), selection: nativeRange(),
  });
  const current = (intent: ChecklistInteractionReceipt): boolean => {
    if (!ready() || intent.revision !== revision || intent.domRevision !== drain()
      || task(intent.item) !== intent.item || intent.item.getAttribute(checklistAttribute) !== intent.checked) return false;
    if (!intent.selection) return true;
    const selection = nativeRange();
    return !!selection && selection.backward === intent.selection.backward
      && selection.start.node === intent.selection.start.node && selection.start.offset === intent.selection.start.offset
      && selection.end.node === intent.selection.end.node && selection.end.offset === intent.selection.end.offset;
  };
  const toggle = (intent: ChecklistInteractionReceipt): void => {
    if (!current(intent)) return;
    let changed = false;
    try {
      editor.transact(() => {
        if (!current(intent)) return;
        intent.item.setAttribute(checklistAttribute, String(intent.checked !== 'true'));
        changed = true;
      });
    }
    catch (error) {
      if (!changed && (!ready() || revision !== intent.revision)) return;
      throw error;
    }
  };
  const cancel = (event: Event): void => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const unmodified = (event: MouseEvent): boolean => !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
  const hit = (event: MouseEvent): HTMLLIElement | undefined => {
    const item = task(event.target);
    // A pseudo-marker targets its actual LI, never a descendant owner overlaid
    // at the same coordinates.
    return item && event.target === item && hitChecklistMarker(item, event.clientX, event.clientY) ? item : undefined;
  };
  const pressed = (event: PointerEvent): void => {
    pending = undefined;
    if (!ready() || event.defaultPrevented || !event.cancelable || event.button !== 0 || !event.isPrimary || !unmodified(event)) return;
    const item = hit(event);
    if (!item) return;
    cancel(event);
    pending = { receipt: capture(item), pointerId: event.pointerId, released: false };
  };
  const moved = (event: PointerEvent): void => {
    if (pending && event.pointerId === pending.pointerId && hit(event) !== pending.receipt.item) pending = undefined;
  };
  const released = (event: PointerEvent): void => {
    if (!pending || event.pointerId !== pending.pointerId) return;
    if (event.defaultPrevented || !event.cancelable || event.button !== 0 || !unmodified(event)
      || hit(event) !== pending.receipt.item || !current(pending.receipt)) pending = undefined;
    else pending.released = true;
  };
  const clicked = (event: MouseEvent): void => {
    const intent = pending;
    pending = undefined;
    if (!intent?.released || event.defaultPrevented || !event.cancelable || event.button !== 0 || !unmodified(event)
      || hit(event) !== intent.receipt.item) return;
    cancel(event);
    toggle(intent.receipt);
  };
  const keydown = (event: KeyboardEvent): void => {
    if (!ready() || event.defaultPrevented || !event.cancelable || event.repeat || event.isComposing || event.keyCode === 229
      || event.key !== 'Enter' || event.altKey || event.shiftKey || event.ctrlKey === event.metaKey
      || (document.activeElement !== root && !root.contains(document.activeElement))) return;
    const item = selectedTask();
    if (!item || task(item) !== item) return;
    const intent = capture(item as HTMLLIElement);
    cancel(event);
    toggle(intent);
  };
  const reset = (): void => { pending = undefined; };
  const listen = (target: EventTarget, name: string, listener: EventListener): void => {
    target.addEventListener(name, listener, true);
    cleanups.push(() => target.removeEventListener(name, listener, true));
  };
  const invalidate = (): void => { revision++; reset(); };
  const destroy = (): void => {
    if (disposed) return;
    disposed = true;
    const errors: unknown[] = [];
    for (const cleanup of [...cleanups.splice(0).reverse(), () => observer.disconnect(),
      () => { if (ownsClass) root.classList.remove(runtimeClass); }]) {
      try { cleanup(); }
      catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, 'Checklist interaction cleanup failed.');
  };
  try {
    listen(document, 'pointerdown', pressed as EventListener);
    listen(document, 'pointermove', moved as EventListener);
    listen(document, 'pointerup', released as EventListener);
    listen(document, 'pointercancel', reset);
    listen(root, 'click', clicked as EventListener);
    listen(root, 'keydown', keydown as EventListener);
    listen(root, 'compositionstart', (() => { invalidate(); composing = true; }) as EventListener);
    listen(root, 'compositionend', (() => { invalidate(); composing = false; }) as EventListener);
    cleanups.push(editor.events.on('readonlychange', () => { invalidate(); composing = false; }));
    cleanups.push(editor.subscribe((change) => { invalidate(); if (change.source === 'api') composing = false; }));
  }
  catch (error) {
    try { destroy(); }
    catch { /* Preserve setup failure after attempting owned cleanup. */ }
    throw error;
  }
  return destroy;
};
