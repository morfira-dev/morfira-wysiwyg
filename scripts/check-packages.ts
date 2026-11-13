import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

interface PackedPackage { name: string; files: { path: string }[] }
const packed = JSON.parse(execFileSync('pnpm', ['--filter', './packages/*', '-r', 'pack', '--dry-run', '--json'], { encoding: 'utf8' })) as PackedPackage[];
assert.equal(packed.length, 6, 'Pack exactly the six public libraries.');
const exportFiles = (value: unknown): string[] => typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(exportFiles) : [];
for (const name of ['core', 'plugins', 'vue', 'react', 'svelte', 'wysiwyg']) {
  const manifest = JSON.parse(await readFile(`packages/${name}/package.json`, 'utf8')) as { name: string; exports: unknown };
  const pkg = packed.find((item) => item.name === manifest.name);
  assert.ok(pkg, `Missing archive: ${manifest.name}`);
  const files = new Set(pkg.files.map((file) => file.path));
  assert.ok(files.has('LICENSE'), `${manifest.name}: include MIT license.`);
  for (const file of exportFiles(manifest.exports)) assert.ok(files.has(file.replace(/^\.\//, '')), `${manifest.name}: missing export ${file}`);
  for (const file of files) assert.ok(!/^(node_modules|tests|src|\.env)(\/|$)/.test(file), `${manifest.name}: unexpected file ${file}`);
}
console.log('Six package archives: public exports, declarations, MIT notices and file boundaries passed (no publication).');
