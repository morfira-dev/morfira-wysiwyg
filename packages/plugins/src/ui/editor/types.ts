import type { Editor } from '@morfira-dev/wysiwyg-core';
import type { editorUIMessages } from './messages.js';

export type EditorUIBuiltin = 'undo' | 'redo' | 'bold' | 'italic' | 'underline' | 'strike' | 'code' | 'subscript' | 'superscript' | 'blockquote' | 'clear' | 'indent' | 'outdent' | 'block' | 'list' | 'align' | 'color' | 'background';
export type EditorUIIcon = EditorUIBuiltin | 'link' | 'image' | 'search' | 'table';
export type EditorUIMessageKey = keyof typeof editorUIMessages.en;
export interface EditorUIAction {
  readonly id: string;
  readonly label: string | ((editor: Editor, range?: Range) => string);
  readonly icon?: EditorUIIcon;
  readonly text?: string;
  readonly run: (editor: Editor) => void;
  readonly enabled?: (editor: Editor, range?: Range) => boolean;
  readonly pressed?: (editor: Editor, range?: Range) => boolean | 'mixed';
  readonly mutates?: boolean;
}
export type EditorUIItem = EditorUIBuiltin | EditorUIAction;
export interface EditorUIOptions {
  readonly groups?: readonly (readonly EditorUIItem[])[];
  readonly density?: 'comfortable' | 'compact';
  readonly overflow?: 'wrap' | 'more';
  readonly groupPriorities?: readonly number[];
  readonly label?: string;
  readonly onError?: (error: unknown) => void;
}
export interface EditorUIController {
  readonly element: HTMLElement;
  refresh(): void;
  destroy(): void;
}
