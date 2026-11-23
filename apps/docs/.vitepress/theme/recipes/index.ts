import { nodeCommands, nodeExtension } from '@morfira-dev/wysiwyg/sdk';
import { images } from '@morfira-dev/wysiwyg/plugins/images';
import { mentions } from '@morfira-dev/wysiwyg/plugins/mentions';
import { saveState } from '@morfira-dev/wysiwyg/plugins/save-state';
import type { RecipeBundle, RecipeOptions } from './types.js';

export { createMentionProvider } from './mentions.js';
export { createImageUpload } from './upload.js';
export { createSaveSession } from './save.js';
export { createLazyHighlight } from './highlight.js';
export type { RecipeBundle, RecipeOptions, RecipeRecord, RecipeSaveSession, RecipeSaveTransport, VersionedRecipeDocument } from './types.js';

export const createRecipeBundle = ({ upload, mentionProvider, saveSession, onError }: RecipeOptions): RecipeBundle => ({
  plugins: [
    nodeExtension({ name: 'recipe:record', kind: 'inline', tag: 'span',
      attributes: { 'data-record-id': { type: 'text', minLength: 1, maxLength: 64, singleLine: true, required: true } },
      content: { type: 'text', minLength: 1, maxLength: 120, singleLine: true } }, { atomic: true }),
    images({ upload, maxFileSize: 5_000_000 }),
    mentions({ persistent: true, atomic: true, provide: mentionProvider, debounceMs: 50, maxItems: 8 }),
    saveState({ save: saveSession.save, autoSave: false, onError }),
  ],
  insertRecord: (editor, value) => {
    if (!value || typeof value.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value.id) || typeof value.label !== 'string' || !value.label.trim()
      || value.label.length > 120 || /[\u0000-\u001f\u007f]/.test(value.label)) throw new TypeError('Invalid record reference.');
    return nodeCommands(editor, 'recipe:record').insert(value.label, { 'data-record-id': value.id });
  },
});
