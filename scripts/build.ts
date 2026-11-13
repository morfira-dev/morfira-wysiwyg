import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';

for (const name of ['core', 'plugins', 'vue', 'react']) {
  const outdir = `packages/${name}/dist`;
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });
  const result = await build({
    metafile: true,
    entryPoints: [`packages/${name}/src/${name === 'plugins' ? 'tables.ts' : name === 'react' ? 'index.tsx' : 'index.ts'}`],
    outdir, bundle: true, splitting: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true,
    sourcemap: true, jsx: 'automatic',
    external: ['@morfira-dev/*', 'vue', 'react', 'react/jsx-runtime'],

  });
  if (['core', 'plugins'].includes(name) && Object.keys(result.metafile!.inputs).some((input) => input.includes('node_modules/'))) throw new Error(`${name}: bundled runtime dependencies are forbidden.`);
  await cp('LICENSE', `${outdir}/LICENSE`);
  if (name === 'core' || name === 'plugins') {
    const file = name === 'core' ? 'style' : 'tables';
    await build({ entryPoints: [`packages/${name}/src/${file}.css`], outfile: `${outdir}/${file}.css`, bundle: true, minify: true });
  }
}
await build({
  entryPoints: ['index', 'vue', 'react', 'svelte', 'plugins/tables'].map((entry) => `packages/wysiwyg/src/${entry}.ts`),
  outdir: 'packages/wysiwyg/dist', outbase: 'packages/wysiwyg/src', bundle: true, format: 'esm', external: ['@morfira-dev/*'],
});
await mkdir('packages/wysiwyg/dist/plugins', { recursive: true });
await cp('packages/core/dist/style.css', 'packages/wysiwyg/dist/style.css');
await cp('packages/plugins/dist/tables.css', 'packages/wysiwyg/dist/plugins/tables.css');

await cp('LICENSE', 'packages/wysiwyg/dist/LICENSE');
