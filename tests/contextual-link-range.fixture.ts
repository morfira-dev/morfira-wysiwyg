import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import './contextual-link.types.js';
import './contextual-toolbar.types.js';

export const linkedRangeHTML = '<p>Before <a href="/range-destination" title="Original"><em>Label</em><strong> text</strong></a> after <a href="/second">Second</a></p>';
export const rangePanel = (page: Page) => page.locator('.link-range-context-host .mw-contextual-link');
export const rangeAction = (page: Page, action: 'open' | 'edit' | 'remove') => rangePanel(page).locator(`[data-mw-link-action="${action}"]`);
export const rangeForm = (page: Page) => rangePanel(page).getByRole('form');
export const rangeHTML = (page: Page) => page.evaluate(() => window.editor.getHTML());

export const initializeLinkedRange = async (page: Page, value = linkedRangeHTML, withTextToolbar = false) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async ({ value, withTextToolbar }) => {
    window.dispose();
    await Promise.all(['core/dist/style.css', 'plugins/dist/ui/forms.css', 'plugins/dist/ui/contextual-link.css', ...(withTextToolbar ? ['plugins/dist/ui/editor.css', 'plugins/dist/ui/contextual.css'] : [])].map((path) => new Promise<void>((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `/packages/${path}`;
      link.onload = () => resolve();
      link.onerror = () => reject(new Error(`Could not load ${path}`));
      document.head.append(link);
    })));
    const mount = document.createElement('div');
    mount.style.cssText = 'margin:80px 16px;max-width:480px';
    const host = document.createElement('div');
    host.className = 'link-range-context-host';
    document.body.prepend(mount, host);
    window.changes = [];
    window.editor = window.createEditor(mount, { value, locale: 'en', onChange: (change) => window.changes.push(change) });
    const textHost = document.createElement('div');
    textHost.className = 'link-range-text-host';
    if (withTextToolbar) {
      document.body.prepend(textHost);
      const path = '/packages/plugins/dist/ui/contextual.js';
      const { createContextualToolbar } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/ui/contextual');
      window.contextualUI = createContextualToolbar(textHost, window.editor);
    }
    const path = '/packages/plugins/dist/ui/contextual-link.js';
    const { createContextualLinkUI } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/ui/contextual-link');
    window.contextualLinkUI = createContextualLinkUI(host, window.editor);
    window.dispose = () => {
      window.contextualLinkUI.destroy();
      if (withTextToolbar) window.contextualUI.destroy();
      window.editor.destroy();
      mount.remove();
      host.remove();
      textHost.remove();
    };
  }, { value, withTextToolbar });
};

export const selectLinkedRange = (page: Page, backward = false) => page.evaluate((backward) => {
  const surface = window.editor.surface;
  surface.focus();
  const start = surface.querySelector('em')!.firstChild!;
  const end = surface.querySelector('strong')!.firstChild!;
  document.getSelection()!.setBaseAndExtent(backward ? end : start, backward ? 3 : 1, backward ? start : end, backward ? 1 : 3);
  window.contextualLinkUI.refresh();
}, backward);

export const linkedRangeSelection = (page: Page) => page.evaluate(() => {
  const selection = document.getSelection()!;
  return {
    logical: window.editor.getSelection(),
    text: selection.toString(),
    anchor: selection.anchorNode?.parentElement?.localName,
    anchorOffset: selection.anchorOffset,
    focus: selection.focusNode?.parentElement?.localName,
    focusOffset: selection.focusOffset,
  };
});
