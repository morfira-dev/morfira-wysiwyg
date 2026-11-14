import type { Editor, EditorChange, EditorPlugin, EditorTranslations } from '@morfira-dev/wysiwyg-core';

export interface Props {
  value?: string;
  readOnly?: boolean;
  placeholder?: string;
  label?: string;
  locale?: string;
  translations?: EditorTranslations;
  plugins?: EditorPlugin[];
  onchange?: (change: EditorChange) => void;
  onready?: (editor: Editor) => void;
}
