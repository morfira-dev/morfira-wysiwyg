import type { EditorPositionChange, EditorPositionHandle, EditorPositions } from './types.js';
import type { PositionRecord, PositionRegistry, PositionRegistryOptions } from './internal-types.js';
import { mapPositionRecord } from './mapping.js';

export type { EditorPositionHandle, EditorMappedPosition, EditorPositionChange, EditorPositions, EditorTransactionOptions, TextMappingStep } from './types.js';

export const createPositionRegistry = ({ surface, isAvailable, canCapture }: PositionRegistryOptions): PositionRegistry => {
  const records = new WeakMap<EditorPositionHandle, PositionRecord>();
  const live = new Set<PositionRecord>();
  const listeners = new Set<(change: EditorPositionChange) => void>();
  const pending: EditorPositionChange[] = [];
  let observer: MutationObserver | undefined;
  let destroyed = false;
  let dirty = false;
  let notifying = false;

  const stopObserving = () => {
    observer?.disconnect();
    observer = undefined;
  };
  const notify = () => {
    if (notifying) return;
    notifying = true;
    const failures: unknown[] = [];
    try {
      while (pending.length) {
        const change = pending.shift()!;
        for (const listener of [...listeners]) {
          if (!listeners.has(listener)) continue;
          try { listener(change); }
          catch (error) { failures.push(error); }
        }
      }
    }
    finally {
      notifying = false;
    }
    if (failures.length) throw new AggregateError(failures, 'Position mapping notification failed.');
  };
  const invalidate = () => {
    const hadLive = live.size > 0;
    for (const record of live) record.active = false;
    live.clear();
    stopObserving();
    if (hadLive && listeners.size)
      pending.push(Object.freeze({ kind: 'invalidated', steps: Object.freeze([]) }));
  };
  const relevant = (mutation: MutationRecord) => mutation.target !== surface || mutation.type === 'childList';
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
        throw new RangeError('Mapped positions require a valid text offset and association.');
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
    subscribe: (listener) => {
      if (destroyed) throw new Error('Editor has been destroyed.');
      if (typeof listener !== 'function') throw new TypeError('A position subscription requires a function.');
      listeners.add(listener);
      return () => { listeners.delete(listener); };
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
      if (listeners.size) pending.push(Object.freeze({ kind: 'mapped', steps: mapping.steps }));
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
      for (const record of live) record.active = false;
      live.clear();
      stopObserving();
      listeners.clear();
      pending.length = 0;
    },
  };
};
