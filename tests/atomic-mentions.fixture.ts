import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { AtomicMentionSettings } from './atomic-mentions.types.js';

export const atomicMentionHTML = '<span data-mw-node="morfira:mention" data-mention-id="person-42">@Anna</span>';
export const secondAtomicMentionHTML = '<span data-mw-node="morfira:mention" data-mention-id="person-7">@Bob</span>';

export const initializeAtomicMention = async (page: Page, value = `<p>A ${atomicMentionHTML} Z</p>`, settings: AtomicMentionSettings = {}) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async ({ value, settings }) => {
    const path = '/packages/wysiwyg/dist/plugins/mentions.js';
    window.atomicMentionModule = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/plugins/mentions');
    window.dispose();
    const host = document.createElement('div');
    host.className = 'atomic-mention-test';
    document.body.append(host);
    const mention = window.atomicMentionModule.mentions({
      persistent: settings.persistent ?? true,
      atomic: settings.atomic ?? true,
      debounceMs: 0,
      provide: () => [{ id: 'person-42', label: 'Anna' }],
    });
    window.changes = [];
    window.editor = window.createEditor(host, {
      value,
      plugins: settings.tables ? [mention, window.createTables()] : [mention],
      onChange: (change) => window.changes.push(change),
    });
    window.dispose = () => window.editor.destroy();
    window.editor.focus();
    window.editor.setSelection(window.editor.surface.textContent?.length ?? 0);
  }, { value, settings });
};
export const atomicContent = (page: Page) => page.locator('.atomic-mention-test .mw-content');
export const atomicSpan = (page: Page) => atomicContent(page).locator('[data-mw-node="morfira:mention"]');
export const atomicHTML = (page: Page) => page.evaluate(() => window.editor.getHTML());
export const atomBoundary = (page: Page, edge: 'before' | 'after', index = 0) => page.evaluate(({ edge, index }) => {
  const atom = window.editor.surface.querySelectorAll('[data-mw-node="morfira:mention"]')[index];
  if (!atom) throw new Error('Missing atomic mention.');
  window.editor.surface.focus();
  const range = document.createRange();
  if (edge === 'before') range.setStartBefore(atom);
  else range.setStartAfter(atom);
  range.collapse(true);
  const native = document.getSelection()!;
  native.removeAllRanges();
  native.addRange(range);
}, { edge, index });

export const readAtomicSelection = (page: Page) => page.evaluate(() => {
  const native = document.getSelection()!;
  const range = native.rangeCount ? native.getRangeAt(0) : undefined;
  const inside = (node: Node | undefined): boolean => Boolean(node && (node.nodeType === 1 ? node as Element : node.parentElement)?.closest('[data-mw-node="morfira:mention"]'));
  return {
    logical: window.editor.getSelection(),
    text: native.toString(),
    inside: inside(range?.startContainer) || inside(range?.endContainer),
    backward: Boolean(range && !range.collapsed && native.anchorNode === range.endContainer && native.anchorOffset === range.endOffset),
  };
});
