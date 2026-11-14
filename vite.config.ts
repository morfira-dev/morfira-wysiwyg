import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { angularLinker } from './scripts/consumers/fixtures/angular-linker.js';

export default defineConfig({
  plugins: [angularLinker(), vue(), svelte()],
  optimizeDeps: { exclude: ['@morfira-dev/wysiwyg-angular', '@angular/core', '@angular/common', '@angular/forms', '@angular/platform-browser'] },
  build: { outDir: 'dist-demo' },
});
