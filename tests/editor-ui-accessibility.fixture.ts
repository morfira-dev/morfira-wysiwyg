import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { EditorUIController } from '@morfira-dev/wysiwyg/ui/editor';

export const setupAccessibleToolbar = async (page: Page, overflow = false) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async (overflow) => {
    window.dispose();
    const path = '/packages/plugins/dist/ui/editor.js';
    const { createEditorUI } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/ui/editor');
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = '/packages/plugins/dist/ui/editor.css';
    document.head.append(stylesheet);
    for (const id of ['first', 'second']) {
      const workspace = document.createElement('section');
      workspace.dataset.accessibleToolbar = id;
      const before = document.createElement('input');
      before.setAttribute('aria-label', `Before ${id}`);
      const tools = document.createElement('div');
      if (overflow) tools.style.width = '50px';
      const after = document.createElement('input');
      after.setAttribute('aria-label', `After ${id}`);
      const host = document.createElement('div');
      workspace.append(before, tools, after, host);
      document.body.append(workspace);
      const editor = window.createEditor(host, { locale: 'en', value: '<p>Text</p>' });
      if (id === 'first') window.editor = editor;
      editor.setSelection(0, 4);
      const ui: EditorUIController = createEditorUI(tools, editor, { overflow: overflow ? 'more' : 'wrap',
        groups: [['block', 'color'], ['bold', 'italic'], [{ id: 'inspect', label: 'Inspect', mutates: false, run: () => {} }]] });
      editor.providePlugin('accessible-ui', ui);
      window.editor.providePlugin(`accessible-${id}`, editor);
    }
  }, overflow);
};
