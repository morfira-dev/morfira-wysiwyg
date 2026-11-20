import type { Editor } from '@morfira-dev/wysiwyg-core';
import type { FormSelection } from './types.js';

/** Keep native boundaries, including empty blocks, while an external form owns focus. */
export const createFormSelection = (editor: Editor, captureEnabled?: () => boolean): FormSelection => {
  const surface = editor.surface;
  const document = surface.ownerDocument;
  let saved: Range | undefined;
  let backward = false;
  let blocked = false;
  let disposed = false;
  let apiRevision = 0;
  const valid = (range: Range): boolean => surface.contains(range.startContainer) && surface.contains(range.endContainer);
  const capture = () => {
    if (disposed || captureEnabled?.() === false || (document.activeElement !== surface && !surface.contains(document.activeElement))) return;
    const selection = document.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!valid(range)) return;
    saved = range.cloneRange();
    backward = !range.collapsed && selection.anchorNode === range.endContainer && selection.anchorOffset === range.endOffset;
    blocked = false;
  };
  const restore = (acceptFocus?: () => boolean, stageBeforeFocus = false): boolean => {
    if (disposed) return false;
    if (saved && !valid(saved)) saved = undefined;
    if (!saved) {
      if (blocked) return false;
      const revision = apiRevision;
      editor.focus();
      if (disposed || apiRevision !== revision) return false;
      capture();
    }
    if (!saved) return false;
    const range = saved.cloneRange();
    const reverse = backward;
    const revision = apiRevision;
    if (stageBeforeFocus) {
      const native = document.getSelection();
      if (!native) return false;
      native.setBaseAndExtent(range.startContainer, range.startOffset, range.endContainer, range.endOffset);
      if (disposed || apiRevision !== revision || !valid(range)) return false;
    }
    editor.focus();
    if (disposed || apiRevision !== revision || !saved || !valid(range) || acceptFocus?.() === false) return false;
    const selection = document.getSelection();
    if (!selection) return false;
    selection.removeAllRanges();
    selection.addRange(range);
    if (reverse) selection.setBaseAndExtent(range.endContainer, range.endOffset, range.startContainer, range.startOffset);
    capture();
    return true;
  };
  const stopSelection = editor.onSelectionChange(capture);
  const stopChange = editor.subscribe((change) => {
    if (change.source === 'api') {
      apiRevision++;
      saved = undefined;
      blocked = true;
    }
    else capture();
  });
  surface.addEventListener('focusin', capture);
  const destroy = () => {
    if (disposed) return;
    disposed = true;
    saved = undefined;
    stopSelection();
    stopChange();
    stopDestroy();
    surface.removeEventListener('focusin', capture);
  };
  const stopDestroy = editor.events.on('destroy', destroy);
  capture();
  return { capture, restore, peek: () => !disposed && saved && valid(saved) ? saved.cloneRange() : undefined, destroy };
};
