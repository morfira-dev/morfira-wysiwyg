import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { FormulaProbe } from './formula.types.js';

export const setupFormula = async (page: Page) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async () => {
    window.dispose();
    const formulaPath = '/packages/plugins/dist/formula.js';
    const uiPath = '/packages/plugins/dist/ui/formula.js';
    const { formulas, formulaCommands } = await import(/* @vite-ignore */ formulaPath) as typeof import('@morfira-dev/wysiwyg/plugins/formula');
    const { createFormulaForm, createFormulaView } = await import(/* @vite-ignore */ uiPath) as typeof import('@morfira-dev/wysiwyg/ui/formula');
    const host = document.createElement('section');
    const uiHost = document.createElement('aside');
    const viewHost = document.createElement('aside');
    viewHost.dataset.formulaViews = '';
    document.body.append(host, uiHost, viewHost);
    const editor = window.createEditor(host, { locale: 'en', value: '<p>AB</p>', plugins: [formulas()] });
    const probe: FormulaProbe = { editor, host: uiHost, viewHost, commands: formulaCommands(editor),
      form: createFormulaForm(uiHost, editor), view: createFormulaView(viewHost, editor) };
    window.formulaProbe = probe;
    window.editor = editor;
    editor.setSelection(1);
  });
};
