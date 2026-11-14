import { activeRange, placeCaret } from '../selection/index.js';
import { finishSelectionReplacement } from '../input/index.js';
import { inspectListItem, listBodyAt, listSelectionReplacement, normalizeListBodyRange } from './selection-boundaries.js';
import { replaceListSelection } from './replace-selection.js';
import { canEditFirstBodyBackspace, editFirstBodyBackspace } from './first-body-backspace.js';
import type { WrappedListInputStatus } from './wrapped-input.types.js';

const itemAt = (root: HTMLElement, node: Node): HTMLLIElement | undefined => {
  const element = node instanceof Element ? node : node.parentElement;
  const item = element?.closest('li');
  return item instanceof HTMLLIElement && root.contains(item) ? item : undefined;
};

const atBodyStart = (body: HTMLElement, range: Range): boolean => {
  if (!body.textContent && body.querySelectorAll('br').length <= 1) return true;
  const prefix = body.ownerDocument.createRange();
  prefix.selectNodeContents(body);
  prefix.setEnd(range.startContainer, range.startOffset);
  const content = prefix.cloneContents();
  return !content.textContent && !content.querySelector('br,img');
};

/** Own only p/heading-shaped items; ordinary inline-list input stays unchanged. */
export const inspectWrappedListInput = (root: HTMLElement, inputType: string): WrappedListInputStatus => {
  if (inputType !== 'insertParagraph' && inputType !== 'insertLineBreak' && inputType !== 'deleteContentBackward') return 'unowned';
  const range = activeRange(root);
  if (!range) return 'unowned';
  const item = itemAt(root, range.startContainer);
  const last = itemAt(root, range.endContainer);
  const wrappedShape = (candidate: HTMLLIElement | undefined): boolean => Boolean(candidate && [...candidate.children].some((node) => /^(p|h[1-6])$/.test(node.localName)));
  if (!wrappedShape(item) && !wrappedShape(last)) return 'unowned';
  if (!item || item !== last) return inputType === 'deleteContentBackward' ? 'unowned' : 'blocked';
  const boundary = inspectListItem(root, item);
  if (!boundary || boundary.body === item) {
    if (inputType !== 'deleteContentBackward') return 'blocked';
    const element = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
    const body = element?.closest<HTMLElement>('p,h1,h2,h3,h4,h5,h6');
    if (range.collapsed && range.startContainer === item && range.startOffset === 0) return 'blocked';
    return range.collapsed && body?.parentElement === item && atBodyStart(body, range) ? 'blocked' : 'unowned';
  }
  const body = listBodyAt(range, boundary, false);
  const endBody = range.collapsed ? body : listBodyAt(range, boundary, true);
  const start = normalizeListBodyRange(range, boundary, false);
  const end = range.collapsed ? start : normalizeListBodyRange(range, boundary, true);
  if (!body || !start || !end) return inputType === 'deleteContentBackward' ? 'unowned' : 'blocked';
  if (body !== endBody) {
    if (inputType === 'deleteContentBackward') return 'unowned';
    return listSelectionReplacement(root, range).status === 'eligible' ? 'eligible' : 'blocked';
  }
  if (inputType === 'deleteContentBackward') {
    if (!range.collapsed || !atBodyStart(body, start)) return 'unowned';
    if (boundary.bodies.indexOf(body) > 0) return 'eligible';
    return boundary.bodies.length > 1 ? (canEditFirstBodyBackspace(root, boundary) ? 'eligible' : 'blocked') : 'unowned';
  }
  // Preserve the legacy empty-item exit/lift policy, including whitespace-only
  // bodies; branches make this an ordinary split rather than a list exit.
  if (inputType === 'insertParagraph' && boundary.bodies.length === 1 && !item.textContent?.trim() && !boundary.nestedLists.length) return 'legacy';
  return 'eligible';
};

const ensurePlaceholder = (body: HTMLElement): void => {
  if (!body.textContent && !body.querySelector('br')) body.append(body.ownerDocument.createElement('br'));
};

/** Called only by the guarded cancelable-beforeinput transaction owner. */
export const editWrappedListInput = (root: HTMLElement, inputType: string): boolean => {
  if (inspectWrappedListInput(root, inputType) !== 'eligible') return false;
  let range = activeRange(root)!;
  let boundary = inspectListItem(root, itemAt(root, range.startContainer)!)!;
  if (!range.collapsed && listBodyAt(range, boundary, false) !== listBodyAt(range, boundary, true)) {
    if (!replaceListSelection(root, '')) return false;
    range = activeRange(root)!;
    boundary = inspectListItem(root, itemAt(root, range.startContainer)!)!;
  }
  const body = listBodyAt(range, boundary, false)!;
  const start = normalizeListBodyRange(range, boundary, false)!;
  const end = range.collapsed ? start : normalizeListBodyRange(range, boundary, true)!;
  if (inputType === 'deleteContentBackward') {
    if (body === boundary.body) return editFirstBodyBackspace(root, boundary, start);
    const previous = boundary.bodies[boundary.bodies.indexOf(body) - 1];
    const empty = (node: HTMLElement) => !node.textContent && node.querySelectorAll('br').length <= 1;
    for (const node of [previous, body]) {
      if (empty(node)) for (const placeholder of node.querySelectorAll('br')) placeholder.remove();
    }
    const join = root.ownerDocument.createRange();
    join.selectNodeContents(previous);
    join.collapse(false);
    previous.append(...body.childNodes);
    body.remove();
    finishSelectionReplacement(previous, join);
    return true;
  }
  const cut = start.cloneRange();
  cut.setEnd(end.startContainer, end.startOffset);
  // Keep a separate live starting point: deleteContents may collapse a range
  // across inline wrappers to a common ancestor and lose starting affinity.
  const caret = start.cloneRange();
  cut.deleteContents();

  if (inputType === 'insertLineBreak') {
    // A lone empty-body br is a placeholder, not an existing real line.
    // Removing it keeps live caret affinity and semantic inline wrappers.
    const breaks = body.querySelectorAll('br');
    if (!body.textContent && breaks.length <= 1) {
      for (const placeholder of breaks) placeholder.remove();
    }
    const suffix = root.ownerDocument.createRange();
    suffix.selectNodeContents(body);
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
  tail.selectNodeContents(body);
  tail.setStart(caret.startContainer, caret.startOffset);
  const nextItem = boundary.item.cloneNode(false) as HTMLLIElement;
  const nextBody = body.cloneNode(false) as HTMLElement;
  nextBody.append(tail.extractContents());
  const laterBodies = boundary.bodies.slice(boundary.bodies.indexOf(body) + 1);
  nextItem.append(nextBody, ...laterBodies, ...boundary.nestedLists);
  boundary.item.after(nextItem);
  ensurePlaceholder(body);
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
