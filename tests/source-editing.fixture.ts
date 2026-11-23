import type { Page } from '@playwright/test';
import type { SourceEditingProbe } from './source-editing.types.js';

export const setupSourceEditing = async (page: Page): Promise<void> => {
  await page.goto('/');
  await page.getByRole('textbox').waitFor();
  await page.evaluate(async () => {
    window.dispose();
    const path = '/packages/plugins/dist/ui/source.js';
    const { createSourceEditor } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/ui/source');
    const host = document.createElement('div');
    const uiHost = document.createElement('aside');
    document.body.append(host, uiHost);
    const editor = window.createEditor(host, { value: '<p><strong>Original</strong> text</p>', locale: 'en' });
    const errors: unknown[] = [];
    const source = createSourceEditor(uiHost, editor, { onError: (error) => errors.push(error) });
    const probe: SourceEditingProbe = { editor, source, uiHost, errors };
    window.sourceEditingProbe = probe;
    window.editor = editor;
    editor.focus();
    const text = editor.surface.querySelector('strong')!.firstChild!;
    document.getSelection()!.setBaseAndExtent(text, 5, text, 1);
  });
};
