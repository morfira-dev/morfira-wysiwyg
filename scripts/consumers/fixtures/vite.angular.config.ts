import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { angularLinker } from './angular-linker.js';

export default defineConfig({
  plugins: [angularLinker()],
  optimizeDeps: { exclude: ['@morfira-dev/wysiwyg-angular', '@angular/core', '@angular/common', '@angular/forms', '@angular/platform-browser'] },
  build: { rollupOptions: { input: { angular: resolve('angular.html') } } },
});
