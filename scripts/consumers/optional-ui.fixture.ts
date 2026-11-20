import { createPreviewUI } from '@morfira-dev/wysiwyg/ui/preview';
import { saveState, saveStateCommands } from '@morfira-dev/wysiwyg/plugins/save-state';
import { createSaveStateUI } from '@morfira-dev/wysiwyg/ui/save-state';
import { createEditor } from '@morfira-dev/wysiwyg';
import { createSpecialCharacterUI } from '@morfira-dev/wysiwyg/ui/special-characters';
import { createFullscreenUI } from '@morfira-dev/wysiwyg/ui/fullscreen';
import { autolink } from '@morfira-dev/wysiwyg/plugins/autolink';
import { tables, tableCommands } from '@morfira-dev/wysiwyg/plugins/tables';
import { tableProperties, tablePropertyCommands } from '@morfira-dev/wysiwyg/plugins/table-properties';
import { createPrintUI } from '@morfira-dev/wysiwyg/ui/print';
import { createOutlineUI } from '@morfira-dev/wysiwyg/ui/outline';
import { textDrop } from '@morfira-dev/wysiwyg/plugins/text-drop';
import type { OptionalUIProbe, ReadingProbe } from './optional-ui.types.js';

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
const probe: OptionalUIProbe = {
  editor, characters, fullscreen, preview, saveState: saveAPI, saveUI, getSaveCalls: () => saveCalls,
  setupReading: () => {
    if (reading) throw new Error('Consumer reading editor already exists.');
    readingHost = document.createElement('div');
    readingHost.dataset.readingProbe = '';
    const host = document.createElement('div');
    const printHost = document.createElement('div');
    const outlineHost = document.createElement('div');
    readingHost.append(host, printHost, outlineHost);
    document.body.append(readingHost);
    const instance = createEditor(host, { locale: 'en', value: '<h2>Section</h2><p>Body</p>', plugins: [textDrop()] });
    reading = { editor: instance, print: createPrintUI(printHost, instance), outline: createOutlineUI(outlineHost, instance) };
  },
  getReading: () => {
    if (!reading) throw new Error('Create the reading editor first.');
    return reading;
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
