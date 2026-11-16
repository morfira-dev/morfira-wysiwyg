import { ensureReplacementPlaceholder, finishSelectionReplacement } from './replace-selection.js';
import { insertInlineFragment } from './inline-fragment.js';
import type { CutSelectionReplacement } from './internal-types.js';

const stripPlaceholder = (body: HTMLElement): void => {
  if (!body.textContent && !body.querySelector('img') && body.querySelectorAll('br').length <= 1) {
    for (const placeholder of body.querySelectorAll('br')) placeholder.remove();
  }
};

export const ensureBodyPlaceholder = (body: HTMLElement): Range => {
  const caret = body.ownerDocument.createRange();
  caret.selectNodeContents(body);
  caret.collapse(true);
  ensureReplacementPlaceholder(body, caret);
  return caret;
};

/** Compose already validated body roots; source eligibility and branch placement stay caller-owned. */
export const insertReplacementBlocks = ({ left, tail, caret }: CutSelectionReplacement, blocks: HTMLElement[]): void => {
  const first = blocks[0];
  const last = blocks[blocks.length - 1];
  stripPlaceholder(first);
  const prefix = left.ownerDocument.createDocumentFragment();
  prefix.append(...first.childNodes);
  first.remove();
  insertInlineFragment(left, caret, prefix);
  left.after(...blocks.slice(1));
  ensureReplacementPlaceholder(left, caret);
  left.normalize();
  for (const middle of blocks.slice(1, -1)) ensureBodyPlaceholder(middle);
  stripPlaceholder(last);
  const end = left.ownerDocument.createRange();
  end.selectNodeContents(last);
  end.collapse(false);
  last.append(tail);
  finishSelectionReplacement(last, end);
};
