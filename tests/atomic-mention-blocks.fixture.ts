import type { Page } from '@playwright/test';
import './atomic-mentions.types.js';

/** Actual DOM endpoints make block/atom ownership observable without offset guesses. */
export const selectMentionBlocks = (page: Page, backward = false) => page.evaluate((backward) => {
  const root = window.editor.surface;
  root.focus();
  const atoms = root.querySelectorAll('[data-mw-node="morfira:mention"]');
  const first = atoms[0];
  const last = atoms[atoms.length - 1];
  if (!first || !last || first === last) throw new Error('Expected two block-boundary mentions.');
  const range = document.createRange();
  range.setStartBefore(first);
  range.setEndAfter(last);
  document.getSelection()!.setBaseAndExtent(
    backward ? range.endContainer : range.startContainer,
    backward ? range.endOffset : range.startOffset,
    backward ? range.startContainer : range.endContainer,
    backward ? range.startOffset : range.endOffset,
  );
}, backward);
