import type { Page } from '@playwright/test';
import { setupExtensions } from './sdk-extensions.fixture.js';
import './sdk-inline-views.types.js';

export const setupInlineViews = async (page: Page): Promise<void> => {
  await setupExtensions(page);
  await page.evaluate(async () => {
    const path = '/packages/plugins/dist/sdk.js';
    const { createInlineNodeViews } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/sdk');
    const { editor } = window.sdkExtensions;
    editor.element.style.width = '360px';
    const style = document.createElement('style');
    style.textContent = '.mw-editor [data-mw-node="demo:token"]{display:inline-block;min-width:120px;height:32px;vertical-align:middle}';
    document.head.append(style);
    window.inlineViewProbe = { errors: 0, controller: createInlineNodeViews(editor, {
      name: 'demo:token',
      onError: () => { window.inlineViewProbe.errors++; },
      create: (context) => {
        window.sdkExtensions.created++;
        const element = document.createElement('span');
        element.className = 'inline-painted-token';
        Object.assign(element.style, { display: 'block', width: '100%', height: '100%', background: '#eef2ff', color: '#24348a' });
        const update = (next: typeof context) => { element.textContent = `Visual ${next.text} / ${next.attributes['data-id']}`; window.sdkExtensions.updated++; };
        update(context);
        return { element, update, destroy: () => { window.sdkExtensions.destroyed++; } };
      },
    }) };
  });
};
