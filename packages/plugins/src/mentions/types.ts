import type { MentionOption, SuggestionOptions } from '../suggestions/types.js';
export interface MentionOptions extends SuggestionOptions<MentionOption> {
  persistent?: boolean;
}

export interface MentionReference {
  id: string;
  text: string;
}
