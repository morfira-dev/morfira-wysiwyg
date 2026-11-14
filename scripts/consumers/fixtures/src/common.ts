import { createEditorCommand } from '@morfira-dev/wysiwyg';
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
import { createLinkForm } from '@morfira-dev/wysiwyg/ui/links';
import { createImageForm } from '@morfira-dev/wysiwyg/ui/images';
import { createSearchForm } from '@morfira-dev/wysiwyg/ui/search';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/plugins/tables.css';
import '@morfira-dev/wysiwyg/plugins/suggestions.css';
import '@morfira-dev/wysiwyg/ui/forms.css';

const probe: ConsumerProbe = { changes: 0 };
window.morfiraConsumer = probe;
const insertNoteCommand = createEditorCommand<{ text: string }>('consumer:insert-note');
const sdkPlugin: EditorPlugin = {
  name: 'consumer-sdk',
  schema: [{
    name: 'consumer:note',
    kind: 'block',
    tag: 'blockquote',
    attributes: { 'data-tone': { type: 'enum', values: ['note', 'warning'], required: true } },
  }],
  setup: (editor) => editor.commands.register(insertNoteCommand, {
    validate: (payload) => {
      if (!payload || typeof payload !== 'object' || !('text' in payload) || typeof payload.text !== 'string')
        throw new TypeError('Expected note text.');
      return { text: payload.text };
    },
    execute: (instance, payload) => {
      const note = instance.surface.ownerDocument.createElement('blockquote');
      note.setAttribute('data-mw-node', 'consumer:note');
      note.setAttribute('data-tone', 'note');
      note.textContent = payload.text;
      instance.insertHTML(note.outerHTML);
    },
  }),
};
export const plugins: EditorPlugin[] = [
  sdkPlugin, tables(), images(), search(), statistics(), markdownShortcuts(),
  mentions({ provide: () => [{ id: 'anna', label: 'Anna' }], debounceMs: 0 }),
  slash({
    provide: () => [{ id: 'heading', label: 'Heading 2', action: 'heading2' }],
    actions: createSlashActions(),
    debounceMs: 0,
  }),
];
export const ready = (editor: Editor) => {
  probe.editor = editor;
  const insertNote = (text: string) => editor.commands.execute(insertNoteCommand, { text });
  probe.insertNote = insertNote;
  createSuggestionMenu(editor, slashCommands(editor));
  const host = document.createElement('div');
  host.dataset.consumerUi = '';
  const linkHost = document.createElement('div');
  const imageHost = document.createElement('div');
  const searchHost = document.createElement('div');
  host.append(linkHost, imageHost, searchHost);
  document.body.append(host);
  const forms = {
    links: createLinkForm(linkHost, editor, { label: 'Consumer links' }),
    images: createImageForm(imageHost, editor, { label: 'Consumer images' }),
    search: createSearchForm(searchHost, editor, { label: 'Consumer search' }),
  };
  probe.forms = forms;
  editor.events.on('destroy', () => {
    forms.links.destroy();
    forms.images.destroy();
    forms.search.destroy();
    host.remove();
    if (probe.forms === forms) delete probe.forms;
    if (probe.insertNote === insertNote) delete probe.insertNote;
  });
};
export const changed = (_change: EditorChange) => { probe.changes++; };
