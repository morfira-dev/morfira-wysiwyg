import { createPreviewUI } from '@morfira-dev/wysiwyg/ui/preview';
import { saveState, saveStateCommands } from '@morfira-dev/wysiwyg/plugins/save-state';
import { createSaveStateUI } from '@morfira-dev/wysiwyg/ui/save-state';
import { createEditor } from '@morfira-dev/wysiwyg';
import { nodeExtension, nodeCommands, createNodeViews, createDecorations } from '@morfira-dev/wysiwyg/sdk';
import type { EditorSelectionHandle, EditorSelectionHandles } from '@morfira-dev/wysiwyg';
import { createSpecialCharacterUI } from '@morfira-dev/wysiwyg/ui/special-characters';
import { createFullscreenUI } from '@morfira-dev/wysiwyg/ui/fullscreen';
import { autolink } from '@morfira-dev/wysiwyg/plugins/autolink';
import { tables, tableCommands } from '@morfira-dev/wysiwyg/plugins/tables';
import { tableProperties, tablePropertyCommands } from '@morfira-dev/wysiwyg/plugins/table-properties';
import { createPrintUI } from '@morfira-dev/wysiwyg/ui/print';
import { createOutlineUI } from '@morfira-dev/wysiwyg/ui/outline';
import { textDrop } from '@morfira-dev/wysiwyg/plugins/text-drop';
import { images } from '@morfira-dev/wysiwyg/plugins/images';
import { createContextualLinkUI } from '@morfira-dev/wysiwyg/ui/contextual-link';
import { createContextualImageUI } from '@morfira-dev/wysiwyg/ui/contextual-image';
import { createStandardPreset } from '@morfira-dev/wysiwyg/presets/standard';
import { createStandardEditorUI } from '@morfira-dev/wysiwyg/ui/standard';
import { createTablePicker } from '@morfira-dev/wysiwyg/ui/table-picker';
import type { FloatingProbe, OptionalUIProbe, ReadingProbe } from './optional-ui.types.js';

