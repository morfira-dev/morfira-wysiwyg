import type { Editor } from '@morfira-dev/wysiwyg-core';

/** Query actual selected text; cloning a range could clone resource nodes. */
export const selectedLinkAnchors = (surface: HTMLElement, range: Range | undefined): HTMLAnchorElement[] => {
  if (!range || range.collapsed || !surface.contains(range.startContainer) || !surface.contains(range.endContainer)) return [];
  const anchors: HTMLAnchorElement[] = [];
  const common = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer as Element : range.commonAncestorContainer.parentElement;
  if (!common) return anchors;
  const parent = common.closest<HTMLAnchorElement>('a');
  const candidates = [...(parent && surface.contains(parent) ? [parent] : []), ...common.querySelectorAll<HTMLAnchorElement>('a')];
  for (const anchor of candidates) {
    if (!range.intersectsNode(anchor)) continue;
    const overlap = range.cloneRange();
    const contents = anchor.ownerDocument.createRange();
    contents.selectNodeContents(anchor);
    if (overlap.compareBoundaryPoints(Range.START_TO_START, contents) < 0) overlap.setStart(contents.startContainer, contents.startOffset);
    if (overlap.compareBoundaryPoints(Range.END_TO_END, contents) > 0) overlap.setEnd(contents.endContainer, contents.endOffset);
    if (overlap.toString()) anchors.push(anchor);
  }
  return anchors;
};

/** Keep direction in the same history entry as a selected-text link operation. */
export const editSelectedLinks = (editor: Editor, patch: unknown, active: () => boolean): void => {
  const selection = editor.surface.ownerDocument.getSelection();
  const range = selection?.rangeCount === 1 ? selection.getRangeAt(0) : undefined;
  if (!selection || !range || range.collapsed || !active()) return;
  const backward = selection.anchorNode === range.endContainer && selection.anchorOffset === range.endOffset;
  editor.transact(() => {
    if (!active()) throw new Error('The link selection is no longer active.');
    editor.format('link', patch);
    if (!active()) throw new Error('The link selection changed during editing.');
    const result = selection.rangeCount === 1 ? selection.getRangeAt(0).cloneRange() : undefined;
    if (!result || !editor.surface.contains(result.startContainer) || !editor.surface.contains(result.endContainer))
      throw new Error('Link editing lost its selection.');
    if (backward) selection.setBaseAndExtent(result.endContainer, result.endOffset, result.startContainer, result.startOffset);
  });
};
