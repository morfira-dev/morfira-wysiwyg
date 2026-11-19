import type { Editor, SchemaNodeSpec } from '@morfira-dev/wysiwyg';
import { createMentionSchema, getMentions, mentions } from '@morfira-dev/wysiwyg/plugins/mentions';
import type { MentionOptions, MentionSchemaOptions } from '@morfira-dev/wysiwyg/plugins/mentions';

export interface AtomicMentionSettings {
  atomic?: boolean;
  persistent?: boolean;
  tables?: boolean;
}

declare global {
  interface Window {
    atomicClipboardEvent: (type: string, init: ClipboardEventInit) => ClipboardEvent;
    atomicMentionModule: typeof import('@morfira-dev/wysiwyg/plugins/mentions');
  }
}

const checkAtomicMentionTypes = (editor: Editor) => {
  const options: MentionOptions = { atomic: true, persistent: true, provide: () => [] };
  const schemaOptions: MentionSchemaOptions = { atomic: true };
  const schema: SchemaNodeSpec = createMentionSchema(schemaOptions);
  const content: SchemaNodeSpec = {
    name: 'test:text-content', kind: 'inline', tag: 'span',
    content: { type: 'text', minLength: 1, maxLength: 201, singleLine: true },
  };
  mentions(options);
  getMentions(editor);
  // @ts-expect-error atomic is a boolean configuration flag
  mentions({ persistent: true, atomic: 'true', provide: () => [] });
  // @ts-expect-error schema content declarations support only bounded literal text
  const invalid: SchemaNodeSpec = { name: 'test:invalid', kind: 'inline', tag: 'span', content: { type: 'html' } };
  void [schema, content, invalid];
};

void checkAtomicMentionTypes;
