import { execFileSync } from 'node:child_process';
import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { build } from 'esbuild';
import { angularEsbuildLinker } from './consumers/fixtures/angular-linker.js';

const run = (config: string) => execFileSync('pnpm', ['exec', 'ngc', '-p', config], { stdio: 'inherit' });
await rm('artifacts/angular/library', { recursive: true, force: true });
await rm('packages/angular/dist', { recursive: true, force: true });
run('packages/angular/tsconfig.json');
await mkdir('packages/angular/dist', { recursive: true });
await build({
  entryPoints: ['artifacts/angular/library/index.js'], outfile: 'packages/angular/dist/index.js',
  bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', minify: true, sourcemap: true,
  external: ['@angular/*', '@morfira-dev/*'],
});
for (const file of await readdir('artifacts/angular/library')) {
  if (file.endsWith('.d.ts')) await cp(`artifacts/angular/library/${file}`, `packages/angular/dist/${file}`);
}
await cp('LICENSE', 'packages/angular/dist/LICENSE');
execFileSync('pnpm', ['exec', 'tsc', '-p', 'packages/wysiwyg'], { stdio: 'inherit' });
run('playground/angular/tsconfig.json');
await build({
  entryPoints: ['playground/angular/dist/server.js'], outfile: 'artifacts/angular/server.mjs',
  bundle: true, format: 'esm', platform: 'node', target: 'node22', plugins: [angularEsbuildLinker()],
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
console.log('Angular partial-compiled package, AOT browser fixture and linked SSR fixture built.');
