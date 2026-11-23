import type { RecipeSaveSession, RecipeSaveTransport, VersionedRecipeDocument } from './types.js';

export const createSaveSession = (transport: RecipeSaveTransport, initialVersion: string): RecipeSaveSession => {
  const checkedVersion = (value: string) => {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(value)) throw new TypeError('Expected a bounded opaque server version.');
    return value;
  };
  let version = checkedVersion(initialVersion);
  let generation = 0;
  let saving = false;
  let pending: VersionedRecipeDocument | undefined;
  return {
    save: async (document, { signal }) => {
      signal.throwIfAborted();
      if (saving) throw new Error('A save is already in flight.');
      pending = undefined;
      const epoch = ++generation;
      const expected = version;
      saving = true;
      try {
        const next = checkedVersion(await transport.save(document, expected, signal));
        signal.throwIfAborted();
        if (epoch !== generation || expected !== version) throw new Error('The save belongs to an older session.');
        version = next;
      }
      finally { saving = false; }
    },
    reload: async (signal) => {
      signal.throwIfAborted();
      if (saving) throw new Error('Finish or cancel saving before explicit reload.');
      pending = undefined;
      const epoch = ++generation;
      const result = await transport.load(signal);
      signal.throwIfAborted();
      if (epoch !== generation) throw new Error('A newer reload superseded this result.');
      const next = checkedVersion(result.version);
      // Validate result.document with editor.schema before replacing editor data.
      // The application transport remains trusted; this helper grants no render authority.
      pending = Object.freeze({ document: result.document, version: next });
      return pending;
    },
    acceptReload: (result) => {
      if (saving || !pending || pending !== result) throw new Error('Expected the current explicitly loaded snapshot.');
      version = checkedVersion(result.version);
      pending = undefined;
    },
    getVersion: () => version,
  };
};
