import type { Editor } from '@morfira-dev/wysiwyg-core';
import { mentionCommands } from '../../mentions/index.js';
import { slashCommands } from '../../slash/index.js';
import { createSuggestionMenu } from '../../suggestions/index.js';
import { createStandardEditorUI } from '../standard/index.js';
import type { ExtendedEditorUIOptions, ExtendedEditorUIController } from './types.js';

export type { ExtendedEditorUIOptions, ExtendedEditorUIController } from './types.js';

/** Compose ready current suggestion views without registering behavior or a provider. */
export const createExtendedEditorUI = (host: HTMLElement, editor: Editor, options: ExtendedEditorUIOptions = {}): ExtendedEditorUIController => {
  if (!options || typeof options !== 'object' || Array.isArray(options))
    throw new TypeError('Expected extended editor UI options.');
  const mentions = mentionCommands(editor);
  const slash = slashCommands(editor);
  const { mentions: mentionOptions, slash: slashOptions, ...standardOptions } = options;
  const standard = createStandardEditorUI(host, editor, standardOptions);
  const cleanups: (() => void)[] = [];
  let disposed = false;
  const destroy = () => {
    if (disposed) return;
    disposed = true;
    const failures: unknown[] = [];
    for (const cleanup of cleanups.splice(0).reverse()) {
      try { cleanup(); }
      catch (error) { failures.push(error); }
    }
    try { standard.destroy(); }
    catch (error) { failures.push(error); }
    if (failures.length) throw new AggregateError(failures, 'Extended UI cleanup failed.');
  };
  try {
    cleanups.push(createSuggestionMenu(editor, mentions, mentionOptions));
    cleanups.push(createSuggestionMenu(editor, slash, slashOptions));
    cleanups.push(editor.events.on('destroy', destroy));
  }
  catch (error) {
    try { destroy(); }
    catch { /* Preserve the setup error after attempting every owned cleanup. */ }
    throw error;
  }
  return {
    element: standard.element,
    refresh: () => {
      if (disposed) throw new Error('Extended editor UI has been destroyed.');
      standard.refresh();
    },
    destroy,
  };
};
