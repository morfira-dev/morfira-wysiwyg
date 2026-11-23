import { createEventHub, createPluginEvent } from '../events/index.js';
import type { EventHub } from '../events/types.js';
import type { EditorPositionChange, EditorPositionHandle, EditorPositions } from './types.js';
import type { PositionRecord, PositionRegistry, PositionRegistryOptions } from './internal-types.js';
import { mapPositionRecord } from './mapping.js';

export type { EditorPositionHandle, EditorMappedPosition, EditorPositionChange, EditorPositions, EditorTransactionOptions, TextMappingStep } from './types.js';

export const createPositionRegistry = ({ surface, isAvailable, canCapture, canPresent }: PositionRegistryOptions): PositionRegistry => {
  const records = new WeakMap<EditorPositionHandle, PositionRecord>();
  const live = new Set<PositionRecord>();
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
    const hadLive = live.size > 0;
    for (const record of live) record.active = false;
    live.clear();
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
      if (!live.size) stopObserving();
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
    accept: (mapping) => {
      // Accepted explicit mutations are accounted for by the validated plan.
      observer?.takeRecords();
      dirty = false;
      if (!mapping) {
        invalidate();
        return;
      }
      for (const record of live) mapPositionRecord(record, mapping.steps);
      if (notifications) pending.push(Object.freeze({ kind: 'mapped', steps: mapping.steps }));
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
