import type { Editor } from '../editor/types.js';

declare const commandPayload: unique symbol;

/** Object identity selects the command; the name is diagnostic only. */
export interface EditorCommand<T> {
  readonly name: string;
  readonly [commandPayload]: (payload: T) => T;
}

export interface EditorCommandDefinition<T> {
  readonly validate: (payload: unknown) => T;
  readonly execute: (editor: Editor, payload: T) => void;
  readonly isEnabled?: (editor: Editor) => boolean;
  readonly isActive?: (editor: Editor) => boolean;
  readonly isMixed?: (editor: Editor) => boolean;
}

export interface EditorCommandState {
  readonly enabled: boolean;
  readonly active: boolean;
  readonly mixed: boolean;
}

export interface EditorCommands {
  register<T>(command: EditorCommand<T>, definition: EditorCommandDefinition<NoInfer<T>>): () => void;
  execute<T>(command: EditorCommand<T>, payload: NoInfer<T>): boolean;
  getState<T>(command: EditorCommand<T>): EditorCommandState;
}
