import type { Editor, EditorDocument, EditorPlugin } from '@morfira-dev/wysiwyg-core';
import type { SaveRequest } from './internal-types.js';
import type { SaveStateCommands, SaveStateOptions, SaveStateSnapshot, SaveStateStatus } from './types.js';

export type { SaveStateCommands, SaveStateOptions, SaveStateSnapshot, SaveStateStatus, SaveStateContext } from './types.js';

export const saveState = (options: SaveStateOptions): EditorPlugin => {
  if (!options || typeof options !== 'object' || Array.isArray(options)
    || Object.keys(options).some((key) => !['save', 'autoSave', 'debounceMs', 'onError'].includes(key))
    || typeof options.save !== 'function' || (options.autoSave !== undefined && typeof options.autoSave !== 'boolean')
    || (options.onError !== undefined && typeof options.onError !== 'function')) throw new TypeError('Expected save-state options and a save callback.');
  const { save: persist, onError, autoSave = false, debounceMs = 500 } = options;
  if (!Number.isInteger(debounceMs) || debounceMs < 0 || debounceMs > 60000) throw new RangeError('Save debounce must be an integer from 0 to 60000ms.');
  return {
    name: 'save-state',
    setup: (editor) => {
      let disposed = false;
      let composing = false;
      let revision = 0;
      let savedRevision = 0;
      let epoch = 0;
      let status: SaveStateStatus = 'saved';
      let request: SaveRequest | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let notifying = false;
      let queued = false;
      const listeners = new Set<(state: SaveStateSnapshot) => void>();
      const cleanups: (() => void)[] = [];
      const active = (): void => { if (disposed) throw new Error('Save-state plugin has been disposed.'); };
      const snapshot = (): SaveStateSnapshot => Object.freeze({ status, dirty: revision !== savedRevision, revision, savedRevision });
      const report = (error: unknown): void => {
        try { onError?.(error); }
        catch { /* Trusted diagnostics cannot prevent request settlement or cleanup. */ }
      };
      const notify = (): void => {
        if (disposed) return;
        if (notifying) { queued = true; return; }
        notifying = true;
        try {
          do {
            queued = false;
            const state = snapshot();
            for (const listener of [...listeners]) {
              if (disposed) break;
              if (!listeners.has(listener)) continue;
              try { listener(state); }
              catch (error) { report(error); }
            }
          } while (queued && !disposed);
        }
        finally { notifying = false; }
      };
      const clearTimer = (): void => {
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
      };
      const cancel = (): void => {
        const previous = request;
        request = undefined;
        if (!previous) return;
        previous.complete = undefined;
        previous.resolve(false);
        try { previous.controller.abort(); }
        catch (error) { report(error); }
      };
      const schedule = (): void => {
        clearTimer();
        if (disposed || !autoSave || composing || request || status !== 'dirty' || revision === savedRevision) return;
        const currentEpoch = epoch;
        timer = setTimeout(() => {
          timer = undefined;
          if (!disposed && epoch === currentEpoch && !composing && !request && status === 'dirty') void save();
        }, debounceMs);
      };
      const owns = (pending: SaveRequest): boolean => !disposed && request === pending && epoch === pending.epoch && !pending.controller.signal.aborted;
      const finish = (pending: SaveRequest, success: boolean, error?: unknown): void => {
        if (!owns(pending)) return;
        pending.complete = undefined;
        request = undefined;
        if (success) {
          savedRevision = pending.revision;
          status = revision === savedRevision ? 'saved' : 'dirty';
        }
        else status = 'error';
        pending.resolve(success);
        notify();
        if (!success) report(error);
        if (success) schedule();
      };
      const save = (): Promise<boolean> => {
        active();
        if (request) return request.promise;
        if (composing || revision === savedRevision) return Promise.resolve(false);
        clearTimer();
        const savingRevision = revision;
        const savingEpoch = epoch;
        let document: EditorDocument;
        try { document = editor.schema.validateDocument(editor.getJSON()); }
        catch (error) {
          status = 'error';
          notify();
          report(error);
          return Promise.resolve(false);
        }
        if (disposed || epoch !== savingEpoch || revision !== savingRevision || composing) return Promise.resolve(false);
        let settle: (saved: boolean) => void = () => {};
        const promise = new Promise<boolean>((resolve) => { settle = resolve; });
        const pending: SaveRequest = { controller: new AbortController(), revision: savingRevision, epoch: savingEpoch, promise, resolve: settle };
        pending.complete = (success, error) => finish(pending, success, error);
        request = pending;
        status = 'saving';
        notify();
        if (!owns(pending)) return promise;
        try {
          const result = persist(document, Object.freeze({ signal: pending.controller.signal, revision: savingRevision }));
          // Late transport reactions retain only this cleared request record after cancellation.
          Promise.resolve(result).then(() => pending.complete?.(true), (error: unknown) => pending.complete?.(false, error));
        }
        catch (error) { finish(pending, false, error); }
        return promise;
      };
      const acknowledge = (replacement: boolean): void => {
        epoch++;
        clearTimer();
        if (replacement) revision++;
        const changed = !!request || status !== 'saved' || savedRevision !== revision;
        savedRevision = revision;
        status = 'saved';
        cancel();
        if (changed) notify();
      };
      const api: SaveStateCommands = {
        getState: () => { active(); return snapshot(); },
        save,
        retry: () => save(),
        markSaved: () => { active(); acknowledge(false); },
        subscribe: (listener) => {
          active();
          if (typeof listener !== 'function') throw new TypeError('Expected a save-state listener.');
          listeners.add(listener);
          try { listener(snapshot()); }
          catch (error) { report(error); }
          return () => { listeners.delete(listener); };
        },
      };
      const listen = (type: string, listener: EventListener): void => {
        editor.surface.addEventListener(type, listener);
        cleanups.push(() => editor.surface.removeEventListener(type, listener));
      };
      const destroy = (): void => {
        if (disposed) return;
        disposed = true;
        epoch++;
        clearTimer();
        listeners.clear();
        const failures: unknown[] = [];
        for (const stop of cleanups.splice(0).reverse()) {
          try { stop(); }
          catch (error) { failures.push(error); }
        }
        cancel();
        for (const error of failures) report(error);
      };
      try {
        cleanups.push(editor.providePlugin('save-state', api));
        cleanups.push(editor.subscribe((change) => {
          if (disposed) return;
          if (change.source === 'api') {
            composing = false;
            acknowledge(true);
          }
          else {
            revision++;
            status = request ? 'saving' : 'dirty';
            notify();
            schedule();
          }
        }));
        listen('compositionstart', () => { if (!disposed) { composing = true; clearTimer(); } });
        listen('compositionend', () => { if (!disposed) { composing = false; schedule(); } });
        cleanups.push(editor.events.on('readonlychange', () => { if (!disposed) { composing = false; schedule(); } }));
        cleanups.push(editor.events.on('destroy', destroy));
      }
      catch (error) {
        destroy();
        throw error;
      }
      return destroy;
    },
  };
};

export const saveStateCommands = (editor: Editor): SaveStateCommands => {
  const api = editor.getPlugin<SaveStateCommands>('save-state');
  if (!api) throw new Error('Install the save-state plugin first.');
  return api;
};
