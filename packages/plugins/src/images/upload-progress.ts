import type { ImageUploadProgress } from './types.js';

/** Snapshot transport observations without accepting markup or unbounded numbers. */
export const normalizeUploadProgress = (value: unknown, previous: number): ImageUploadProgress | undefined => {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const input = value as ImageUploadProgress;
    const loaded = input.loaded;
    const total = input.total;
    if (!Number.isSafeInteger(loaded) || loaded < 0 || loaded < previous) return;
    if (total !== undefined && (!Number.isSafeInteger(total) || total <= 0 || loaded > total)) return;
    return Object.freeze({ loaded, ...(total !== undefined ? { total } : {}) });
  }
  catch {
    // Even a malformed application report must not fail the upload itself.
    return;
  }
};
