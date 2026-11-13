import type { Editor, EditorChange, EditorPlugin } from '@morfira-dev/wysiwyg-core';

export interface Props {
  value?: string;
  readOnly?: boolean;
  placeholder?: string;
  label?: string;
  plugins?: EditorPlugin[];
  onchange?: (change: EditorChange) => void;
  onready?: (editor: Editor) => void;
}
