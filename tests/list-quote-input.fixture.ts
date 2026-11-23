import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { SchemaNodeSpec } from '@morfira-dev/wysiwyg';

export const setupListQuoteInput = async (page: Page, value: string, schema: SchemaNodeSpec[] = []) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  return page.evaluate(({ value, schema }) => {
    window.dispose();
    const host = document.createElement('section');
    document.body.append(host);
    window.changes = [];
    window.editor = window.createEditor(host, { value, schema, onChange: (change) => window.changes.push(change) });
    window.dispose = () => { window.editor.destroy(); host.remove(); };
    return window.editor.getHTML();
  }, { value, schema });
};

export const listQuoteCaret = (page: Page, selector: string, end = false) => page.evaluate(({ selector, end }) => {
  const body = window.editor.surface.querySelector(selector)!;
  const range = document.createRange();
  range.selectNodeContents(body);
  range.collapse(!end);
  window.editor.focus();
  const native = document.getSelection()!;
  native.removeAllRanges();
  native.addRange(range);
}, { selector, end });

export const listQuoteBeforeInput = (page: Page, forward: boolean) => page.evaluate((forward) => {
  const event = new InputEvent('beforeinput', { inputType: forward ? 'deleteContentForward' : 'deleteContentBackward', bubbles: true, cancelable: true });
  window.editor.surface.dispatchEvent(event);
  return event.defaultPrevented;
}, forward);
