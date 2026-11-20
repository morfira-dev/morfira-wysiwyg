import { createSpecialCharacterUI } from '@morfira-dev/wysiwyg/ui/special-characters';
import '@morfira-dev/wysiwyg/ui/special-characters.css';
import { createEditorCommand } from '@morfira-dev/wysiwyg';
import type { Editor, EditorChange, EditorPlugin } from '@morfira-dev/wysiwyg';
import type { ConsumerProbe } from './types.js';
import { createExtendedPreset } from '@morfira-dev/wysiwyg/presets/extended';
import { createTablePicker } from '@morfira-dev/wysiwyg/ui/table-picker';
import '@morfira-dev/wysiwyg/ui/table-picker.css';
import { imageInput } from '@morfira-dev/wysiwyg/plugins/image-input';
import { createTablePropertiesForm } from '@morfira-dev/wysiwyg/ui/table-properties';
import { tableProperties, tablePropertyCommands } from '@morfira-dev/wysiwyg/plugins/table-properties';
import { createStandardEditorUI } from '@morfira-dev/wysiwyg/ui/standard';
import { createContextualTableUI } from '@morfira-dev/wysiwyg/ui/contextual-table';
import { getTableSelection, tableCommands } from '@morfira-dev/wysiwyg/plugins/tables';
import '@morfira-dev/wysiwyg/ui/contextual-table.css';
import { createContextualImageUI } from '@morfira-dev/wysiwyg/ui/contextual-image';
import { createImageResizeUI } from '@morfira-dev/wysiwyg/ui/image-resize';
import '@morfira-dev/wysiwyg/ui/image-resize.css';
import { imageCommands } from '@morfira-dev/wysiwyg/plugins/images';
import '@morfira-dev/wysiwyg/ui/contextual-image.css';
import { createContextualLinkUI } from '@morfira-dev/wysiwyg/ui/contextual-link';
import '@morfira-dev/wysiwyg/ui/contextual-link.css';
import { createContextualToolbar } from '@morfira-dev/wysiwyg/ui/contextual';
import { slashCommands, createSlashActions } from '@morfira-dev/wysiwyg/plugins/slash';
import { createSuggestionMenu } from '@morfira-dev/wysiwyg/plugins/suggestions';
import { createLinkForm } from '@morfira-dev/wysiwyg/ui/links';
import { createImageForm } from '@morfira-dev/wysiwyg/ui/images';
import { createSearchForm } from '@morfira-dev/wysiwyg/ui/search';
import { searchCommands } from '@morfira-dev/wysiwyg/plugins/search';
import { createSearchHighlights } from '@morfira-dev/wysiwyg/ui/search-highlights';
import '@morfira-dev/wysiwyg/ui/search-highlights.css';
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
import '@morfira-dev/wysiwyg/ui/contextual.css';

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
  plugins: [tableProperties(), sdkPlugin, checklists(), fonts(), listProperties(), textDirection(), imageInput()],
  images: { upload: async () => ({ src: '/consumer-image.svg', alt: 'Clipboard image' }) },
  mentions: { provide: () => [{ id: 'anna', label: 'Anna' }], debounceMs: 0 },
  slash: {
    provide: () => [{ id: 'heading', label: 'Heading 2', action: 'heading2' }],
    actions: createSlashActions(),
    debounceMs: 0,
  },
}).plugins!;
export const ready = (editor: Editor) => {
  probe.editor = editor;
  let characterUI: ReturnType<typeof createSpecialCharacterUI> | undefined;
  let characterHost: HTMLElement | undefined;
  const hideSpecialCharacters = () => {
    characterUI?.destroy();
    characterHost?.remove();
    characterUI = undefined;
    characterHost = undefined;
  };
  const showSpecialCharacters = () => {
    hideSpecialCharacters();
    characterHost = document.createElement('div');
    characterHost.dataset.consumerSpecialCharacters = '';
    document.body.append(characterHost);
    characterUI = createSpecialCharacterUI(characterHost, editor, {
      label: 'Consumer special characters',
      characters: [{ id: 'consumer-euro', text: '€', label: 'Consumer euro' }],
    });
  };
  probe.showSpecialCharacters = showSpecialCharacters;
  probe.hideSpecialCharacters = hideSpecialCharacters;
  const searchAPI = searchCommands(editor);
  probe.search = searchAPI;
  let highlights: ReturnType<typeof createSearchHighlights> | undefined;
  const hideSearchHighlights = () => {
    highlights?.destroy();
    highlights = undefined;
    delete probe.searchHighlights;
  };
  const showSearchHighlights = () => {
    hideSearchHighlights();
    highlights = createSearchHighlights(editor);
    probe.searchHighlights = highlights;
  };
  probe.showSearchHighlights = showSearchHighlights;
  probe.hideSearchHighlights = hideSearchHighlights;
  const fontAPI = fontCommands(editor);
  probe.fonts = fontAPI;
  const listAPI = listPropertyCommands(editor);
  probe.listProperties = listAPI;
  const directionAPI = textDirectionCommands(editor);
  probe.textDirection = directionAPI;
  const uiHost = document.createElement('div');
  uiHost.dataset.consumerReadyUi = '';
  document.body.append(uiHost);
  const ui = createStandardEditorUI(uiHost, editor, { label: 'Consumer ready tools', density: 'compact', table: { picker: createTablePicker } });
  probe.ui = ui;
  let contextual: ReturnType<typeof createContextualToolbar> | undefined;
  let contextualHost: HTMLElement | undefined;
  const hideContextual = () => {
    contextual?.destroy();
    contextualHost?.remove();
    contextual = undefined;
    contextualHost = undefined;
    delete probe.contextual;
  };
  const showContextual = () => {
    hideContextual();
    contextualHost = document.createElement('div');
    contextualHost.dataset.consumerContextual = '';
    document.body.append(contextualHost);
    contextual = createContextualToolbar(contextualHost, editor, { label: 'Consumer contextual', density: 'compact' });
    probe.contextual = contextual;
  };
  probe.showContextual = showContextual;
  probe.hideContextual = hideContextual;
  let contextualLink: ReturnType<typeof createContextualLinkUI> | undefined;
  let contextualLinkHost: HTMLElement | undefined;
  const hideContextualLink = () => {
    contextualLink?.destroy();
    contextualLinkHost?.remove();
    contextualLink = undefined;
    contextualLinkHost = undefined;
    delete probe.contextualLink;
  };
  const showContextualLink = () => {
    hideContextualLink();
    contextualLinkHost = document.createElement('div');
    contextualLinkHost.dataset.consumerContextualLink = '';
    document.body.append(contextualLinkHost);
    contextualLink = createContextualLinkUI(contextualLinkHost, editor, { label: 'Consumer contextual link' });
    probe.contextualLink = contextualLink;
  };
  probe.showContextualLink = showContextualLink;
  probe.hideContextualLink = hideContextualLink;
  let contextualImage: ReturnType<typeof createContextualImageUI> | undefined;
  let contextualImageHost: HTMLElement | undefined;
  const hideContextualImage = () => {
    contextualImage?.destroy();
    contextualImageHost?.remove();
    contextualImage = undefined;
    contextualImageHost = undefined;
    delete probe.contextualImage;
  };
  const showContextualImage = () => {
    hideContextualImage();
    contextualImageHost = document.createElement('div');
    contextualImageHost.dataset.consumerContextualImage = '';
    document.body.append(contextualImageHost);
    imageCommands(editor).select(editor.surface.querySelector('img')!);
    contextualImage = createContextualImageUI(contextualImageHost, editor, { label: 'Consumer contextual image' });
    probe.contextualImage = contextualImage;
  };
  probe.showContextualImage = showContextualImage;
  probe.hideContextualImage = hideContextualImage;
  let imageResize: ReturnType<typeof createImageResizeUI> | undefined;
  let imageResizeHost: HTMLElement | undefined;
  const hideImageResize = () => {
    imageResize?.destroy();
    imageResizeHost?.remove();
    imageResize = undefined;
    imageResizeHost = undefined;
    delete probe.imageResize;
  };
  const showImageResize = () => {
    hideImageResize();
    imageResizeHost = document.createElement('div');
    imageResizeHost.dataset.consumerImageResize = '';
    document.body.append(imageResizeHost);
    imageCommands(editor).select(editor.surface.querySelector('img')!);
    imageResize = createImageResizeUI(imageResizeHost, editor, { label: 'Consumer image resize' });
    probe.imageResize = imageResize;
  };
  probe.showImageResize = showImageResize;
  probe.hideImageResize = hideImageResize;
  const tablesAPI = tableCommands(editor);
  probe.images = imageCommands(editor);
  probe.tables = tablesAPI;
  probe.tableProperties = tablePropertyCommands(editor);
  const propertiesHost = document.createElement('div');
  propertiesHost.dataset.consumerTableProperties = '';
  document.body.append(propertiesHost);
  const propertiesForm = createTablePropertiesForm(propertiesHost, editor, { label: 'Consumer table properties' });
  probe.tablePropertiesForm = propertiesForm;
  const readTableSelection = () => getTableSelection(editor);
  probe.getTableSelection = readTableSelection;
  let contextualTable: ReturnType<typeof createContextualTableUI> | undefined;
  let contextualTableHost: HTMLElement | undefined;
  const hideContextualTable = () => {
    contextualTable?.destroy();
    contextualTableHost?.remove();
    contextualTable = undefined;
    contextualTableHost = undefined;
    delete probe.contextualTable;
  };
  const showContextualTable = () => {
    hideContextualTable();
    contextualTableHost = document.createElement('div');
    contextualTableHost.dataset.consumerContextualTable = '';
    document.body.append(contextualTableHost);
    const cell = editor.surface.querySelector('td,th')!;
    const range = document.createRange();
    range.selectNodeContents(cell.firstElementChild ?? cell);
    range.collapse(true);
    editor.surface.focus({ preventScroll: true });
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    tablesAPI.select({ row: 0, column: 0 });
    contextualTable = createContextualTableUI(contextualTableHost, editor, { label: 'Consumer contextual table' });
    probe.contextualTable = contextualTable;
  };
  probe.showContextualTable = showContextualTable;
  probe.hideContextualTable = hideContextualTable;
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
    hideSpecialCharacters();
    if (probe.showSpecialCharacters === showSpecialCharacters) delete probe.showSpecialCharacters;
    if (probe.hideSpecialCharacters === hideSpecialCharacters) delete probe.hideSpecialCharacters;
    hideSearchHighlights();
    if (probe.search === searchAPI) delete probe.search;
    if (probe.showSearchHighlights === showSearchHighlights) delete probe.showSearchHighlights;
    if (probe.hideSearchHighlights === hideSearchHighlights) delete probe.hideSearchHighlights;
    hideOverflow();
    hideContextual();
    hideContextualLink();
    hideContextualImage();
    hideContextualTable();
    propertiesForm.destroy();
    propertiesHost.remove();
    delete probe.tableProperties;
    delete probe.tablePropertiesForm;
    if (probe.tables === tablesAPI) delete probe.tables;
    if (probe.getTableSelection === readTableSelection) delete probe.getTableSelection;
    if (probe.showContextualTable === showContextualTable) delete probe.showContextualTable;
    if (probe.hideContextualTable === hideContextualTable) delete probe.hideContextualTable;
    if (probe.showContextualImage === showContextualImage) delete probe.showContextualImage;
    if (probe.hideContextualImage === hideContextualImage) delete probe.hideContextualImage;
    hideImageResize();
    if (probe.showImageResize === showImageResize) delete probe.showImageResize;
    if (probe.hideImageResize === hideImageResize) delete probe.hideImageResize;
    if (probe.showContextualLink === showContextualLink) delete probe.showContextualLink;
    if (probe.hideContextualLink === hideContextualLink) delete probe.hideContextualLink;
    if (probe.showContextual === showContextual) delete probe.showContextual;
    if (probe.hideContextual === hideContextual) delete probe.hideContextual;
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
