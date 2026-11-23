import { createEventHub, createPluginEvent } from '../events/index.js';
import type { EventHub } from '../events/types.js';
import type { EditorPositionChange, EditorPositionHandle, EditorPositions, EditorNodePositionHandle } from './types.js';
import type { PositionRecord, PositionRegistry, PositionRegistryOptions, NodePositionRecord } from './internal-types.js';
import { mapPositionRecord } from './mapping.js';
import { checkedStructuralPath, structuralDOMLeaf, structuralText, mapNodePosition } from './structural.js';

export type { EditorPositionHandle, EditorMappedPosition, EditorPositionChange, EditorPositions, EditorTransactionOptions, TextMappingStep, StructuralNodePath, StructuralMappingStep, EditorNodePositionHandle, EditorMappedNodePosition } from './types.js';

export const createPositionRegistry = ({ surface, isAvailable, canCapture, canPresent, readDocument, clearDocument }: PositionRegistryOptions): PositionRegistry => {
  const records = new WeakMap<EditorPositionHandle, PositionRecord>();
  const live = new Set<PositionRecord>();
  const nodeRecords = new WeakMap<EditorNodePositionHandle, NodePositionRecord>();
  const nodeLive = new Set<NodePositionRecord>();
  const event = createPluginEvent<EditorPositionChange>('positionchange');
  let notifications: EventHub | undefined;
  const pending: EditorPositionChange[] = [];
  let observer: MutationObserver | undefined;
  let destroyed = false;
  let dirty = false;

  const stopObserving = () => {
    observer?.disconnect();
    observer = undefined;
  };
  const notify = () => {
    const failures: unknown[] = [];
    while (pending.length) {
      const change = pending.shift()!;
      // The existing hub owns reentry, listener errors and unsubscribe identity.
      try { notifications?.events.emit(event, change); }
      catch (error) { failures.push(error); }
    }
    if (failures.length) throw new AggregateError(failures, 'Position listeners failed.');
  };
  const invalidate = () => {
    clearDocument();
    const hadLive = live.size > 0 || nodeLive.size > 0;
    for (const record of live) record.active = false;
    live.clear();
    for (const record of nodeLive) record.active = false;
    nodeLive.clear();
    stopObserving();
    if (hadLive && notifications)
      pending.push(Object.freeze({ kind: 'invalidated', steps: Object.freeze([]) }));
  };
  const relevant = (mutation: MutationRecord) => mutation.target === surface
    ? mutation.type === 'childList' : surface.contains(mutation.target);
  const flush = () => {
    if (!observer?.takeRecords().some(relevant)) return false;
    dirty = true;
    invalidate();
    notify();
    return true;
  };
  const observe = () => {
    if (observer) return;
    observer = new MutationObserver((mutations) => {
      if (!mutations.some(relevant)) return;
      dirty = true;
      invalidate();
      notify();
    });
    observer.observe(surface, { subtree: true, childList: true, characterData: true, attributes: true });
  };
  const positions: EditorPositions = {
    trackNode: (path, offset, association = 1) => {
      if (destroyed || !isAvailable() || flush() || dirty || !surface.isConnected || !canCapture()) return;
      const clean = checkedStructuralPath(path);
      const node = structuralDOMLeaf(surface, readDocument(), clean);
      if (!node) { clearDocument(); return; }
      const text = structuralText(node);
      if (text === undefined || !Number.isSafeInteger(offset) || offset < 0 || offset > text.length || association !== -1 && association !== 1)
        throw new RangeError('Node positions require a supported text-only leaf and valid offset/association.');
      const token = Object.freeze({}) as EditorNodePositionHandle;
      const record: NodePositionRecord = { path: clean, offset, association, deleted: false, active: true };
      nodeRecords.set(token, record);
      nodeLive.add(record);
      observe();
      return token;
    },
    resolveNode: (handle) => {
      if (destroyed || !isAvailable() || flush() || dirty) return;
      if (!surface.isConnected) { invalidate(); notify(); return; }
      const record = nodeRecords.get(handle);
      return record?.active ? { path: [...record.path], offset: record.offset, deleted: record.deleted } : undefined;
    },
    releaseNode: (handle) => {
      const record = nodeRecords.get(handle);
      if (!record) return;
      nodeRecords.delete(handle);
      nodeLive.delete(record);
      record.active = false;
      if (!nodeLive.size) clearDocument();
      if (!live.size && !nodeLive.size) stopObserving();
    },
    track: (index, association = 1) => {
      if (destroyed || !isAvailable() || flush() || dirty || !surface.isConnected || !canCapture()) return;
      if (!Number.isSafeInteger(index) || index < 0 || index > (surface.textContent?.length ?? 0) || (association !== -1 && association !== 1))
        throw new RangeError('Invalid position offset or association.');
      const token = Object.freeze({}) as EditorPositionHandle;
      const record: PositionRecord = { index, association, deleted: false, active: true };
      records.set(token, record);
      live.add(record);
      observe();
      return token;
    },
    resolve: (handle) => {
      if (destroyed || !isAvailable() || flush() || dirty) return;
      if (!surface.isConnected) {
        invalidate();
        notify();
        return;
      }
      const record = records.get(handle);
      return record?.active ? { index: record.index, deleted: record.deleted } : undefined;
    },
    release: (handle) => {
      const record = records.get(handle);
      if (!record) return;
      records.delete(handle);
      live.delete(record);
      record.active = false;
      if (!live.size && !nodeLive.size) stopObserving();
    },
    setPresentation: (node, editable) => {
      if (destroyed || !isAvailable() || (editable !== false && editable !== undefined) || !canPresent(node)) return false;
      // Existing unrelated edits must expire old positions before this projection.
      // Notifications may reenter application code, so validate the target again.
      flush();
      if (destroyed || !isAvailable() || !canPresent(node)) return false;
      const view = surface.ownerDocument.defaultView;
      if (!view) return false;
      const previous = node.getAttribute('contenteditable');
      if (editable === false) {
        if (previous !== 'false') view.Element.prototype.setAttribute.call(node, 'contenteditable', 'false');
      }
      else if (previous !== null) view.Element.prototype.removeAttribute.call(node, 'contenteditable');
      const unexpected = observer?.takeRecords().some((mutation) => mutation.type !== 'attributes'
        || mutation.target !== node || mutation.attributeName !== 'contenteditable');
      if (unexpected) {
        dirty = true;
        invalidate();
        notify();
      }
      return !destroyed && canPresent(node);
    },
    subscribe: (listener) => {
      if (destroyed) throw new Error('Editor has been destroyed.');
      notifications ??= createEventHub();
      return notifications.events.on(event, listener);
    },
  };
  return {
    positions,
    accept: (mapping, structural) => {
      clearDocument();
      observer?.takeRecords();
      dirty = false;
      if (!mapping && !structural) { invalidate(); return; }
      if (mapping) for (const record of live) mapPositionRecord(record, mapping.steps);
      else { for (const record of live) record.active = false; live.clear(); }
      if (structural) for (const record of nodeLive) mapNodePosition(record, structural.steps);
      else { for (const record of nodeLive) record.active = false; nodeLive.clear(); }
      if (!live.size && !nodeLive.size) stopObserving();
      if (notifications) pending.push(Object.freeze({ kind: 'mapped', steps: mapping?.steps ?? Object.freeze([]), ...(structural ? { structural: true as const } : {}) }));
    },
    invalidate,
    synchronize: () => {
      // Ordinary no-op commits still expire observations after transient DOM writes.
      if (observer?.takeRecords().some(relevant)) invalidate();
      dirty = false;
    },
    notify,
    destroy: () => {
      destroyed = true;
      invalidate();
      notifications?.destroy();
      pending.length = 0;
    },
  };
};
