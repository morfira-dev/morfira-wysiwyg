import type { SlashActions } from './types.js';
/** Fresh, opt-in lightweight formatting commands; tables and media remain external plugins. */
export const createSlashActions = (): SlashActions => ({
  paragraph: (editor) => editor.format('header', 0),
  heading1: (editor) => editor.format('header', 1),
  heading2: (editor) => editor.format('header', 2),
  heading3: (editor) => editor.format('header', 3),
  heading4: (editor) => editor.format('header', 4),
  heading5: (editor) => editor.format('header', 5),
  heading6: (editor) => editor.format('header', 6),
  bulletList: (editor) => editor.format('list', 'bullet'),
  orderedList: (editor) => editor.format('list', 'ordered'),
  blockquote: (editor) => editor.format('blockquote', true),
  codeBlock: (editor) => editor.format('code-block', true),
});
