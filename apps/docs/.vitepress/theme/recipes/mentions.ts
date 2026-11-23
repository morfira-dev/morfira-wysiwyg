import type { MentionOptions } from '@morfira-dev/wysiwyg/plugins/mentions';
import type { RecipeRecord } from './types.js';

/** Replace the in-memory lookup with an authorized server query in an application. */
export const createMentionProvider = (records: readonly RecipeRecord[], delayMs = 100): MentionOptions['provide'] => {
  if (!Array.isArray(records) || records.length > 1000 || !Number.isInteger(delayMs) || delayMs < 0 || delayMs > 1000)
    throw new RangeError('The example directory is limited to 1000 records and a 0–1000 ms delay.');
  const directory = records.map((record) => {
    if (!record || typeof record.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(record.id) || typeof record.label !== 'string' || !record.label.trim()
      || record.label.length > 120 || /[\u0000-\u001f\u007f]/.test(record.label)) throw new TypeError('Invalid directory record.');
    return { id: record.id, label: record.label };
  });
  if (new Set(directory.map((record) => record.id)).size !== directory.length) throw new TypeError('Directory IDs must be unique.');
  return ({ query, signal, limit }) => new Promise((resolve, reject) => {
    if (typeof query !== 'string' || query.length > 120 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      reject(new RangeError('Invalid directory query.')); return;
    }
    if (signal.aborted) { reject(new DOMException('Lookup cancelled.', 'AbortError')); return; }
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      reject(new DOMException('Lookup cancelled.', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      const needle = query.toLocaleLowerCase();
      resolve(directory.filter((record) => record.label.toLocaleLowerCase().includes(needle)).slice(0, limit).map((record) => ({ ...record })));
    }, delayMs);
    signal.addEventListener('abort', abort, { once: true });
  });
};
