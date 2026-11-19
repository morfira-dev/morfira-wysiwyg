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

export interface MentionClipboardData {
  html: string;
  text: string;
}

export interface MentionClipboardInput {
  html?: string;
  text?: string;
}

export interface MentionClipboardCommands {
  copy(): MentionClipboardData | undefined;
  cut(): MentionClipboardData | undefined;
  paste(input: MentionClipboardInput): boolean;
}
