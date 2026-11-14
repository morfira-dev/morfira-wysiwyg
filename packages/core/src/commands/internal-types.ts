import type { Editor } from '../editor/types.js';
import type { EditorCommands } from './types.js';

export interface CommandRegistryOptions {
  editor: () => Editor;
  isComposing: () => boolean;
  assertActive: () => void;
}

export interface CommandRegistry {
  commands: EditorCommands;
  destroy: () => void;
}

export interface RegisteredCommand {
  validate: (payload: unknown) => unknown;
  execute: (editor: Editor, payload: unknown) => unknown;
  isEnabled?: (editor: Editor) => boolean;
  isActive?: (editor: Editor) => boolean;
  isMixed?: (editor: Editor) => boolean;
}
