import { createEditor } from '@morfira-dev/wysiwyg';
import { createSpecialCharacterUI } from '@morfira-dev/wysiwyg/ui/special-characters';
import { createFullscreenUI } from '@morfira-dev/wysiwyg/ui/fullscreen';
import type { OptionalUIProbe } from './optional-ui.types.js';

const target = document.createElement('section');
target.dataset.optionalWorkspace = '';
const editorHost = document.createElement('div');
const characterHost = document.createElement('div');
const fullscreenHost = document.createElement('div');
target.append(fullscreenHost, editorHost, characterHost);
document.body.append(target);
const editor = createEditor(editorHost, { locale: 'en', value: '<p>AB</p>' });
editor.focus();
editor.setSelection(1);
const characters = createSpecialCharacterUI(characterHost, editor, {
  characters: [{ id: 'consumer-euro', text: '€', label: 'Consumer euro' }],
});
const fullscreen = createFullscreenUI(fullscreenHost, editor, { target });
const probe: OptionalUIProbe = {
  editor, characters, fullscreen,
  dispose: () => {
    fullscreen.destroy();
    characters.destroy();
    editor.destroy();
    target.remove();
  },
};
window.morfiraOptionalUI = probe;
