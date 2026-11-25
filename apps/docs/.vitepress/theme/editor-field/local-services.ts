import type { EditorDocument } from '@morfira-dev/wysiwyg';
import type { LocalEditorFieldServices } from './types.js';

const wait = (signal: AbortSignal, milliseconds: number): Promise<void> => new Promise((resolve, reject) => {
  if (signal.aborted) {
    reject(new DOMException('Cancelled.', 'AbortError'));
    return;
  }
  const cancel = () => {
    clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
    reject(new DOMException('Cancelled.', 'AbortError'));
  };
  const timer = setTimeout(() => {
    signal.removeEventListener('abort', cancel);
    resolve();
  }, milliseconds);
  signal.addEventListener('abort', cancel, { once: true });
});

export const createLocalEditorFieldServices = (initial: EditorDocument, assetUrl: string): LocalEditorFieldServices => {
  let saved = structuredClone(initial);
  let failNext = false;
  let disposed = false;
  const requests = new Set<AbortController>();
  const ownRequest = (signal: AbortSignal) => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (disposed || signal.aborted) controller.abort();
    else signal.addEventListener('abort', abort, { once: true });
    requests.add(controller);
    return {
      signal: controller.signal,
      finish: () => {
        signal.removeEventListener('abort', abort);
        requests.delete(controller);
      },
    };
  };
  return {
    save: async (document, context) => {
      const request = ownRequest(context.signal);
      const snapshot = structuredClone(document);
      const shouldFail = failNext;
      failNext = false;
      try {
        await wait(request.signal, 650);
        if (disposed || request.signal.aborted) throw new DOMException('Cancelled.', 'AbortError');
        if (shouldFail) throw new Error('Simulated save failure.');
        saved = snapshot;
      }
      finally {
        request.finish();
      }
    },
    upload: async (file, context) => {
      const request = ownRequest(context.signal);
      try {
        context.reportProgress({ loaded: 0, total: file.size });
        await wait(request.signal, 200);
        context.reportProgress({ loaded: Math.floor(file.size / 2), total: file.size });
        await wait(request.signal, 200);
        if (disposed || request.signal.aborted) throw new DOMException('Cancelled.', 'AbortError');
        context.reportProgress({ loaded: file.size, total: file.size });
        return { src: assetUrl, alt: 'Local upload example', width: 72, height: 72 };
      }
      finally {
        request.finish();
      }
    },
    getSaved: () => structuredClone(saved),
    failNextSave: () => { if (!disposed) failNext = true; },
    destroy: () => {
      if (disposed) return;
      disposed = true;
      for (const request of requests) request.abort();
      requests.clear();
    },
  };
};
