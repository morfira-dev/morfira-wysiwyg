import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [vue(), svelte({ preprocess: vitePreprocess() })],
  esbuild: { jsx: 'automatic' },
  build: {
    rollupOptions: {
      input: {
        vue: resolve('vue.html'),
        react: resolve('react.html'),
        svelte: resolve('svelte.html'),
      },
    },
  },
});
