import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const features = ['list-properties', 'fonts', 'horizontal-rule', 'checklists', 'tables', 'images', 'search', 'statistics', 'markdown', 'autolink', 'mentions', 'slash', 'suggestions'];
const forms = ['ui/links', 'ui/images', 'ui/search'];
const standardFeatures = ['tables', 'images', 'search', 'statistics', 'markdown', 'autolink', 'horizontal-rule'];
const standardUI = ['ui/editor', 'ui/shared', 'ui/standard', ...forms, 'tables', 'images', 'search', 'horizontal-rule'];
const originalInputs = JSON.parse(await readFile('packages/plugins/dist/bundled-inputs.json', 'utf8')) as Record<string, string[]>;
const owner = (path: string): string | undefined => {
  const relative = path.replaceAll('\\', '/').split('packages/plugins/src/')[1];
  if (!relative) return;
  if (relative.startsWith('ui/') || relative.startsWith('presets/')) return relative.split('/').slice(0, 2).join('/');
  if (relative.startsWith('suggestions/')) return /\/menu\.ts$|\/index\.ts$/.test(relative) ? 'suggestions-menu' : 'suggestions-core';
  return relative.split('/')[0];
};
const cases = [
  { entry: '@morfira-dev/wysiwyg', symbol: 'createEditor', feature: 'core', allowed: [] },
  { entry: '@morfira-dev/wysiwyg', symbol: 'sanitizeHTML', feature: 'sanitizer', allowed: [] },
  { entry: '@morfira-dev/wysiwyg', symbol: 'localize', feature: 'localization', allowed: [] },
  { entry: '@morfira-dev/wysiwyg', symbol: 'createDocumentSchema', feature: 'schema', allowed: [] },
  { entry: '@morfira-dev/wysiwyg', symbol: 'createEditorCommand', feature: 'command-token', allowed: [] },
  { entry: '@morfira-dev/wysiwyg/web-component', symbol: 'defineMorfiraEditor', feature: 'web-component', allowed: [] },
  ...features.map((feature) => ({
    entry: `@morfira-dev/wysiwyg/plugins/${feature}`,
    symbol: ({ 'list-properties': 'listProperties', fonts: 'fonts', 'horizontal-rule': 'horizontalRule', checklists: 'checklists', tables: 'tables', images: 'images', search: 'search', statistics: 'statistics', markdown: 'markdownShortcuts', autolink: 'autolink', mentions: 'mentions', slash: 'slash', suggestions: 'createSuggestionMenu' } as Record<string, string>)[feature],
    feature,
    allowed: feature === 'suggestions' ? ['suggestions-core', 'suggestions-menu'] : [feature, ...(['mentions', 'slash'].includes(feature) ? ['suggestions-core'] : [])],
  })),
  ...forms.map((feature) => ({
    entry: `@morfira-dev/wysiwyg/${feature}`,
    symbol: ({ 'ui/links': 'createLinkForm', 'ui/images': 'createImageForm', 'ui/search': 'createSearchForm' } as Record<string, string>)[feature],
    feature,
    allowed: [feature, 'ui/shared', ...(feature === 'ui/images' ? ['images'] : feature === 'ui/search' ? ['search'] : [])],
  })),
  { entry: '@morfira-dev/wysiwyg/presets/minimal', symbol: 'createMinimalPreset', feature: 'presets/minimal', allowed: ['presets/minimal', 'presets/shared'] },
  { entry: '@morfira-dev/wysiwyg/presets/standard', symbol: 'createStandardPreset', feature: 'presets/standard', allowed: ['presets/standard', 'presets/shared', ...standardFeatures] },
  { entry: '@morfira-dev/wysiwyg/presets/extended', symbol: 'createExtendedPreset', feature: 'presets/extended', allowed: ['presets/extended', 'presets/standard', 'presets/shared', ...standardFeatures, 'mentions', 'slash', 'suggestions-core'] },
  { entry: '@morfira-dev/wysiwyg/ui/editor', symbol: 'createEditorUI', feature: 'ui/editor', allowed: ['ui/editor', 'ui/shared'] },
  { entry: '@morfira-dev/wysiwyg/ui/standard', symbol: 'createStandardEditorUI', feature: 'ui/standard', allowed: standardUI },
  { entry: '@morfira-dev/wysiwyg/ui/extended', symbol: 'createExtendedEditorUI', feature: 'ui/extended', allowed: [...standardUI, 'ui/extended', 'mentions', 'slash', 'suggestions-core', 'suggestions-menu'] },
];
for (const { entry, symbol, feature, allowed } of cases) {
  const result = await build({
    stdin: { contents: `import { ${symbol} } from '${entry}'; globalThis.__morfiraProbe = ${symbol};`, resolveDir: process.cwd(), sourcefile: 'consumer.ts', loader: 'ts' },
    bundle: true, treeShaking: true, minify: true, write: false, metafile: true,
    tsconfigRaw: { compilerOptions: {} },
    format: 'esm', platform: 'browser', target: 'es2022', logLevel: 'silent',
  });
  const inputs = Object.keys(result.metafile!.inputs).map((path) => path.replaceAll('\\', '/'));
  assert.ok(!inputs.some((path) => /^packages\/[^/]+\/src\//.test(path)), `${feature}: consumer must use built public artifacts, not source aliases`);
  assert.ok(!inputs.some((path) => /node_modules\/(?:\.pnpm\/)?(?:react|vue|svelte)(?:@|\/)/.test(path)), `${feature}: framework runtime leaked`);
  assert.ok(!inputs.some((path) => path.includes('/@angular/') || /\/@angular\+/.test(path)), `${feature}: Angular runtime leaked`);
  assert.ok(!inputs.some((path) => path.endsWith('.css')), `${feature}: CSS must remain opt-in`);
  for (const input of inputs.filter((path) => path.startsWith('packages/plugins/dist/'))) {
    const output = input.slice('packages/plugins/dist/'.length);
    assert.ok(Object.hasOwn(originalInputs, output), `${feature}: missing original input ownership for ${output}`);
    for (const source of originalInputs[output]) {
      const sourceOwner = owner(source);
      assert.ok(!sourceOwner || allowed.includes(sourceOwner), `${feature}: loaded unrelated ${sourceOwner} implementation through ${output}`);
    }
  }
  const text = result.outputFiles[0].text;
  if (['sanitizer', 'schema', 'command-token'].includes(feature)) assert.ok(!text.includes('mw-editor') && !text.includes('mw-toolbar'), `${feature}: editor UI retained`);
  if (feature === 'sanitizer') assert.ok(!text.includes('toolbar.bold') && !text.includes('editor.placeholder'), 'sanitizer: UI dictionaries retained');
  if (feature === 'sanitizer') assert.ok(!text.includes('Command is not registered') && !/Schema (?:node )?names/.test(text), 'sanitizer: optional SDK definitions retained');
  if (feature === 'command-token') assert.ok(!/Schema (?:node )?names/.test(text) && !text.includes('Invalid document node'), 'command-token: schema codec retained');
  if (feature === 'localization') assert.ok(!text.includes('mw-editor') && !text.includes('mw-toolbar') && !text.includes('toolbar.bold'), 'localization: editor UI retained');
  console.log(`${feature}: selective public import passed (${result.outputFiles[0].contents.length} minified bytes)`);
}
