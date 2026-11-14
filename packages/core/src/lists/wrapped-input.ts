import { activeRange, placeCaret } from '../selection/index.js';
import { inspectListItem, normalizeListBodyRange } from './selection-boundaries.js';
import type { WrappedListInputStatus } from './wrapped-input.types.js';

const itemAt = (root: HTMLElement, node: Node): HTMLLIElement | undefined => {
  const element = node instanceof Element ? node : node.parentElement;
  const item = element?.closest('li');
  return item instanceof HTMLLIElement && root.contains(item) ? item : undefined;
};

/** Own only p/heading-shaped items; ordinary inline-list input stays unchanged. */
export const inspectWrappedListInput = (root: HTMLElement, inputType: string): WrappedListInputStatus => {
  if (inputType !== 'insertParagraph' && inputType !== 'insertLineBreak') return 'unowned';
  const range = activeRange(root);
  if (!range) return 'unowned';
  const item = itemAt(root, range.startContainer);
  const last = itemAt(root, range.endContainer);
  const wrappedShape = (candidate: HTMLLIElement | undefined): boolean => Boolean(candidate && [...candidate.children].some((node) => /^(p|h[1-6])$/.test(node.localName)));
  if (!wrappedShape(item) && !wrappedShape(last)) return 'unowned';
  if (!item || item !== last) return 'blocked';
  const boundary = inspectListItem(root, item);
  if (!boundary || boundary.body === item) return 'blocked';
  if (!normalizeListBodyRange(range, boundary, false) || !normalizeListBodyRange(range, boundary, true)) return 'blocked';
  // Preserve the legacy empty-item exit/lift policy, including whitespace-only
  // bodies; branches make this an ordinary split rather than a list exit.
  if (inputType === 'insertParagraph' && !item.textContent?.trim() && !boundary.nestedLists.length) return 'legacy';
  return 'eligible';
};

const ensurePlaceholder = (body: HTMLElement): void => {
  if (!body.textContent && !body.querySelector('br')) body.append(body.ownerDocument.createElement('br'));
};

/** Called only by the guarded cancelable-beforeinput transaction owner. */
export const editWrappedListInput = (root: HTMLElement, inputType: string): boolean => {
  if (inspectWrappedListInput(root, inputType) !== 'eligible') return false;
  const range = activeRange(root)!;
  const boundary = inspectListItem(root, itemAt(root, range.startContainer)!)!;
  const start = normalizeListBodyRange(range, boundary, false)!;
  const end = normalizeListBodyRange(range, boundary, true)!;
  const cut = start.cloneRange();
  cut.setEnd(end.startContainer, end.startOffset);
  // Keep a separate live starting point: deleteContents may collapse a range
  // across inline wrappers to a common ancestor and lose starting affinity.
  const caret = start.cloneRange();
  cut.deleteContents();

  if (inputType === 'insertLineBreak') {
    // A lone empty-body br is a placeholder, not an existing real line.
    // Removing it keeps live caret affinity and semantic inline wrappers.
    const breaks = boundary.body.querySelectorAll('br');
    if (!boundary.body.textContent && breaks.length <= 1) {
      for (const placeholder of breaks) placeholder.remove();
    }
    const suffix = boundary.ownEnd.cloneRange();
    suffix.setStart(caret.startContainer, caret.startOffset);
    const trailing = suffix.cloneContents();
    const lineBreak = root.ownerDocument.createElement('br');
    caret.insertNode(lineBreak);
    if (!trailing.textContent && !trailing.querySelector('br')) lineBreak.after(root.ownerDocument.createElement('br'));
    caret.setStartAfter(lineBreak);
    caret.collapse(true);
    const selection = root.ownerDocument.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(caret);
    return true;
  }

  const tail = root.ownerDocument.createRange();
  tail.selectNodeContents(boundary.body);
  tail.setStart(caret.startContainer, caret.startOffset);
  const nextItem = boundary.item.cloneNode(false) as HTMLLIElement;
  const nextBody = boundary.body.cloneNode(false) as HTMLElement;
  nextBody.append(tail.extractContents());
  nextItem.append(nextBody, ...boundary.nestedLists);
  boundary.item.after(nextItem);
  ensurePlaceholder(boundary.body);
  ensurePlaceholder(nextBody);
  const walker = root.ownerDocument.createTreeWalker(nextBody, NodeFilter.SHOW_TEXT);
  let text = walker.nextNode();
  while (text && !text.textContent) text = walker.nextNode();
  if (!text) placeCaret(nextBody);
  else {
    caret.setStart(text, 0);
    caret.collapse(true);
    const selection = root.ownerDocument.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(caret);
  }
  return true;
};
