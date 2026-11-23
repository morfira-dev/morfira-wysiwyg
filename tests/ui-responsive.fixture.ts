import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { ResponsiveUIProbe } from './ui-responsive.types.js';

export const setupResponsiveUI = async (page: Page) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  for (const name of ['editor', 'forms', 'media', 'formula', 'contextual-link'])
    await page.addStyleTag({ url: `/packages/plugins/dist/ui/${name}.css` });
  await page.evaluate(async () => {
    window.dispose();
    document.body.replaceChildren();
    document.body.style.cssText = 'margin:0;padding:8px';
    const root = document.createElement('main');
    root.dataset.responsive = '';
    root.style.cssText = 'min-width:0;font:24px system-ui;--mw-form-font-size:24px;--mw-ui-font-size:24px';
    const hosts = Array.from({ length: 7 }, () => document.createElement('section'));
    root.append(...hosts);
    document.body.append(root);
    const [editorHost, standardHost, linkHost, imageHost, formulaHost, mediaHost, contextualHost] = hosts;
    const mediaPath = '/packages/plugins/dist/media.js';
    const formulaPath = '/packages/plugins/dist/formula.js';
    const standardPath = '/packages/plugins/dist/ui/standard.js';
    const linkPath = '/packages/plugins/dist/ui/links.js';
    const imagePath = '/packages/plugins/dist/ui/images.js';
    const formulaUIPath = '/packages/plugins/dist/ui/formula.js';
    const mediaUIPath = '/packages/plugins/dist/ui/media.js';
    const contextualPath = '/packages/plugins/dist/ui/contextual-link.js';
    const [{ media }, { formulas }, { createStandardEditorUI }, { createLinkForm }, { createImageForm },
      { createFormulaForm }, { createMediaForm }, { createContextualLinkUI }] = await Promise.all([
      import(/* @vite-ignore */ mediaPath) as Promise<typeof import('@morfira-dev/wysiwyg/plugins/media')>,
      import(/* @vite-ignore */ formulaPath) as Promise<typeof import('@morfira-dev/wysiwyg/plugins/formula')>,
      import(/* @vite-ignore */ standardPath) as Promise<typeof import('@morfira-dev/wysiwyg/ui/standard')>,
      import(/* @vite-ignore */ linkPath) as Promise<typeof import('@morfira-dev/wysiwyg/ui/links')>,
      import(/* @vite-ignore */ imagePath) as Promise<typeof import('@morfira-dev/wysiwyg/ui/images')>,
      import(/* @vite-ignore */ formulaUIPath) as Promise<typeof import('@morfira-dev/wysiwyg/ui/formula')>,
      import(/* @vite-ignore */ mediaUIPath) as Promise<typeof import('@morfira-dev/wysiwyg/ui/media')>,
      import(/* @vite-ignore */ contextualPath) as Promise<typeof import('@morfira-dev/wysiwyg/ui/contextual-link')>,
    ]);
    const editor = window.createEditor(editorHost, { locale: 'en', label: 'Responsive editor',
      value: '<p><a href="https://example.org">word</a> word</p>',
      plugins: [window.createTables(), window.createImages(), window.createSearch(), media(), formulas()] });
    window.editor = editor;
    editor.setSelection(1);
    createStandardEditorUI(standardHost, editor, { presentation: 'floating' });
    createLinkForm(linkHost, editor);
    const image = createImageForm(imageHost, editor, { presentation: 'dialog' });
    const formula = createFormulaForm(formulaHost, editor);
    const mediaForm = createMediaForm(mediaHost, editor);
    const contextual = createContextualLinkUI(contextualHost, editor);
    const probe: ResponsiveUIProbe = { editor, formula, image, media: mediaForm, contextual };
    window.responsiveUI = probe;
  });
};
