import type { Editor } from '@morfira-dev/wysiwyg-core';
import type { SearchRangeSnapshot } from './types.js';

const readers = new WeakMap<Editor, () => SearchRangeSnapshot>();

export const registerSearchRanges = (editor: Editor, read: () => SearchRangeSnapshot): (() => void) => {
  readers.set(editor, read);
  return () => { if (readers.get(editor) === read) readers.delete(editor); };
};

/** Fresh observational ranges; callers receive no authority to execute commands. */
export const getSearchRanges = (editor: Editor): SearchRangeSnapshot => {
  const read = readers.get(editor);
  if (!editor.getPlugin('search') || !read) throw new Error('Install the search plugin first.');
  return read();
};
