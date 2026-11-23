import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { CodeBlockProbe } from './code-blocks.types.js';
export const setupCodeBlocks = async (page: Page) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async () => {
    window.dispose();
    const behaviorPath = '/packages/plugins/dist/code-blocks.js';
    const uiPath = '/packages/plugins/dist/ui/code-blocks.js';
    const { codeBlocks, codeBlockCommands } = await import(/* @vite-ignore */ behaviorPath) as typeof import('@morfira-dev/wysiwyg/plugins/code-blocks');
    const { createCodeBlockForm, createCodeBlockView } = await import(/* @vite-ignore */ uiPath) as typeof import('@morfira-dev/wysiwyg/ui/code-blocks');
    const host = document.createElement('section');
    const uiHost = document.createElement('aside');
    const viewHost = document.createElement('aside');
    document.body.append(host, uiHost, viewHost);
    const editor = window.createEditor(host, { locale: 'en', value: '<p>AB</p>', plugins: [codeBlocks()] });
    const probe: CodeBlockProbe = { editor, uiHost, viewHost, commands: codeBlockCommands(editor),
      form: createCodeBlockForm(uiHost, editor), view: createCodeBlockView(viewHost, editor) };
    window.codeBlockProbe = probe;
    window.editor = editor;
    editor.setSelection(1);
  });
};
