import { readdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { compile } from 'svelte/compiler';
import { transform } from 'esbuild';

const report: Record<string, { raw: number; gzip: number; brotli: number; }> = {};
let failed = false;
for (const name of ['core', 'plugins', 'vue', 'react', 'svelte']) {
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
    const css = await readFile(`${path}/suggestions.css`); report['suggestions.css'] = { raw: css.length, gzip: gzipSync(css).length, brotli: brotliCompressSync(css).length };
    for (const entry of ['images', 'search', 'statistics', 'markdown', 'mentions', 'slash', 'suggestions']) {
      const buffers = await Promise.all(entries[entry].map((file) => readFile(`${path}/${file}`)));
      report[`${entry}.js`] = buffers.reduce((size, buffer) => ({ raw: size.raw + buffer.length, gzip: size.gzip + gzipSync(buffer).length, brotli: size.brotli + brotliCompressSync(buffer).length }), { raw: 0, gzip: 0, brotli: 0 });
      if (report[`${entry}.js`].raw > 150_000) { console.error(`${entry}: exceeds 150000 byte JS budget`); failed = true; }
    }
  }
  const budget = name === 'core' ? 200_000 : name === 'plugins' ? 150_000 : 10_000;
  if (report[`${name}.js`].raw > budget) { console.error(`${name}: exceeds ${budget} byte JS budget`); failed = true; }
}
console.table(Object.fromEntries(Object.entries(report).map(([key, sizes]) => [key, Object.fromEntries(Object.entries(sizes).map(([type, bytes]) => [type, `${(bytes / 1000).toFixed(2)} kB`]))])));
await writeFile('size-report.json', JSON.stringify(report, null, 2) + '\n');
if (failed) process.exitCode = 1;