const target = document.createElement('section');
target.dataset.optionalWorkspace = '';
const editorHost = document.createElement('div');
const characterHost = document.createElement('div');
const fullscreenHost = document.createElement('div');
const previewHost = document.createElement('div');
const saveHost = document.createElement('div');
target.append(fullscreenHost, editorHost, characterHost, previewHost, saveHost);
document.body.append(target);
let saveCalls = 0;
const editor = createEditor(editorHost, { locale: 'en', value: '<p>AB</p>', plugins: [saveState({ save: () => { saveCalls++; } })] });
editor.focus();
editor.setSelection(1);
// Compile against actual facade declarations, including the opaque token export.
const selectionHandles: EditorSelectionHandles = editor.selection;
const initialSelection: EditorSelectionHandle | undefined = selectionHandles.capture();
if (initialSelection) selectionHandles.release(initialSelection);
const characters = createSpecialCharacterUI(characterHost, editor, {
  characters: [{ id: 'consumer-euro', text: '€', label: 'Consumer euro' }],
});
const fullscreen = createFullscreenUI(fullscreenHost, editor, { target });
const preview = createPreviewUI(previewHost, editor);
const saveAPI = saveStateCommands(editor);
const saveUI = createSaveStateUI(saveHost, editor);
let featureEditor: ReturnType<typeof createEditor> | undefined;
let featureHost: HTMLElement | undefined;
let reading: ReadingProbe | undefined;
let readingHost: HTMLElement | undefined;
let floating: FloatingProbe | undefined;
let floatingHost: HTMLElement | undefined;
const probe: OptionalUIProbe = {
  exerciseSDK: () => {
    const workspace = document.createElement('section');
    const host = document.createElement('div');
    const viewHost = document.createElement('div');
    workspace.append(host, viewHost);
    document.body.append(workspace);
    const instance = createEditor(host, { value: '<p>A<span data-mw-node="consumer:token" data-id="42">T</span>Z</p>', plugins: [nodeExtension({
      name: 'consumer:token', kind: 'inline', tag: 'span',
      attributes: { 'data-id': { type: 'text', minLength: 1, maxLength: 64, required: true } },
      content: { type: 'text', minLength: 1, maxLength: 64, singleLine: true },
    }, { atomic: true })] });
    const views = createNodeViews(viewHost, instance, { name: 'consumer:token', create: (context) => {
      const element = document.createElement('div');
      element.textContent = context.text;
      return { element, update: (next) => { element.textContent = next.text; } };
    } });
    const decorations = createDecorations(instance, { name: 'consumer-sdk-probe' });
    try {
      const handle = instance.positions.track(2);
      if (!handle) throw new Error('The installed position SDK did not track.');
      decorations.set([{ from: 2, to: 3 }]);
      instance.transact((surface) => { (surface.querySelector('p')!.firstChild as Text).insertData(0, '+'); },
        { mapping: [{ from: 0, to: 0, insert: '+' }] });
      let mapped = instance.positions.resolve(handle)?.index === 3;
      instance.undo();
      mapped = mapped && instance.positions.resolve(handle)?.index === 2;
      instance.redo();
      mapped = mapped && instance.positions.resolve(handle)?.index === 3
        && (decorations.getState().status !== 'ready' || decorations.getState().count === 1);
      instance.positions.release(handle);
      const token = instance.surface.querySelector<HTMLElement>('[data-mw-node="consumer:token"]')!;
      const commands = nodeCommands(instance, 'consumer:token');
      commands.update(token, { 'data-id': '42' }, 'Updated');
      instance.setReadOnly(true);
      const readonly = commands.remove(token) === false && instance.surface.contains(token);
      const nodeText = token.textContent ?? '';
      const count = viewHost.childElementCount;
      const clean = !/contenteditable|consumer-sdk-probe/.test(instance.getHTML());
      return { mapped, nodeText, views: count, readonly, clean };
    }
    finally {
      decorations.destroy();
      views.destroy();
      instance.destroy();
      workspace.remove();
    }
  },
  editor, characters, fullscreen, preview, saveState: saveAPI, saveUI, getSaveCalls: () => saveCalls,
  setupReading: () => {
    if (reading) throw new Error('Consumer reading editor already exists.');
    readingHost = document.createElement('div');
    readingHost.dataset.readingProbe = '';
    const host = document.createElement('div');
    const printHost = document.createElement('div');
    const outlineHost = document.createElement('div');
    const linkHost = document.createElement('div');
    const imageHost = document.createElement('div');
    readingHost.append(host, printHost, outlineHost, linkHost, imageHost);
    document.body.append(readingHost);
    const instance = createEditor(host, { locale: 'en', value: '<h2>Section</h2><p>Body</p>', plugins: [textDrop(), images()] });
    reading = { editor: instance, print: createPrintUI(printHost, instance), outline: createOutlineUI(outlineHost, instance),
      links: createContextualLinkUI(linkHost, instance), image: createContextualImageUI(imageHost, instance) };
  },
  getReading: () => {
    if (!reading) throw new Error('Create the reading editor first.');
    return reading;
  },
  setupFloating: () => {
    if (floating) throw new Error('Consumer floating editor already exists.');
    floatingHost = document.createElement('section');
    floatingHost.dataset.floatingProbe = '';
    const tools = document.createElement('div');
    const host = document.createElement('div');
    const charactersHost = document.createElement('div');
    floatingHost.append(tools, host, charactersHost);
    document.body.append(floatingHost);
    const instance = createEditor(host, createStandardPreset({ locale: 'en', value: '<p>word word</p>' }));
    instance.focus();
    instance.setSelection(0, 4);
    floating = {
      editor: instance,
      ui: createStandardEditorUI(tools, instance, {
        presentation: 'floating',
        images: { initialValues: { src: '/context-image.png', alt: 'Archive dialog image' } },
        table: { picker: createTablePicker },
        search: { initialValues: { query: 'word', replacement: 'term' } },
      }),
      characters: createSpecialCharacterUI(charactersHost, instance, {
        presentation: 'dialog',
        characters: [{ id: 'archive-euro', text: '€', label: 'Archive euro' }],
      }),
    };
  },
  getFloating: () => {
    if (!floating) throw new Error('Create the floating editor first.');
    return floating;
  },
  setupFeatures: () => {
    if (featureEditor) throw new Error('Consumer feature editor already exists.');
    featureHost = document.createElement('div');
    featureHost.dataset.featureProbe = '';
    document.body.append(featureHost);
    featureEditor = createEditor(featureHost, {
      value: '<p></p><table><tbody><tr><td colspan="2">Merged</td></tr><tr><td>A</td><td>B</td></tr></tbody></table>',
      plugins: [tables(), tableProperties(), autolink({ email: true })],
    });
    const cell = featureEditor.surface.querySelector('td')!;
    featureEditor.focus();
    const range = document.createRange();
    range.selectNodeContents(cell);
    range.collapse(true);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    tableCommands(featureEditor).select({ row: 0, column: 0 });
    tablePropertyCommands(featureEditor).update({ cellTextAlign: 'center', cellDirection: 'rtl' });
    const state = tablePropertyCommands(featureEditor).getState();
    if (state.cellTextAlign !== 'center' || state.cellDirection !== 'rtl'
        || cell.colSpan !== 2 || cell.textContent !== 'Merged') throw new Error('Archived table typography failed.');
    featureEditor.focus();
    featureEditor.setSelection(0);
  },
  dispose: () => {
    floating?.characters.destroy();
    floating?.ui.destroy();
    floating?.editor.destroy();
    floatingHost?.remove();
    reading?.links.destroy();
    reading?.image.destroy();
    reading?.print.destroy();
    reading?.outline.destroy();
    reading?.editor.destroy();
    readingHost?.remove();
    featureEditor?.destroy();
    featureHost?.remove();
    preview.destroy();
    saveUI.destroy();
    fullscreen.destroy();
    characters.destroy();
    editor.destroy();
    target.remove();
  },
};
window.morfiraOptionalUI = probe;
