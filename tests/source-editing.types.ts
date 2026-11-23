import type { Editor } from '@morfira-dev/wysiwyg';
import type { SourceEditorController } from '@morfira-dev/wysiwyg/ui/source';

export interface SourceEditingProbe {
  editor: Editor;
  source: SourceEditorController;
  uiHost: HTMLElement;
  errors: unknown[];
}

declare global {
  interface Window {
    sourceEditingProbe: SourceEditingProbe;
  }
}
