import type { Editor, EditorSelectionHandle, EditorSelectionHandles } from '@morfira-dev/wysiwyg';

const checkSelectionHandles = (editor: Editor) => {
  const selections: EditorSelectionHandles = editor.selection;
  const handle: EditorSelectionHandle | undefined = selections.capture();
  if (!handle) return;
  const current: boolean = selections.isCurrent(handle);
  const restored: boolean = selections.restore(handle);
  const range: Range | undefined = selections.getRange(handle);
  selections.release(handle);
  // @ts-expect-error Public handles cannot be fabricated as structural bookmarks.
  const fabricated: EditorSelectionHandle = {};
  // @ts-expect-error A DOM Range is an observation, not an owned selection handle.
  selections.restore(document.createRange());
  // @ts-expect-error Capture can fail; absence is not a valid restore target.
  selections.restore(undefined);
  void [current, restored, range, fabricated];
};
void checkSelectionHandles;
