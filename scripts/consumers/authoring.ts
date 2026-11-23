import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';

// Focused real-archive integration for the optional everyday-authoring modules.
const repository = resolve('.');
const temporary = await mkdtemp(join(tmpdir(), 'morfira-authoring-'));
try {
  const archives = join(temporary, 'archives');
  await mkdir(archives);
  for (const name of ['core', 'plugins', 'wysiwyg']) {
    const directory = join(repository, 'packages', name);
    const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')) as { name: string; version: string };
    execFileSync('pnpm', ['pack', '--pack-destination', archives], { cwd: directory, stdio: 'pipe' });
    const archive = `${manifest.name.replace('@', '').replace('/', '-')}-${manifest.version}.tgz`;
    const destination = join(temporary, 'node_modules', manifest.name);
    await mkdir(destination, { recursive: true });
    execFileSync('tar', ['-xzf', join(archives, archive), '--strip-components=1', '-C', destination]);
  }
  const entries = ['plugins/block-navigation', 'plugins/text-layout', 'plugins/format-painter', 'plugins/code-blocks', 'ui/text-layout', 'ui/format-painter', 'ui/code-blocks'];
  const imports = entries.map((entry, index) => `import * as feature${index} from '@morfira-dev/wysiwyg/${entry}';`).join('\n');
  const retain = `export default [${entries.map((_, index) => `feature${index}`).join(',')}];`;
  const entry = join(temporary, 'entry.ts');
  await writeFile(entry, `${imports}\n${retain}`);
  execFileSync(process.execPath, [join(repository, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--skipLibCheck', '--module', 'ESNext', '--moduleResolution', 'Bundler', '--target', 'ES2022', '--lib', 'ES2022,DOM,DOM.Iterable', entry], { cwd: temporary, stdio: 'pipe' });
  const result = await build({ entryPoints: [entry], bundle: true, platform: 'browser', format: 'esm', write: false, metafile: true, tsconfigRaw: { compilerOptions: {} }, logLevel: 'silent' });
  assert.ok(Object.keys(result.metafile!.inputs).every((input) => !resolve(input).startsWith(`${repository}/packages/`)), 'Archive consumers must not resolve workspace sources or artifacts.');
  execFileSync(process.execPath, ['--input-type=module', '--eval', `
    import assert from 'node:assert/strict';
    const modules = await Promise.all(${JSON.stringify(entries)}.map((entry) => import('@morfira-dev/wysiwyg/' + entry)));
    for (const feature of modules) {
      assert.ok(Object.values(feature).some((value) => typeof value === 'function'));
    }
    assert.equal(typeof globalThis.document, 'undefined');
  `], { cwd: temporary, stdio: 'pipe' });
  console.log('Authoring archive smoke: seven public subpaths typecheck/bundle from actual tarballs and import without a browser.');
}
finally {
  await rm(temporary, { recursive: true, force: true });
}
