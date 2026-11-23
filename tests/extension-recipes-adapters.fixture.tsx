import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createApp, h } from 'vue';
import type { Component } from 'vue';
import type { Editor } from '@morfira-dev/wysiwyg';
import { RecipeReact } from '../apps/docs/.vitepress/theme/recipes/wrappers/RecipeReact.js';
import './extension-recipes.types.js';

export const mountRecipeAdapter = async (kind: 'vue' | 'react'): Promise<void> => {
  window.dispose();
  const host = document.createElement('section');
  host.dataset.recipeAdapter = kind;
  document.body.append(host);
  let resolveReady = (): void => {};
  const ready = new Promise<void>((resolve) => { resolveReady = resolve; });
  const onReady = (editor: Editor): void => {
    window.recipeAdapterProbe.editor = editor;
    window.recipeAdapterProbe.instances.push(editor);
    window.editor = editor;
    resolveReady();
  };
  window.recipeAdapterProbe = { instances: [], unmount: () => {} };
  if (kind === 'react') {
    const root = createRoot(host);
    window.recipeAdapterProbe.unmount = () => { root.unmount(); host.remove(); };
    root.render(<StrictMode><RecipeReact onReady={onReady} /></StrictMode>);
  }
  else {
    const path = '/apps/docs/.vitepress/theme/recipes/wrappers/RecipeVue.vue';
    const { default: RecipeVue } = await import(/* @vite-ignore */ path) as { default: Component };
    const app = createApp({ render: () => h(RecipeVue, { onReady, locale: 'en' }) });
    window.recipeAdapterProbe.unmount = () => { app.unmount(); host.remove(); };
    app.mount(host);
  }
  await ready;
};
