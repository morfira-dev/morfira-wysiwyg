import { createEditorCommand } from '@morfira-dev/wysiwyg';
import type { Editor, EditorChange, EditorPlugin } from '@morfira-dev/wysiwyg';
import type { ConsumerProbe } from './types.js';
import { createExtendedPreset } from '@morfira-dev/wysiwyg/presets/extended';
import { createStandardEditorUI } from '@morfira-dev/wysiwyg/ui/standard';
import { slashCommands, createSlashActions } from '@morfira-dev/wysiwyg/plugins/slash';
import { createSuggestionMenu } from '@morfira-dev/wysiwyg/plugins/suggestions';
import { createLinkForm } from '@morfira-dev/wysiwyg/ui/links';
import { createImageForm } from '@morfira-dev/wysiwyg/ui/images';
import { createSearchForm } from '@morfira-dev/wysiwyg/ui/search';
import { checklists } from '@morfira-dev/wysiwyg/plugins/checklists';
import { fonts, fontCommands } from '@morfira-dev/wysiwyg/plugins/fonts';
import { listProperties, listPropertyCommands } from '@morfira-dev/wysiwyg/plugins/list-properties';
import { textDirection, textDirectionCommands } from '@morfira-dev/wysiwyg/plugins/text-direction';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/plugins/tables.css';
import '@morfira-dev/wysiwyg/plugins/suggestions.css';
import '@morfira-dev/wysiwyg/plugins/checklists.css';
import '@morfira-dev/wysiwyg/ui/forms.css';
import '@morfira-dev/wysiwyg/ui/editor.css';

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
export const plugins: EditorPlugin[] = createExtendedPreset({
  plugins: [sdkPlugin, checklists(), fonts(), listProperties(), textDirection()],
  mentions: { provide: () => [{ id: 'anna', label: 'Anna' }], debounceMs: 0 },
  slash: {
    provide: () => [{ id: 'heading', label: 'Heading 2', action: 'heading2' }],
    actions: createSlashActions(),
    debounceMs: 0,
  },
}).plugins!;
export const ready = (editor: Editor) => {
  probe.editor = editor;
  const fontAPI = fontCommands(editor);
  probe.fonts = fontAPI;
  const listAPI = listPropertyCommands(editor);
  probe.listProperties = listAPI;
  const directionAPI = textDirectionCommands(editor);
  probe.textDirection = directionAPI;
  const uiHost = document.createElement('div');
  uiHost.dataset.consumerReadyUi = '';
  document.body.append(uiHost);
  const ui = createStandardEditorUI(uiHost, editor, { label: 'Consumer ready tools', density: 'compact' });
  probe.ui = ui;
  let overflowUI: ReturnType<typeof createStandardEditorUI> | undefined;
  let overflowHost: HTMLElement | undefined;
  const hideOverflow = () => {
    overflowUI?.destroy();
    overflowHost?.remove();
    overflowUI = undefined;
    overflowHost = undefined;
  };
  const showOverflow = () => {
    hideOverflow();
    overflowHost = document.createElement('div');
    overflowHost.dataset.consumerOverflow = '';
    overflowHost.style.width = '180px';
    document.body.append(overflowHost);
    overflowUI = createStandardEditorUI(overflowHost, editor, { overflow: 'more', label: 'Consumer overflow tools' });
  };
  probe.showOverflow = showOverflow;
  probe.hideOverflow = hideOverflow;
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
    hideOverflow();
    if (probe.showOverflow === showOverflow) delete probe.showOverflow;
    if (probe.hideOverflow === hideOverflow) delete probe.hideOverflow;
    forms.links.destroy();
    forms.images.destroy();
    forms.search.destroy();
    host.remove();
    ui.destroy();
    uiHost.remove();
    if (probe.ui === ui) delete probe.ui;
    if (probe.fonts === fontAPI) delete probe.fonts;
    if (probe.listProperties === listAPI) delete probe.listProperties;
    if (probe.textDirection === directionAPI) delete probe.textDirection;
    if (probe.forms === forms) delete probe.forms;
    if (probe.insertNote === insertNote) delete probe.insertNote;
  });
};
export const changed = (_change: EditorChange) => { probe.changes++; };
