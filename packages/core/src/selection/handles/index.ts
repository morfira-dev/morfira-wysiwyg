import type { EditorSelectionHandle, EditorSelectionHandles } from './types.js';
import type { SelectionHandlePoints, SelectionHandleRecord, SelectionHandleRegistry, SelectionHandleRegistryOptions } from './internal-types.js';

export type { EditorSelectionHandle, EditorSelectionHandles } from './types.js';

/** Records retain points only while live; tokens alone never retain detached DOM. */
export const createSelectionHandleRegistry = ({ surface, isAvailable, canCapture, canRestore }: SelectionHandleRegistryOptions): SelectionHandleRegistry => {
  const document = surface.ownerDocument;
  const records = new WeakMap<EditorSelectionHandle, SelectionHandleRecord>();
  const live = new Set<SelectionHandleRecord>();
  const ancestors = new Set<Node>();
  let observer: MutationObserver | undefined;
  let destroyed = false;
  let dirty = false;

  const stopObserving = (): void => {
    observer?.disconnect();
    observer = undefined;
    ancestors.clear();
  };
  const invalidate = (): void => {
    // WeakMap values must not keep nodes alive through retained, expired tokens.
    for (const record of live) {
      record.points = undefined;
    }
    live.clear();
    stopObserving();
  };
  const affectsDocument = (mutation: MutationRecord): boolean => {
    if (mutation.target === surface)
      return mutation.type === 'childList';
    if (surface.contains(mutation.target))
      return true;
    return mutation.type === 'childList'
      && [...mutation.addedNodes, ...mutation.removedNodes].some((node) => ancestors.has(node));
  };
  const flushMutations = (): boolean => {
    if (!observer?.takeRecords().some(affectsDocument))
      return false;
    dirty = true;
    invalidate();
    return true;
  };
  const observe = (): void => {
    if (observer)
      return;
    observer = new MutationObserver((mutations) => {
      if (mutations.some(affectsDocument)) {
        dirty = true;
        invalidate();
      }
    });
    observer.observe(surface, { childList: true, subtree: true, characterData: true, attributes: true });
    // Observe only ancestor child lists, rather than all unrelated document edits.
    let node: Node | null = surface;
    while (node) {
      ancestors.add(node);
      if (node !== surface)
        observer.observe(node, { childList: true });
      node = node.parentNode;
    }
  };
  const validPoint = (node: Node, offset: number): boolean => surface.contains(node)
    && Number.isInteger(offset) && offset >= 0
    && offset <= (node.nodeType === 3 ? (node as Text).length : node.childNodes.length);
  const lookup = (handle: EditorSelectionHandle): SelectionHandlePoints | undefined => {
    flushMutations();
    const record = records.get(handle);
    if (destroyed || !isAvailable() || !surface.isConnected || !record?.points || !live.has(record))
      return;
    const points = record.points;
    if (!validPoint(points.start, points.startOffset) || !validPoint(points.end, points.endOffset)) {
      invalidate();
      return;
    }
    return points;
  };
  const makeRange = (record: SelectionHandlePoints): Range => {
    const range = document.createRange();
    range.setStart(record.start, record.startOffset);
    range.setEnd(record.end, record.endOffset);
    return range;
  };
  const capture = (): EditorSelectionHandle | undefined => {
    if (flushMutations() || dirty || destroyed || !isAvailable() || !canCapture() || !surface.isConnected)
      return;
    const native = document.getSelection();
    if (native?.rangeCount !== 1)
      return;
    const range = native.getRangeAt(0);
    if (!validPoint(range.startContainer, range.startOffset) || !validPoint(range.endContainer, range.endOffset))
      return;
    const points: SelectionHandlePoints = {
      start: range.startContainer,
      startOffset: range.startOffset,
      end: range.endContainer,
      endOffset: range.endOffset,
      backward: !range.collapsed && native.anchorNode === range.endContainer && native.anchorOffset === range.endOffset,
    };
    const handle = Object.freeze({}) as EditorSelectionHandle;
    const record: SelectionHandleRecord = { points };
    records.set(handle, record);
    live.add(record);
    observe();
    return handle;
  };
  const selection: EditorSelectionHandles = {
    capture,
    isCurrent: (handle) => lookup(handle) !== undefined,
    getRange: (handle) => {
      const record = lookup(handle);
      return record ? makeRange(record) : undefined;
    },
    restore: (handle) => {
      if (!canRestore())
        return false;
      const record = lookup(handle);
      const native = document.getSelection();
      if (!record || !native)
        return false;
      const anchor = record.backward ? record.end : record.start;
      const anchorOffset = record.backward ? record.endOffset : record.startOffset;
      const focus = record.backward ? record.start : record.end;
      const focusOffset = record.backward ? record.startOffset : record.endOffset;
      // Native selection can focus the editable and invoke application callbacks.
      try {
        native.setBaseAndExtent(anchor, anchorOffset, focus, focusOffset);
      }
      catch {
        return false;
      }
      return canRestore() && lookup(handle) === record && native.anchorNode === anchor && native.anchorOffset === anchorOffset
        && native.focusNode === focus && native.focusOffset === focusOffset;
    },
    release: (handle) => {
      const record = records.get(handle);
      if (!record)
        return;
      records.delete(handle);
      live.delete(record);
      record.points = undefined;
      if (!live.size)
        stopObserving();
    },
  };
  return {
    selection,
    invalidate,
    synchronize: () => {
      flushMutations();
      dirty = false;
    },
    destroy: () => {
      destroyed = true;
      invalidate();
    },
  };
};
