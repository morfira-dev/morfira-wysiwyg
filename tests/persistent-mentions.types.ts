import type { Editor, SchemaAttributeSpec, SchemaNodeSpec } from '@morfira-dev/wysiwyg';
import type { MentionOption, MentionOptions, MentionReference, SuggestionController } from '@morfira-dev/wysiwyg/plugins/mentions';
import { createMentionSchema, getMentions, mentions } from '@morfira-dev/wysiwyg/plugins/mentions';

export interface PersistentMentionRequest {
  readonly signal: AbortSignal;
  readonly resolve: (items: readonly MentionOption[]) => void;
}
export interface PersistentMentionSettings {
  persistent?: boolean;
  deferred?: boolean;
  tables?: boolean;
}
declare global {
  interface Window {
    persistentMentionModule: typeof import('@morfira-dev/wysiwyg/plugins/mentions');
    persistentMentionAPI: SuggestionController<MentionOption>;
    persistentMentionRequests: PersistentMentionRequest[];
    persistentMentionPeople: MentionOption[];
    persistentMentionCalls: number;
    persistentMentionSecondEditor: Editor;
    persistentMentionSecondAPI: SuggestionController<MentionOption>;
  }
}

const checkPublicTypes = (editor: Editor) => {
  const options: MentionOptions = { persistent: true, provide: () => [{ id: '42', label: 'Anna' }] };
  mentions(options);
  const schema: SchemaNodeSpec = createMentionSchema();
  const references: MentionReference[] = getMentions(editor);
  const textRule: SchemaAttributeSpec = { type: 'text', required: true, minLength: 1, maxLength: 256, singleLine: true };
  // @ts-expect-error persistence is a boolean rather than an atom mode
  mentions({ provide: () => [], persistent: 'atomic' });
  // @ts-expect-error singleLine is a boolean schema option
  const invalidRule: SchemaAttributeSpec = { type: 'text', singleLine: 'yes' };
  void schema;
  void references;
  void textRule;
  void invalidRule;
};
void checkPublicTypes;
