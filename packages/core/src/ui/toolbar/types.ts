import type { Editor } from '../../editor/types.js';
import type { toolbarMessages } from './messages.js';
export type ToolbarTranslationKey = keyof typeof toolbarMessages.en;
export interface ToolbarAction {
  label: string;
  text: string;
  format?: string;
  value?: unknown;
  run?: (editor: Editor) => void;
  enabled?: (editor: Editor) => boolean;
}
export interface LocalizedToolbarAction extends ToolbarAction {
  translationKey: ToolbarTranslationKey;
}
export interface ToolbarOptions {
  label?: string;
}
