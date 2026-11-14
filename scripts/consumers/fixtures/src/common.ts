import type { Editor, EditorChange, EditorPlugin } from '@morfira-dev/wysiwyg';
import type { ConsumerProbe } from './types.js';
import { tables } from '@morfira-dev/wysiwyg/plugins/tables';
import { images } from '@morfira-dev/wysiwyg/plugins/images';
import { search } from '@morfira-dev/wysiwyg/plugins/search';
import { statistics } from '@morfira-dev/wysiwyg/plugins/statistics';
import { markdownShortcuts } from '@morfira-dev/wysiwyg/plugins/markdown';
import { mentions } from '@morfira-dev/wysiwyg/plugins/mentions';
import { slash, slashCommands, createSlashActions } from '@morfira-dev/wysiwyg/plugins/slash';
import { createSuggestionMenu } from '@morfira-dev/wysiwyg/plugins/suggestions';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/plugins/tables.css';
import '@morfira-dev/wysiwyg/plugins/suggestions.css';

const probe: ConsumerProbe = { changes: 0 };
window.morfiraConsumer = probe;
export const plugins: EditorPlugin[] = [
  tables(), images(), search(), statistics(), markdownShortcuts(),
  mentions({ provide: () => [{ id: 'anna', label: 'Anna' }], debounceMs: 0 }),
  slash({
    provide: () => [{ id: 'heading', label: 'Heading 2', action: 'heading2' }],
    actions: createSlashActions(),
    debounceMs: 0,
  }),
];
export const ready = (editor: Editor) => {
  probe.editor = editor;
  createSuggestionMenu(editor, slashCommands(editor));
};
export const changed = (_change: EditorChange) => { probe.changes++; };
