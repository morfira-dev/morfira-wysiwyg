import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { ChecklistInteractionSettings, ChecklistKeySettings } from './checklist-interaction.types.js';

export const initializeChecklistInteraction = async (page: Page, value = '<ul><li title="Task" data-checklist-checked="false">Task text</li><li title="Other" data-checklist-checked="true">Other task</li></ul>', settings: ChecklistInteractionSettings = {}) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async ({ value, settings }) => {
    const path = '/packages/plugins/dist/checklists.js';
    window.checklistInteractionModule = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/plugins/checklists');
    window.dispose();
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/packages/plugins/dist/checklists.css';
    link.dataset.checklistTestCSS = '';
    const loaded = new Promise<void>((resolve, reject) => { link.onload = () => resolve(); link.onerror = () => reject(new Error('Checklist styles failed to load.')); });
    document.head.append(link);
    await loaded;
    const host = document.createElement('div');
    host.className = 'checklist-interaction-test';
    host.style.cssText = 'max-width:600px;margin:40px';
    document.body.append(host);
    window.changes = [];
    window.editor = window.createEditor(host, {
      value, schema: settings.schema,
      plugins: [window.checklistInteractionModule.checklists(settings.options)],
      onChange: (change) => window.changes.push(change),
    });
    window.editor.surface.style.padding = '32px';
    window.dispose = () => window.editor.destroy();
    window.editor.focus();
    window.editor.setSelection(1);
  }, { value, settings });
};

export const checklistSurface = (page: Page) => page.locator('.checklist-interaction-test .mw-content');
export const checklistHTML = (page: Page) => page.evaluate(() => window.editor.getHTML());

/** Locate the rendered pseudo box, rather than clicking the item text. */
export const checklistMarker = async (page: Page, selector = '[title="Task"]') => {
  const item = checklistSurface(page).locator(selector);
  await item.scrollIntoViewIfNeeded();
  return item.evaluate((node) => {
    const style = getComputedStyle(node, '::before');
    const own = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    const width = Number.parseFloat(style.width);
    const height = Number.parseFloat(style.height);
    const left = Number.parseFloat(style.left);
    const right = Number.parseFloat(style.right);
    const top = Number.parseFloat(style.top);
    if (![width, height, top].every(Number.isFinite) || width <= 0 || height <= 0 || (!Number.isFinite(left) && !Number.isFinite(right)))
      throw new Error('Expected an explicitly sized visible checklist marker.');
    const x = Number.isFinite(left)
      ? rect.left + Number.parseFloat(own.borderLeftWidth) + left + width / 2
      : rect.right - Number.parseFloat(own.borderRightWidth) - right - width / 2;
    return { x, y: rect.top + Number.parseFloat(own.borderTopWidth) + top + height / 2, width, height };
  });
};

export const clickChecklistMarker = async (page: Page, selector = '[title="Task"]') => {
  const point = await checklistMarker(page, selector);
  await page.mouse.click(point.x, point.y);
};

export const checklistCaret = (page: Page, selector = '[title="Task"]', offset = 1) => page.evaluate(({ selector, offset }) => {
  const root = window.editor.surface;
  const element = root.querySelector(selector)!;
  const node = element.firstChild?.nodeType === 3 ? element.firstChild : element;
  root.focus();
  document.getSelection()!.setBaseAndExtent(node, offset, node, offset);
}, { selector, offset });

/** Isolate ownership from the existing ordinary Enter handler. */
export const guardedChecklistKey = (page: Page, options: ChecklistKeySettings = {}) => page.evaluate((options) => {
  const root = window.editor.surface;
  const stop = (event: Event) => event.stopImmediatePropagation();
  root.addEventListener('keydown', stop, true);
  try {
    const event = new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true, ...options });
    root.dispatchEvent(event);
    return event.defaultPrevented;
  }
  finally { root.removeEventListener('keydown', stop, true); }
}, options);
