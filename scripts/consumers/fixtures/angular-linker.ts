import { readFile } from 'node:fs/promises';
import { transformAsync } from '@babel/core';
import linker from '@angular/compiler-cli/linker/babel';
import type { Plugin as VitePlugin } from 'vite';
import type { Plugin as EsbuildPlugin } from 'esbuild';

const linkAngular = async (code: string, filename: string) => transformAsync(code, {
  filename,
  configFile: false,
  babelrc: false,
  sourceMaps: true,
  plugins: [[linker, { jitMode: false }]],
});

/** Angular packages ship partial declarations; applications link them ahead of time. */
export const angularLinker = (): VitePlugin => ({
  name: 'morfira-angular-aot-linker',
  enforce: 'pre',
  transform: async (code, id) => {
    const filename = id.split('?')[0];
    // Minifiers may escape the Unicode prefix of Angular's declaration helpers.
    if (!/\.m?js$/.test(filename) || !code.includes('ngDeclare')) return;
    const result = await linkAngular(code, filename);
    return result?.code ? { code: result.code, map: result.map } : undefined;
  },
});

export const angularEsbuildLinker = (): EsbuildPlugin => ({
  name: 'morfira-angular-aot-linker',
  setup: (builder) => {
    builder.onLoad({ filter: /\.m?js$/ }, async ({ path }) => {
      const code = await readFile(path, 'utf8');
      if (!code.includes('ngDeclare')) return;
      const result = await linkAngular(code, path);
      return result?.code ? { contents: result.code, loader: 'js' } : undefined;
    });
  },
});
