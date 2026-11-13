import type { Editor } from '@morfira-dev/wysiwyg-core';
import { createSuggestions } from './suggestions-engine.js';
import type { MentionOption, SuggestionController, SuggestionOptions } from './suggestions-types.js';
export type { MentionOption, SuggestionController, SuggestionState, SuggestionQuery, SuggestionProvider, SuggestionOptions, SuggestionAnchor } from './suggestions-types.js';
export type MentionOptions = SuggestionOptions<MentionOption>;
export const mentions = (options: MentionOptions) => createSuggestions('mentions', options);
export const mentionCommands = (editor: Editor): SuggestionController<MentionOption> => {
  const api = editor.getPlugin<SuggestionController<MentionOption>>('mentions'); if (!api) throw new Error('Install the mentions plugin first.'); return api;
};
