import type { Editor } from '@morfira-dev/wysiwyg-core';

/** Resolve an ordinary single-anchor text interval without cloning its contents. */
export const linkRangeAnchor = (surface: HTMLElement, range: Range): HTMLAnchorElement | undefined => {
  if (!surface.contains(range.startContainer) || !surface.contains(range.endContainer)) return;
  const start = range.startContainer.nodeType === 1 ? range.startContainer as Element : range.startContainer.parentElement;
  const anchor = start?.closest<HTMLAnchorElement>('a');
  if (!anchor || !surface.contains(anchor) || !anchor.contains(range.endContainer) || !anchor.textContent) return;
  for (const endpoint of [range.startContainer, range.endContainer]) {
    let element = endpoint.nodeType === 1 ? endpoint as Element : endpoint.parentElement;
    for (; element && element !== surface; element = element.parentElement)
      if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml' || element.hasAttribute('data-mw-node')) return;
  }
  if (!range.collapsed) {
    if (!range.toString()) return;
    for (const child of anchor.querySelectorAll('*')) {
      if (child.namespaceURI !== 'http://www.w3.org/1999/xhtml' || child.hasAttribute('data-mw-node')
        || child.hasAttribute('hidden') || child.getAttribute('contenteditable') === 'false'
        || child.localName === 'a' || (child.localName === 'img' && range.intersectsNode(child))) return;
    }
  }
  return anchor;
};

/** Apply the existing caret command while retaining an expanded native interval. */
export const editAnchorLink = (editor: Editor, range: Range, patch: unknown, accepts: () => boolean, active: () => boolean): Range | undefined => {
  const root = editor.surface;
  const document = root.ownerDocument;
  const native = document.getSelection();
  const target = linkRangeAnchor(root, range);
  const original = editor.getSelection();
  if (!native || !target || !original || !accepts()) return;
  const collapsed = range.collapsed;
  const backward = !collapsed && native.anchorNode === range.endContainer && native.anchorOffset === range.endOffset;
  let result: Range | undefined;
  editor.transact(() => {
    if (!accepts()) throw new Error('The link selection changed before editing.');
    const start = document.createComment('mw-link-start');
    const end = document.createComment('mw-link-end');
    const tail = range.cloneRange();
    tail.collapse(false);
    tail.insertNode(end);
    const head = range.cloneRange();
    head.collapse(true);
    head.insertNode(start);
    try {
      const caret = document.createRange();
      caret.setStartAfter(start);
      caret.collapse(true);
      native.removeAllRanges();
      native.addRange(caret);
      editor.format('link', patch);
      const after = editor.getSelection();
      if (!active() || editor.isReadOnly() || !after || after.index !== original.index || after.length
        || !root.contains(start) || !root.contains(end)
        || (patch !== false && linkRangeAnchor(root, native.getRangeAt(0)) !== target)
        || (patch === false && root.contains(target))) throw new Error('The link target changed during editing.');
      const restored = document.createRange();
      restored.setStartAfter(start);
      restored.setEndBefore(end);
      if (collapsed) restored.collapse(true);
      native.removeAllRanges();
      native.addRange(restored);
    }
    finally {
      start.remove();
      end.remove();
      root.normalize();
    }
    // Live boundaries follow normalization without another focus callback.
    const restored = native.getRangeAt(0);
    if (backward) native.setBaseAndExtent(restored.endContainer, restored.endOffset, restored.startContainer, restored.startOffset);
    result = restored.cloneRange();
  });
  return result;
};
