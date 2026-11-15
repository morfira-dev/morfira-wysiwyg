import { createDefaultEditorUIGroups, createEditorUI } from '@morfira-dev/wysiwyg/ui/editor';
import type { Editor } from '@morfira-dev/wysiwyg';
import type { EditorUIAction, EditorUIOptions } from '@morfira-dev/wysiwyg/ui/editor';

const custom: EditorUIAction = { id: 'app:example', label: (editor) => editor.getLocale().locale, run: (editor) => editor.format('bold', true), pressed: () => 'mixed' };
const options: EditorUIOptions = { groups: [...createDefaultEditorUIGroups(), [custom]], density: 'compact', overflow: 'more' };
const check = (host: HTMLElement, editor: Editor) => {
  const ui = createEditorUI(host, editor, options);
  ui.refresh();
  ui.destroy();
  createEditorUI(host, editor, { groups: [[custom], ['bold']], groupPriorities: Object.freeze([10, 0]), overflow: 'wrap' });
  // @ts-expect-error unknown built-in controls are not accepted
  createEditorUI(host, editor, { groups: [['unknown']] });
  // @ts-expect-error density is explicit
  createEditorUI(host, editor, { density: 'tiny' });
  // @ts-expect-error overflow modes are explicit
  createEditorUI(host, editor, { overflow: 'menu' });
};
void check;
