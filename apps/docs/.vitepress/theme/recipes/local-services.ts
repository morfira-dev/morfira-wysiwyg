import { withBase } from 'vitepress';
import { createMentionProvider } from './mentions.js';
import { createSaveSession } from './save.js';
import type { LocalRecipeServices } from './types.js';
import type { EditorDocument } from '@morfira-dev/wysiwyg';

const delay = (signal: AbortSignal, milliseconds = 30): Promise<void> => new Promise((resolve, reject) => {
  if (signal.aborted) { reject(new DOMException('Cancelled.', 'AbortError')); return; }
  const abort = () => {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
    reject(new DOMException('Cancelled.', 'AbortError'));
  };
  const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, milliseconds);
  signal.addEventListener('abort', abort, { once: true });
});

/** Deterministic local services only: no HTTP and no user files leave the browser. */
export const createLocalRecipeServices = (onError?: (error: unknown) => void): LocalRecipeServices => {
  let revision = 1;
  let document: EditorDocument = { version: 1, children: [{ type: 'element', tag: 'p', attributes: {}, children: [{ type: 'text', text: 'Local server document' }] }] };
  const session = createSaveSession({
    save: async (value, expected, signal) => {
      await delay(signal);
      if (expected !== `v${revision}`) throw new Error('VERSION_CONFLICT');
      document = structuredClone(value);
      return `v${++revision}`;
    },
    load: async (signal) => {
      await delay(signal);
      return { version: `v${revision}`, document: structuredClone(document) };
    },
  }, 'v1');
  return {
    session,
    options: {
      saveSession: session,
      mentionProvider: createMentionProvider([{ id: 'user_1', label: 'Alice' }, { id: 'user_2', label: 'Boris' }, { id: 'user_3', label: 'Clara' }]),
      upload: async (file, context) => {
        context.reportProgress({ loaded: 0, total: file.size });
        await delay(context.signal);
        context.reportProgress({ loaded: file.size, total: file.size });
        return { src: withBase('/logo.svg'), alt: 'Simulated local upload', width: 72, height: 72 };
      },
      onError,
    },
    simulateRemoteChange: () => {
      revision++;
      document = { version: 1, children: [{ type: 'element', tag: 'p', attributes: {}, children: [{ type: 'text', text: `Remote revision ${revision}` }] }] };
    },
    getRemoteVersion: () => `v${revision}`,
  };
};
