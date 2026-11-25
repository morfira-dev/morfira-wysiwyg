import type { Editor, EditorDocument, DocumentNode } from '@morfira-dev/wysiwyg';
import type { EditorFieldSemantics, EditorFieldSemanticsOptions } from './types.js';

/** Application-owned binding: adapters still own editor lifetime. */
export const connectEditorField = (editor: Editor, options: EditorFieldSemanticsOptions): EditorFieldSemantics => {
  const surface = editor.surface;
  const original = new Map(['aria-labelledby', 'aria-describedby', 'aria-invalid'].map((name) => [name, surface.getAttribute(name)]));
  let disposed = false;
  const owned = new Map<string, string>();
  const setAttribute = (name: string, value: string) => {
    surface.setAttribute(name, value);
    owned.set(name, value);
  };
  setAttribute('aria-labelledby', options.labelId);
  const setInvalid = (invalid: boolean) => {
    if (disposed) return;
    setAttribute('aria-describedby', [options.descriptionId, invalid ? options.errorId : ''].filter(Boolean).join(' '));
    setAttribute('aria-invalid', String(invalid));
  };
  setInvalid(false);
  return {
    setInvalid,
    destroy: () => {
      if (disposed) return;
      disposed = true;
      for (const [name, value] of original) {
        if (surface.getAttribute(name) !== owned.get(name)) continue;
        if (value === null) surface.removeAttribute(name);
        else surface.setAttribute(name, value);
      }
    },
  };
};

export const editorFieldPlainText = (document: EditorDocument): string => {
  const read = (node: DocumentNode): string => node.type === 'text'
    ? node.text
    : node.children.map(read).join('');
  return document.children.map(read).join('\n');
};
