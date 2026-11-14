/** Insert a prepared inline fragment without nesting its anchors in a starting link. */
export const insertInlineFragment = (left: HTMLElement, caret: Range, fragment: DocumentFragment): void => {
  const parent = caret.startContainer.nodeType === 1 ? caret.startContainer as Element : caret.startContainer.parentElement;
  const anchor = parent?.closest('a');
  if (fragment.querySelector('a') && anchor && left.contains(anchor)) {
    caret.setStartAfter(anchor);
    caret.collapse(true);
  }
  const last = fragment.lastChild;
  if (!last) return;
  caret.insertNode(fragment);
  if (last.nodeType === 3) caret.setStart(last, last.textContent!.length);
  else caret.setStartAfter(last);
  caret.collapse(true);
};
