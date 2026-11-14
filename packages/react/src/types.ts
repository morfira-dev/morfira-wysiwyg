import type { Editor, EditorChange, EditorPlugin, EditorTranslations } from '@morfira-dev/wysiwyg-core';

export interface MorfiraEditorProps {
  value?: string;
  readOnly?: boolean;
  placeholder?: string;
  label?: string;
  locale?: string;
  translations?: EditorTranslations;
  plugins?: EditorPlugin[];
  className?: string;
  onChange?: (change: EditorChange) => void;
  onReady?: (editor: Editor) => void;
}

export interface MorfiraEditorHandle {
  getEditor(): Editor | undefined;
}
