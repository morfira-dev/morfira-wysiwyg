import assert from 'node:assert/strict';
import { build } from 'esbuild';

const features = ['tables', 'images', 'search', 'statistics', 'markdown', 'autolink', 'mentions', 'slash', 'suggestions'];
const forms = ['ui/links', 'ui/images', 'ui/search'];
const cases = [
  { entry: '@morfira-dev/wysiwyg', symbol: 'createEditor', feature: 'core' },
  { entry: '@morfira-dev/wysiwyg', symbol: 'sanitizeHTML', feature: 'sanitizer' },
  { entry: '@morfira-dev/wysiwyg', symbol: 'localize', feature: 'localization' },
  { entry: '@morfira-dev/wysiwyg', symbol: 'createDocumentSchema', feature: 'schema' },
  { entry: '@morfira-dev/wysiwyg', symbol: 'createEditorCommand', feature: 'command-token' },
  { entry: '@morfira-dev/wysiwyg/web-component', symbol: 'defineMorfiraEditor', feature: 'web-component' },
  ...features.map((feature) => ({ entry: `@morfira-dev/wysiwyg/plugins/${feature}`, symbol: ({ tables: 'tables', images: 'images', search: 'search', statistics: 'statistics', markdown: 'markdownShortcuts', autolink: 'autolink', mentions: 'mentions', slash: 'slash', suggestions: 'createSuggestionMenu' } as Record<string, string>)[feature], feature })),
  ...forms.map((feature) => ({ entry: `@morfira-dev/wysiwyg/${feature}`, symbol: ({ 'ui/links': 'createLinkForm', 'ui/images': 'createImageForm', 'ui/search': 'createSearchForm' } as Record<string, string>)[feature], feature })),
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
  assert.ok(!inputs.some((path) => path.includes('/@angular/') || /\/@angular\+/.test(path)), `${feature}: Angular runtime leaked`);
  assert.ok(!inputs.some((path) => path.endsWith('.css')), `${feature}: CSS must remain opt-in`);
  for (const other of [...features, ...forms].filter((other) => other !== feature)) {
    assert.ok(!inputs.some((path) => path === `packages/plugins/dist/${other}.js`), `${feature}: loaded unrelated ${other}`);
  }
  if (feature === 'core' || feature === 'sanitizer' || feature === 'localization' || feature === 'schema' || feature === 'command-token') assert.ok(!inputs.some((path) => path.startsWith('packages/plugins/')), `${feature}: plugin leaked into core`);
  const text = result.outputFiles[0].text;
  if (['sanitizer', 'schema', 'command-token'].includes(feature)) assert.ok(!text.includes('mw-editor') && !text.includes('mw-toolbar'), 'sanitizer: editor UI retained');
  if (feature === 'sanitizer') assert.ok(!text.includes('toolbar.bold') && !text.includes('editor.placeholder'), 'sanitizer: UI dictionaries retained');
  if (feature === 'sanitizer') assert.ok(!text.includes('Command is not registered') && !text.includes('Schema node names'), 'sanitizer: optional SDK definitions retained');
  if (feature === 'command-token') assert.ok(!text.includes('Schema node names') && !text.includes('Invalid document node'), 'command-token: schema codec retained');
  if (feature === 'localization') assert.ok(!text.includes('mw-editor') && !text.includes('mw-toolbar') && !text.includes('toolbar.bold'), 'localization: editor UI retained');
  console.log(`${feature}: selective public import passed (${result.outputFiles[0].contents.length} minified bytes)`);
}
