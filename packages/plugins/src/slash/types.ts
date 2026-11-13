import type { Editor } from '@morfira-dev/wysiwyg-core';
import type { SuggestionOption, SuggestionOptions } from '../suggestions/types.js';
export type SlashOption = SuggestionOption & ({
  text: string;
  action?: never;
} | {
  action: string;
  text?: never;
});
/** Trusted synchronous command. All editor mutations join the outer choice transaction. */
export type SlashAction = (editor: Editor) => void;
export type SlashActions = Record<string, SlashAction>;
export interface SlashOptions extends SuggestionOptions<SlashOption> {
  actions?: SlashActions;
}
