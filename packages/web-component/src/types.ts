import type { Editor, EditorPlugin, EditorTranslations } from '@morfira-dev/wysiwyg-core';

export interface MorfiraEditorElement extends HTMLElement {
  value: string;
  readOnly: boolean;
  locale: string;
  translations: EditorTranslations;
  plugins: EditorPlugin[];
  label: string | undefined;
  placeholder: string | undefined;
  getEditor(): Editor | undefined;
}

export interface MorfiraEditorElementConstructor extends CustomElementConstructor {
  new (): MorfiraEditorElement;
}
