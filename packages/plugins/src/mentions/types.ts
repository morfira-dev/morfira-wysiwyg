import type { MentionOption, SuggestionOptions } from '../suggestions/types.js';
export interface MentionOptions extends SuggestionOptions<MentionOption> {
  persistent?: boolean;
  atomic?: boolean;
}

export interface MentionSchemaOptions {
  readonly atomic?: boolean;
}

export interface MentionReference {
  id: string;
  text: string;
}
