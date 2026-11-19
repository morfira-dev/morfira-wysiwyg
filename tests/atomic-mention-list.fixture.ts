import type { Page } from '@playwright/test';
import './atomic-mentions.types.js';

/** Keep unselected branch references outside this body's endpoint selection. */
export const selectMentionItems = (page: Page, backward = false) => page.evaluate((backward) => {
  const root = window.editor.surface;
  root.focus();
  const first = root.querySelector('[data-mention-id="person-42"]');
  const last = root.querySelector('[data-mention-id="person-7"]');
  if (!first || !last) throw new Error('Missing list endpoint references.');
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
