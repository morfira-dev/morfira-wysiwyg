import { createEditorCommand } from '@morfira-dev/wysiwyg';
import type { Editor, EditorCommand } from '@morfira-dev/wysiwyg';

const insert = createEditorCommand<{ text: string }>('example:insert');
const number = createEditorCommand<number>('example:number');
const noPayload = createEditorCommand<void>('example:no-payload');
const checkCommandTypes = (editor: Editor) => {
  editor.commands.register(insert, {
    validate: (payload) => {
      if (!payload || typeof payload !== 'object' || !('text' in payload) || typeof payload.text !== 'string')
        throw new TypeError('Expected text.');
      return { text: payload.text };
    },
    execute: (instance, payload) => instance.surface.append(payload.text),
  });
  editor.commands.execute(insert, { text: 'hello' });
  editor.commands.execute(number, 42);
  editor.commands.execute(noPayload, undefined);
  editor.commands.getState(insert);
  // @ts-expect-error Command payload must agree with its token.
  editor.commands.execute(insert, { text: 42 });
  // @ts-expect-error Missing command payload fields are rejected.
  editor.commands.execute(insert, {});
  // @ts-expect-error Number command does not accept string values.
  editor.commands.execute(number, '42');
  // @ts-expect-error Payload tokens are invariant, including subtype unions.
  const widened: EditorCommand<string | number> = number;
  // @ts-expect-error The validator must produce the registered token's payload.
  editor.commands.register(number, { validate: () => 'wrong', execute: () => {} });
  void widened;
};
void checkCommandTypes;

// The token owns payload inference; validators must not widen literal unions.
const checkLiteralTypes = (editor: Editor) => {
  const note = createEditorCommand<{ tone: 'note' | 'warning' }>('type:note');
  editor.commands.register(note, {
    validate: () => ({ tone: 'note' as const }),
    execute: (_editor, payload) => { const tone: 'note' | 'warning' = payload.tone; void tone; },
  });
  // @ts-expect-error payload inference cannot widen the token union
  editor.commands.execute(note, { tone: 'other' });
};
void checkLiteralTypes;
