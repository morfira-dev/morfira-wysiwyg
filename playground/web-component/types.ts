import type { defineMorfiraEditor } from '@morfira-dev/wysiwyg/web-component';
import type { MorfiraEditorElement } from '@morfira-dev/wysiwyg/web-component';

export interface WebComponentHarness {
  define: typeof defineMorfiraEditor;
  element: MorfiraEditorElement;
  values: string[];
  ready: number;
}
