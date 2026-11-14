import type { Editor } from '@morfira-dev/wysiwyg';

export interface AngularHarness {
  mode: string;
  value(): string;
  changes(): number;
  formChanges(): number;
  touched(): boolean;
  getEditor(): Editor | undefined;
  detachedEditor(): Editor | undefined;
  errors(): string[];
}
