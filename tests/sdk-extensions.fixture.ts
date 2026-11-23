import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { ExtensionsProbe } from './sdk-extensions.types.js';

export const setupExtensions = async (page: Page, atomic = true) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async ({ atomic }) => {
    window.dispose();
    const path = '/packages/plugins/dist/sdk.js';
    const { nodeExtension, nodeCommands } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/sdk');
    const host = document.createElement('section');
    const views = document.createElement('aside');
    views.dataset.sdkViews = '';
    document.body.append(host, views);
    const editor = window.createEditor(host, { locale: 'en',
      value: '<p>A<span data-mw-node="demo:token" data-id="one">TOKEN</span>B</p>',
      plugins: [nodeExtension({ name: 'demo:token', kind: 'inline', tag: 'span',
        attributes: { 'data-id': { type: 'text', minLength: 1, maxLength: 32, singleLine: true, required: true } },
        content: { type: 'text', minLength: 1, maxLength: 32, singleLine: true } }, { atomic })],
    });
    const probe: ExtensionsProbe = { editor, nodes: nodeCommands(editor, 'demo:token'), created: 0, updated: 0, destroyed: 0 };
    window.sdkExtensions = probe;
    window.editor = editor;
    editor.setSelection(0);
  }, { atomic });
};
