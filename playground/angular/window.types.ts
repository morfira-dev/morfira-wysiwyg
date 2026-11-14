import type { Editor, EditorChange } from '@morfira-dev/wysiwyg';

declare global {
  interface Window {
    editor: Editor;
    changes: EditorChange[];
    dispose: () => void;
  }
}
