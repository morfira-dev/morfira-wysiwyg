import type { Editor } from '@morfira-dev/wysiwyg-core';
import type { CodeBlockCommands } from './types.js';
export interface CodeBlockInputOptions {
  readonly editor: Editor;
  readonly commands: CodeBlockCommands;
  readonly isComposing: () => boolean;
}
export interface CodeBlockRange {
  readonly range: Range;
  readonly target: HTMLElement;
  readonly start: number;
  readonly end: number;
}
