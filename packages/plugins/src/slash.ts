import type { Editor } from '@morfira-dev/wysiwyg-core';
import { createSuggestions } from './suggestions-engine.js';
import type { SlashOption, SuggestionController, SuggestionOptions } from './suggestions-types.js';
export type { SlashOption, SuggestionController, SuggestionState, SuggestionQuery, SuggestionProvider, SuggestionOptions, SuggestionAnchor } from './suggestions-types.js';
export type SlashOptions = SuggestionOptions<SlashOption>;
export const slash = (options: SlashOptions) => createSuggestions('slash', options);
export const slashCommands = (editor: Editor): SuggestionController<SlashOption> => {
  const api = editor.getPlugin<SuggestionController<SlashOption>>('slash'); if (!api) throw new Error('Install the slash plugin first.'); return api;
};
