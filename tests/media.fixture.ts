import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type {} from './media.types.js';

export const setupMedia = async (page: Page, value = '<p>Before</p>') => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async (value) => {
    window.dispose();
    const pluginPath = '/packages/plugins/dist/media.js';
    const uiPath = '/packages/plugins/dist/ui/media.js';
    const { media, mediaCommands } = await import(/* @vite-ignore */ pluginPath) as typeof import('@morfira-dev/wysiwyg/plugins/media');
    const { createMediaView, createMediaForm } = await import(/* @vite-ignore */ uiPath) as typeof import('@morfira-dev/wysiwyg/ui/media');
    const host = document.createElement('section');
    const external = document.createElement('aside');
    document.body.append(host, external);
    const editor = window.createEditor(host, { value, locale: 'en', plugins: [media()] });
    const view = createMediaView(external, editor);
    const form = createMediaForm(external, editor);
    window.editor = editor;
    window.mediaProbe = { editor, commands: mediaCommands(editor), view, form };
    editor.setSelection(0);
  }, value);
};
