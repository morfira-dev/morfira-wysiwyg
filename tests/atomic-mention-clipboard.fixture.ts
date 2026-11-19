import type { Page } from '@playwright/test';
import type { MentionClipboardData } from '@morfira-dev/wysiwyg/plugins/mentions';
import './atomic-mentions.types.js';

export const selectClipboardAtom = (page: Page, index = 0, backward = false) => page.evaluate(({ index, backward }) => {
  window.editor.surface.focus();
  const atom = window.editor.surface.querySelectorAll('[data-mw-node="morfira:mention"]')[index];
  const parent = atom.parentNode!;
  const offset = Array.prototype.indexOf.call(parent.childNodes, atom) as number;
  document.getSelection()!.setBaseAndExtent(parent, offset + Number(backward), parent, offset + Number(!backward));
}, { index, backward });

export const copyClipboardAtom = (page: Page) => page.evaluate(() => window.atomicMentionModule.mentionClipboardCommands(window.editor).copy());

export const dispatchMentionClipboard = (page: Page, kind: 'copy' | 'cut' | 'paste', data?: MentionClipboardData) => page.evaluate(({ kind, data }) => {
  const clipboardData = new DataTransfer();
  if (data) {
    clipboardData.setData('text/html', data.html);
    clipboardData.setData('text/plain', data.text);
  }
  const event = new ClipboardEvent(kind, { bubbles: true, cancelable: true, clipboardData });
  window.editor.surface.dispatchEvent(event);
  return { prevented: event.defaultPrevented, html: clipboardData.getData('text/html'), text: clipboardData.getData('text/plain') };
}, { kind, data });
