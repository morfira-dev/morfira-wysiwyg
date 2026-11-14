import type { Editor, EditorPlugin, EditorTranslations } from '@morfira-dev/wysiwyg-core';

export interface ElementLifecycle {
  connect(): void;
  disconnect(): void;
  attribute(name: string, value: string | null): void;
  getEditor(): Editor | undefined;
}

export interface ElementState {
  value: string;
  readOnly: boolean;
  locale: string;
  translations: EditorTranslations;
  plugins: EditorPlugin[];
  label?: string;
  placeholder?: string;
}
