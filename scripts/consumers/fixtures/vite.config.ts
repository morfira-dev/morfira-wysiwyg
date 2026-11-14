import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';
import { angularLinker } from './angular-linker.js';

export default defineConfig({
  plugins: [angularLinker(), vue(), svelte({ preprocess: vitePreprocess() })],
  optimizeDeps: { exclude: ['@morfira-dev/wysiwyg-angular', '@angular/core', '@angular/common', '@angular/forms', '@angular/platform-browser'] },
  esbuild: { jsx: 'automatic' },
  build: {
    rollupOptions: {
      input: {
        vue: resolve('vue.html'),
        react: resolve('react.html'),
        svelte: resolve('svelte.html'),
        angular: resolve('angular.html'),
        'web-component': resolve('web-component.html'),
      },
    },
  },
});
