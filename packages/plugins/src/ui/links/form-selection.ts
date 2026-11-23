import type { Editor, EditorSelectionHandle } from '@morfira-dev/wysiwyg-core';
import type { FormSelection } from '../shared/types.js';

/** A link draft owns an unchanged document target, never a self-adjusting Range. */
export const createLinkFormSelection = (editor: Editor): FormSelection => {
  const surface = editor.surface;
  const document = surface.ownerDocument;
  let saved: EditorSelectionHandle | undefined;
  let blocked = false;
  let disposed = false;
  let restoring = false;
  let apiRevision = 0;

  const clear = () => {
    if (saved) editor.selection.release(saved);
    saved = undefined;
  };
  const capture = () => {
    if (disposed || restoring || (document.activeElement !== surface && !surface.contains(document.activeElement))) return;
    const native = document.getSelection();
    if (native?.rangeCount !== 1) return;
    const range = native.getRangeAt(0);
    if (!surface.contains(range.startContainer) || !surface.contains(range.endContainer)) return;
    const next = editor.selection.capture();
    clear();
    saved = next;
    blocked = !next;
  };
  const peek = (): Range | undefined => {
    if (disposed || !saved) return;
    const range = editor.selection.getRange(saved);
    if (!range) {
      clear();
      blocked = true;
    }
    return range;
  };
  const restore = (acceptFocus?: () => boolean, stageBeforeFocus = false): boolean => {
    if (disposed || restoring) return false;
    if (saved && !peek()) return false;
    if (!saved) {
      if (blocked) return false;
      const revision = apiRevision;
      editor.focus();
      if (disposed || revision !== apiRevision) return false;
      capture();
    }
    const handle = saved;
    if (!handle) return false;
    const revision = apiRevision;
    const current = () => !disposed && saved === handle && revision === apiRevision && editor.selection.isCurrent(handle);
    restoring = true;
    try {
      if (stageBeforeFocus && !editor.selection.restore(handle)) return false;
      if (!current()) return false;
      editor.focus();
      if (!current() || acceptFocus?.() === false) return false;
      return editor.selection.restore(handle) && current();
    }
    finally {
      restoring = false;
    }
  };
  const stopSelection = editor.onSelectionChange(capture);
  const stopChange = editor.subscribe((change) => {
    if (change.source === 'api') {
      apiRevision++;
      clear();
      blocked = true;
    }
    else capture();
  });
  surface.addEventListener('focusin', capture);
  const destroy = () => {
    if (disposed) return;
    disposed = true;
    clear();
    stopSelection();
    stopChange();
    stopDestroy();
    surface.removeEventListener('focusin', capture);
  };
  const stopDestroy = editor.events.on('destroy', destroy);
  capture();
  return { capture, restore, peek, destroy };
};
