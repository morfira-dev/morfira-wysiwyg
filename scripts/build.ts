import { build } from 'esbuild';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';

for (const name of ['core', 'plugins', 'vue', 'react', 'web-component']) {
  const outdir = `packages/${name}/dist`;
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });
  const result = await build({
    metafile: true,
    entryPoints: name === 'plugins' ? Object.fromEntries(['tables', 'table-properties', 'images', 'image-input', 'search', 'statistics', 'markdown', 'codecs/markdown', 'autolink', 'fonts', 'list-properties', 'text-direction', 'horizontal-rule', 'checklists', 'mentions', 'slash', 'suggestions', 'ui/links', 'ui/images', 'ui/search', 'ui/search-highlights', 'ui/table-picker', 'ui/table-properties', 'ui/contextual', 'ui/contextual-link', 'ui/contextual-image', 'ui/image-resize', 'ui/contextual-table', 'presets/minimal', 'presets/standard', 'presets/extended', 'ui/editor', 'ui/standard', 'ui/extended'].map((entry) => [entry, `packages/plugins/src/${entry}/index.ts`])) : name === 'core' ? {
      index: 'packages/core/src/index.ts',
      'private-editor-messages': 'packages/core/src/localization/messages.ts',
      'private-toolbar-messages': 'packages/core/src/ui/toolbar/messages.ts',
    } : [`packages/${name}/src/${name === 'react' ? 'index.tsx' : 'index.ts'}`],
    outdir, bundle: true, splitting: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true,
    sourcemap: true, jsx: 'automatic',
    external: ['@morfira-dev/*', 'vue', 'react', 'react/jsx-runtime'],

  });
  if (name === 'plugins') {
    await build({ entryPoints: ['packages/plugins/src/ui/table-picker/style.css'], outfile: `${outdir}/ui/table-picker.css`, bundle: true, minify: true });
    const outputs = result.metafile!.outputs;
    const closure = (path: string): string[] => [...new Set([path, ...outputs[path].imports.filter((entry) => !entry.external).flatMap((entry) => closure(entry.path))])];
    const entries = Object.fromEntries(Object.entries(outputs).filter(([, output]) => output.entryPoint?.endsWith('.ts')).map(([path]) => [path.slice(outdir.length + 1).replace(/\.js$/, ''), closure(path).map((file) => file.slice(outdir.length + 1))]));
    await writeFile(`${outdir}/entries.json`, JSON.stringify(entries));
    const bundledInputs = Object.fromEntries(Object.entries(outputs).filter(([path]) => path.endsWith('.js')).map(([path, output]) => [path.slice(outdir.length + 1), Object.entries(output.inputs).filter(([, input]) => input.bytesInOutput > 0).map(([name]) => name)]));
    await writeFile(`${outdir}/bundled-inputs.json`, JSON.stringify(bundledInputs));
  }
  if (['core', 'plugins'].includes(name) && Object.keys(result.metafile!.inputs).some((input) => input.includes('node_modules/'))) throw new Error(`${name}: bundled runtime dependencies are forbidden.`);
  await cp('LICENSE', `${outdir}/LICENSE`);
  if (name === 'core' || name === 'plugins') {
    for (const file of name === 'core' ? ['style'] : ['tables', 'suggestions', 'checklists']) await build({ entryPoints: [name === 'core' ? `packages/core/src/${file}.css` : `packages/plugins/src/${file}/style.css`], outfile: `${outdir}/${file}.css`, bundle: true, minify: true });
  }
  if (name === 'plugins') {
    await build({ entryPoints: ['packages/plugins/src/ui/search-highlights/style.css'], outfile: `${outdir}/ui/search-highlights.css`, bundle: true, minify: true });
    await build({ entryPoints: ['packages/plugins/src/ui/contextual-table/style.css'], outfile: `${outdir}/ui/contextual-table.css`, bundle: true, minify: true });
    await build({ entryPoints: ['packages/plugins/src/ui/contextual-image/style.css'], outfile: `${outdir}/ui/contextual-image.css`, bundle: true, minify: true });
    await build({ entryPoints: ['packages/plugins/src/ui/image-resize/style.css'], outfile: `${outdir}/ui/image-resize.css`, bundle: true, minify: true });
    await build({ entryPoints: ['packages/plugins/src/ui/contextual-link/style.css'], outfile: `${outdir}/ui/contextual-link.css`, bundle: true, minify: true });
    await build({ entryPoints: ['packages/plugins/src/ui/contextual/style.css'], outfile: `${outdir}/ui/contextual.css`, bundle: true, minify: true });
    await build({ entryPoints: ['packages/plugins/src/ui/style.css'], outfile: `${outdir}/ui/forms.css`, bundle: true, minify: true });
    await build({ stdin: { contents: '@import \"./packages/plugins/src/ui/editor/style.css\"; @import \"./packages/plugins/src/ui/standard/style.css\";', resolveDir: process.cwd(), loader: 'css' }, outfile: `${outdir}/ui/editor.css`, bundle: true, minify: true });
  }
}
await build({
  entryPoints: ['index', 'vue', 'react', 'svelte', 'angular', 'web-component', 'plugins/tables', 'plugins/table-properties', 'plugins/images', 'plugins/image-input', 'plugins/search', 'plugins/statistics', 'plugins/markdown', 'codecs/markdown', 'plugins/autolink', 'plugins/fonts', 'plugins/list-properties', 'plugins/text-direction', 'plugins/horizontal-rule', 'plugins/checklists', 'plugins/mentions', 'plugins/slash', 'plugins/suggestions', 'ui/links', 'ui/images', 'ui/search', 'ui/search-highlights', 'ui/table-picker', 'ui/table-properties', 'ui/contextual', 'ui/contextual-link', 'ui/contextual-image', 'ui/image-resize', 'ui/contextual-table', 'presets/minimal', 'presets/standard', 'presets/extended', 'ui/editor', 'ui/standard', 'ui/extended'].map((entry) => `packages/wysiwyg/src/${entry}.ts`),
  outdir: 'packages/wysiwyg/dist', outbase: 'packages/wysiwyg/src', bundle: true, format: 'esm', external: ['@morfira-dev/*'],
});
await mkdir('packages/wysiwyg/dist/plugins', { recursive: true });
await cp('packages/core/dist/style.css', 'packages/wysiwyg/dist/style.css');
await cp('packages/plugins/dist/tables.css', 'packages/wysiwyg/dist/plugins/tables.css');
await cp('packages/plugins/dist/suggestions.css', 'packages/wysiwyg/dist/plugins/suggestions.css');
await cp('packages/plugins/dist/checklists.css', 'packages/wysiwyg/dist/plugins/checklists.css');
await mkdir('packages/wysiwyg/dist/ui', { recursive: true });
await cp('packages/plugins/dist/ui/forms.css', 'packages/wysiwyg/dist/ui/forms.css');
await cp('packages/plugins/dist/ui/editor.css', 'packages/wysiwyg/dist/ui/editor.css');
await cp('packages/plugins/dist/ui/table-picker.css', 'packages/wysiwyg/dist/ui/table-picker.css');
await cp('packages/plugins/dist/ui/contextual.css', 'packages/wysiwyg/dist/ui/contextual.css');

await cp('LICENSE', 'packages/wysiwyg/dist/LICENSE');

await cp('packages/plugins/dist/ui/contextual-link.css', 'packages/wysiwyg/dist/ui/contextual-link.css');
await cp('packages/plugins/dist/ui/contextual-image.css', 'packages/wysiwyg/dist/ui/contextual-image.css');
await cp('packages/plugins/dist/ui/image-resize.css', 'packages/wysiwyg/dist/ui/image-resize.css');
await cp('packages/plugins/dist/ui/contextual-table.css', 'packages/wysiwyg/dist/ui/contextual-table.css');

await cp('packages/plugins/dist/ui/search-highlights.css', 'packages/wysiwyg/dist/ui/search-highlights.css');
