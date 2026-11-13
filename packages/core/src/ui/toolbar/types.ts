import type { Editor } from '../../editor/types.js';
import type { SelectionBookmark } from '../../selection/index.js';
export interface ToolbarAction {
  label: string;
  text: string;
  format?: string;
  value?: unknown;
  run?: (editor: Editor) => void;
  enabled?: (editor: Editor) => boolean;
}
export interface ToolbarOptions {
  label?: string;
}
