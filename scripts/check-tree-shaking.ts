import assert from 'node:assert/strict';
import { build } from 'esbuild';

const features = ['tables', 'images', 'search', 'statistics', 'markdown', 'mentions', 'slash', 'suggestions'];
const cases = [
  { entry: '@morfira-dev/wysiwyg', symbol: 'createEditor', feature: 'core' },
  { entry: '@morfira-dev/wysiwyg', symbol: 'sanitizeHTML', feature: 'sanitizer' },
  ...features.map((feature) => ({ entry: `@morfira-dev/wysiwyg/plugins/${feature}`, symbol: ({ tables: 'tables', images: 'images', search: 'search', statistics: 'statistics', markdown: 'markdownShortcuts', mentions: 'mentions', slash: 'slash', suggestions: 'createSuggestionMenu' } as Record<string, string>)[feature], feature })),
];
for (const { entry, symbol, feature } of cases) {
  const result = await build({
    stdin: { contents: `import { ${symbol} } from '${entry}'; globalThis.__morfiraProbe = ${symbol};`, resolveDir: process.cwd(), sourcefile: 'consumer.ts', loader: 'ts' },
    bundle: true, treeShaking: true, minify: true, write: false, metafile: true,
    tsconfigRaw: { compilerOptions: {} },
    format: 'esm', platform: 'browser', target: 'es2022', logLevel: 'silent',
  });
  const inputs = Object.keys(result.metafile!.inputs);
  assert.ok(!inputs.some((path) => /^packages\/[^/]+\/src\//.test(path)), `${feature}: consumer must use built public artifacts, not source aliases`);
  assert.ok(!inputs.some((path) => /node_modules\/(?:\.pnpm\/)?(?:react|vue|svelte)(?:@|\/)/.test(path)), `${feature}: framework runtime leaked`);
  assert.ok(!inputs.some((path) => path.endsWith('.css')), `${feature}: CSS must remain opt-in`);
  for (const other of features.filter((other) => other !== feature)) {
    assert.ok(!inputs.some((path) => path === `packages/plugins/dist/${other}.js`), `${feature}: loaded unrelated ${other}`);
  }
  if (feature === 'core' || feature === 'sanitizer') assert.ok(!inputs.some((path) => path.startsWith('packages/plugins/')), `${feature}: plugin leaked into core`);
  const text = result.outputFiles[0].text;
  if (feature === 'sanitizer') assert.ok(!text.includes('mw-editor') && !text.includes('mw-toolbar'), 'sanitizer: editor UI retained');
  console.log(`${feature}: selective public import passed (${result.outputFiles[0].contents.length} minified bytes)`);
}
