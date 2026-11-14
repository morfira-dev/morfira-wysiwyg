import type { Editor } from '@morfira-dev/wysiwyg-core';

export interface MorfiraEditorHandle {
  getEditor(): Editor | undefined;
}

export type AngularValueChange = (value: string) => void;
export type AngularTouched = () => void;
