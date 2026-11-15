import { readdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { compile } from 'svelte/compiler';
import { build, transform } from 'esbuild';
import { fileURLToPath } from 'node:url';

const report: Record<string, { raw: number; gzip: number; brotli: number; }> = {};
let failed = false;
for (const name of ['core', 'plugins', 'vue', 'react', 'svelte', 'angular', 'web-component']) {
  const path = `packages/${name}/dist`;
  const files = (await readdir(path)).filter((file) => /\.(js|css)$/.test(file));
  for (const extension of ['js', 'css']) {
    const entryMap = name === 'plugins' ? JSON.parse(await readFile(`${path}/entries.json`, 'utf8')) as Record<string, string[]> : undefined;
    const buffers = await Promise.all(files.filter((file) => file.endsWith(`.${extension}`) && (!entryMap || (extension === 'js' ? entryMap.tables.includes(file) : file === 'tables.css'))).map((file) => readFile(`${path}/${file}`)));
    if (name === 'svelte' && extension === 'js') {
      const source = await readFile(`${path}/MorfiraEditor.svelte`, 'utf8');
      const compiled = compile(source, { filename: 'MorfiraEditor.svelte', generate: 'client', dev: false });
      const minified = await transform(compiled.js.code, { minify: true, format: 'esm', target: 'es2022' });
      buffers.push(Buffer.from(minified.code));
    }
    if (!buffers.length) continue;
    report[`${name}.${extension}`] = buffers.reduce((size, buffer) => ({ raw: size.raw + buffer.length, gzip: size.gzip + gzipSync(buffer).length, brotli: size.brotli + brotliCompressSync(buffer).length }), { raw: 0, gzip: 0, brotli: 0 });
  }
  if (name === 'plugins') {
    const entries = JSON.parse(await readFile(`${path}/entries.json`, 'utf8')) as Record<string, string[]>;
    for (const [group, selectedEntries] of [['suggestions-set', ['mentions', 'slash', 'suggestions']], ['all-plugins', Object.keys(entries).filter((entry) => !entry.startsWith('ui/') && !entry.startsWith('presets/'))], ['ui-forms', ['ui/links', 'ui/images', 'ui/search']]] as const) {
      const selected = [...new Set(selectedEntries.flatMap((entry) => entries[entry]))];
      const buffers = await Promise.all(selected.map((file) => readFile(`${path}/${file}`)));
      report[`${group}.js`] = buffers.reduce((size, buffer) => ({ raw: size.raw + buffer.length, gzip: size.gzip + gzipSync(buffer).length, brotli: size.brotli + brotliCompressSync(buffer).length }), { raw: 0, gzip: 0, brotli: 0 });
    }
    const checklistCSS = await readFile(`${path}/checklists.css`);
    report['checklists.css'] = { raw: checklistCSS.length, gzip: gzipSync(checklistCSS).length, brotli: brotliCompressSync(checklistCSS).length };
    if (checklistCSS.length > 2000) { console.error('checklists: exceeds 2000 byte CSS budget'); failed = true; }
    const css = await readFile(`${path}/suggestions.css`); report['suggestions.css'] = { raw: css.length, gzip: gzipSync(css).length, brotli: brotliCompressSync(css).length };
    const formCSS = await readFile(`${path}/ui/forms.css`); report['ui-forms.css'] = { raw: formCSS.length, gzip: gzipSync(formCSS).length, brotli: brotliCompressSync(formCSS).length };
    const editorCSS = await readFile(`${path}/ui/editor.css`); report['ui-editor.css'] = { raw: editorCSS.length, gzip: gzipSync(editorCSS).length, brotli: brotliCompressSync(editorCSS).length };
    for (const entry of ['presets/minimal', 'presets/standard', 'presets/extended', 'ui/editor', 'ui/standard', 'ui/extended', 'images', 'search', 'statistics', 'markdown', 'autolink', 'fonts', 'list-properties', 'text-direction', 'horizontal-rule', 'checklists', 'mentions', 'slash', 'suggestions', 'ui/links', 'ui/images', 'ui/search']) {
      const buffers = await Promise.all(entries[entry].map((file) => readFile(`${path}/${file}`)));
      report[`${entry}.js`] = buffers.reduce((size, buffer) => ({ raw: size.raw + buffer.length, gzip: size.gzip + gzipSync(buffer).length, brotli: size.brotli + brotliCompressSync(buffer).length }), { raw: 0, gzip: 0, brotli: 0 });
      if (report[`${entry}.js`].gzip > 150_000) { console.error(`${entry}: exceeds 150000 byte gzip JS budget`); failed = true; }
      if (entry === 'checklists' && report[`${entry}.js`].raw > 8000) { console.error('checklists: exceeds 8000 byte JS budget'); failed = true; }
      if (entry === 'horizontal-rule' && report[`${entry}.js`].raw > 5000) { console.error('horizontal-rule: exceeds 5000 byte JS budget'); failed = true; }
      if (entry === 'fonts' && report[`${entry}.js`].gzip > 8000) { console.error('fonts: exceeds 8000 byte gzip JS budget'); failed = true; }
      if (entry === 'text-direction' && report[`${entry}.js`].gzip > 8000) { console.error('text-direction: exceeds 8000 byte gzip JS budget'); failed = true; }
      if (entry === 'list-properties' && report[`${entry}.js`].gzip > 8000) { console.error('list-properties: exceeds 8000 byte gzip JS budget'); failed = true; }
    }
  }
  const budget = name === 'core' ? 200_000 : name === 'plugins' ? 150_000 : 10_000;
  const metric = name === 'core' || name === 'plugins' ? 'gzip' : 'raw';
  if (report[`${name}.js`][metric] > budget) { console.error(`${name}: exceeds ${budget} byte ${metric} JS budget`); failed = true; }
}
// Consumer profiles retain the actual public factories and bundle their shared JS once.
// Runtime feature flags are deliberately not used as a tree-shaking claim.
for (const profile of ['minimal', 'standard', 'extended']) {
  const preset = ({ minimal: 'createMinimalPreset', standard: 'createStandardPreset', extended: 'createExtendedPreset' } as Record<string, string>)[profile];
  const ui = ({ minimal: 'createEditorUI', standard: 'createStandardEditorUI', extended: 'createExtendedEditorUI' } as Record<string, string>)[profile];
  for (const variant of ['headless', 'ready', ...(profile === 'standard' ? ['fonts-ready', 'list-properties-ready', 'fonts-list-properties-ready', 'text-direction-ready', 'fonts-list-properties-text-direction-ready'] : [])]) {
    const ready = variant !== 'headless';
    const withFonts = variant.includes('fonts');
    const withListProperties = variant.includes('list-properties');
    const withTextDirection = variant.includes('text-direction');
    const name = `profile-${profile}-${variant}`;
    const contents = `import { createEditor } from '@morfira-dev/wysiwyg'; import { ${preset} } from '@morfira-dev/wysiwyg/presets/${profile}'; ${ready ? `import { ${ui} } from '@morfira-dev/wysiwyg/ui/${profile === 'minimal' ? 'editor' : profile}';` : ''} ${withFonts ? "import { fonts } from '@morfira-dev/wysiwyg/plugins/fonts';" : ''} ${withListProperties ? "import { listProperties } from '@morfira-dev/wysiwyg/plugins/list-properties';" : ''} ${withTextDirection ? "import { textDirection } from '@morfira-dev/wysiwyg/plugins/text-direction';" : ''} globalThis.__morfiraProfile = { createEditor, ${preset}${ready ? `, ${ui}` : ''}${withFonts ? ', fonts' : ''}${withListProperties ? ', listProperties' : ''}${withTextDirection ? ', textDirection' : ''} };`;
    const bundled = await build({
      stdin: { contents, resolveDir: process.cwd(), sourcefile: 'profile-consumer.ts', loader: 'ts' },
      bundle: true, treeShaking: true, minify: true, write: false, metafile: true,
      tsconfigRaw: { compilerOptions: {} }, format: 'esm', platform: 'browser', target: 'es2022', logLevel: 'silent',
    });
    const inputs = Object.keys(bundled.metafile!.inputs);
    if (inputs.some((input) => /^packages\/[^/]+\/src\//.test(input))) throw new Error(`${name}: expected built public artifacts, not source aliases.`);
    if (inputs.some((input) => input.endsWith('.css'))) throw new Error(`${name}: JS factories must not import CSS.`);
    const javascript = bundled.outputFiles[0].contents;
    report[`${name}.js`] = { raw: javascript.length, gzip: gzipSync(javascript).length, brotli: brotliCompressSync(javascript).length };
    const styles = [
      '@morfira-dev/wysiwyg/style.css',
      ...(profile !== 'minimal' ? ['@morfira-dev/wysiwyg/plugins/tables.css'] : []),
      ...(ready ? ['@morfira-dev/wysiwyg/ui/editor.css'] : []),
      ...(ready && profile !== 'minimal' ? ['@morfira-dev/wysiwyg/ui/forms.css'] : []),
      ...(ready && profile === 'extended' ? ['@morfira-dev/wysiwyg/plugins/suggestions.css'] : []),
    ];
    const css = await Promise.all([...new Set(styles)].map((entry) => readFile(fileURLToPath(import.meta.resolve(entry)))));
    report[`${name}.css`] = css.reduce((size, buffer) => ({ raw: size.raw + buffer.length, gzip: size.gzip + gzipSync(buffer).length, brotli: size.brotli + brotliCompressSync(buffer).length }), { raw: 0, gzip: 0, brotli: 0 });
    if (profile !== 'minimal') {
      // The first real presets now establish these measured product-profile guards.
      const budget = profile === 'standard' ? 65000 : 110000;
      const javascriptSize = report[`${name}.js`];
      const stylesheetSize = report[`${name}.css`];
      if (javascriptSize.gzip > budget || stylesheetSize.raw > 20000) {
        console.error(`${name}: exceeds profile guard (${budget} gzip JS / 20000 raw CSS bytes).`);
        failed = true;
      }
      else console.log(`${name}: measured profile guard passed (${budget} gzip JS / 20000 raw CSS bytes).`);
    }
  }
}
console.table(Object.fromEntries(Object.entries(report).map(([key, sizes]) => [key, Object.fromEntries(Object.entries(sizes).map(([type, bytes]) => [type, `${(bytes / 1000).toFixed(2)} kB`]))])));
await writeFile('size-report.json', JSON.stringify(report, null, 2) + '\n');
if (failed) process.exitCode = 1;
