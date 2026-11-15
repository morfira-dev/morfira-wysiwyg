import type { EditorEventMap, EditorEvents, EventHub, PluginEvent, QueuedEvent, EditorInputCommit } from './types.js';
export type { EditorEventMap, EditorEvents, PluginEvent, EditorInputCommit } from './types.js';
const tokens = new WeakSet<object>();
const coreNames = new Set(['change', 'selectionchange', 'readonlychange', 'localechange', 'inputcommit', 'destroy']);
export const createPluginEvent = <T>(name: string): PluginEvent<T> => {
  if (typeof name !== 'string' || !name.trim() || name.length > 200) {
    throw new TypeError('Expected an event name with 1–200 characters.');
  }
  const token = Object.freeze({ name }) as PluginEvent<T>;
  tokens.add(token);
  return token;
};
const assertToken = (event: unknown): object => {
  if (!event || typeof event !== 'object' || !tokens.has(event)) {
    throw new TypeError('Expected a plugin event token. Core events cannot be emitted publicly.');
  }
  return event;
};
const corePayload = (key: string | object, payload: unknown): unknown => {
  if (!payload || typeof payload !== 'object') return payload;
  if (key === 'localechange') {
    const locale = payload as EditorEventMap['localechange'];
    return { ...locale, translations: { ...locale.translations } };
  }
  if (key === 'inputcommit') {
    const receipt = payload as EditorInputCommit;
    const saved = receipt.selection;
    return { ...receipt, selection: saved ? { ...saved, start: [...saved.start], end: [...saved.end] } : undefined };
  }
  return { ...payload };
};
export const createEventHub = (): EventHub => {
  const listeners = new Map<string | object, Map<(payload: unknown) => void, number>>();
  const queue: QueuedEvent[] = [];
  let registration = 0;
  let dispatching = false;
  let closing = false;
  const enqueue = (entry: QueuedEvent) => {
    if (closing && entry.key !== 'destroy')
      return;
    queue.push(entry);
    if (dispatching)
      return;
    dispatching = true;
    const failures: unknown[] = [];
    try {
      while (queue.length) {
        const next = queue.shift()!;
        if (closing && next.key !== 'destroy')
          continue;
        const bucket = listeners.get(next.key);
        for (const [listener, registered] of [...(bucket ?? [])]) {
          if ((closing && next.key !== 'destroy') || bucket?.get(listener) !== registered)
            continue;
          try {
            const payload = next.core ? corePayload(next.key, next.payload) : next.payload;
            listener(payload);
          }
          catch (error) {
            failures.push(error);
          }
        }
        if (next.key === 'destroy') {
          listeners.clear();
          queue.length = 0;
        }
      }
    }
    finally {
      dispatching = false;
    }
    if (failures.length)
      throw new AggregateError(failures, 'Editor event listeners failed.');
  };
  const on = (event: keyof EditorEventMap | PluginEvent<unknown>, listener: (payload: unknown) => void): (() => void) => {
    if (closing)
      throw new Error('Editor events have been destroyed.');
    if (typeof listener !== 'function')
      throw new TypeError('Expected an event listener.');
    const key = typeof event === 'string' && coreNames.has(event) ? event : assertToken(event);
    let bucket = listeners.get(key);
    if (!bucket) {
      bucket = new Map();
      listeners.set(key, bucket);
    }
    if (!bucket.has(listener))
      bucket.set(listener, ++registration);
    const registered = bucket.get(listener);
    return () => {
      if (bucket!.get(listener) !== registered)
        return;
      bucket!.delete(listener);
      if (!bucket!.size && listeners.get(key) === bucket)
        listeners.delete(key);
    };
  };
  const events: EditorEvents = {
    on: on as EditorEvents['on'],
    emit: (event, payload) => {
      if (closing)
        throw new Error('Editor events have been destroyed.');
      enqueue({ key: assertToken(event), payload, core: false });
    },
  };
  return {
    events,
    notify: (event, payload) => enqueue({ key: event, payload, core: true }),
    destroy: () => {
      if (closing)
        return;
      closing = true;
      queue.length = 0;
      enqueue({ key: 'destroy', payload: undefined, core: true });
    },
  };
};
