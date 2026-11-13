import type { Editor } from '@morfira-dev/wysiwyg-core';
import { createSuggestions } from '../suggestions/engine.js';
import type { SuggestionController } from '../suggestions/types.js';
import type { SlashAction, SlashOption, SlashOptions } from './types.js';
export type { SlashAction, SlashActions, SlashOption, SlashOptions } from './types.js';
export type { SuggestionController, SuggestionState, SuggestionQuery, SuggestionProvider, SuggestionOptions, SuggestionAnchor } from '../suggestions/types.js';
export { createSlashActions } from './actions.js';
export const slash = (options: SlashOptions) => {
  if (!options || typeof options !== 'object' || Array.isArray(options))
    throw new TypeError('Expected slash options.');
  const source = options.actions;
  if (source !== undefined && (!source || typeof source !== 'object' || Array.isArray(source)))
    throw new TypeError('Expected a slash action registry.');
  const actions = new Map<string, SlashAction>();
  for (const [name, action] of Object.entries(source ?? {})) {
    if (!/^[A-Za-z][A-Za-z0-9_:.-]{0,127}$/.test(name) || typeof action !== 'function')
      throw new TypeError('Slash actions need valid names and synchronous callbacks.');
    actions.set(name, action);
  }
  return createSuggestions('slash', options, actions);
};
export const slashCommands = (editor: Editor): SuggestionController<SlashOption> => {
  const api = editor.getPlugin<SuggestionController<SlashOption>>('slash');
  if (!api)
    throw new Error('Install the slash plugin first.');
  return api;
};
