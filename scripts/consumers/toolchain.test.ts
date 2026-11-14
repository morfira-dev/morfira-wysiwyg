import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { collectToolchainGraph } from './toolchain.js';

const tool = '@fixture/consumer-tool';
const absent = '@fixture/uninstalled-platform-range';
const fixture = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'morfira-consumer-optional-'));
  const source = join(directory, 'source');
  const installed = join(source, 'node_modules');
  const toolDirectory = join(installed, ...tool.split('/'));
  await mkdir(toolDirectory, { recursive: true });
  await writeFile(join(source, 'package.json'), JSON.stringify({ private: true, dependencies: { [tool]: '1.0.0' } }));
  await writeFile(join(toolDirectory, 'package.json'), JSON.stringify({
    name: tool, version: '1.0.0', optionalDependencies: { [absent]: '~2.3.3' },
  }));
  return { directory, source, installed: await realpath(installed), toolDirectory };
};

test('offline consumer preserves an absent optional dependency with a semver range on any platform', async () => {
  const { directory, source, installed, toolDirectory } = await fixture();
  try {
    const sourceGraph = await collectToolchainGraph(join(source, 'package.json'), [tool], installed);
    const selector = `${tool}@1.0.0>${absent}`;
    assert.deepEqual(sourceGraph.absentOptionalDependencies, [selector]);
    const archives = join(directory, 'archives');
    const consumer = join(directory, 'consumer');
    await mkdir(archives);
    await mkdir(consumer);
    execFileSync('pnpm', ['pack', '--pack-destination', archives], { cwd: toolDirectory, stdio: 'pipe' });
    const archive = join(archives, 'fixture-consumer-tool-1.0.0.tgz');
    await writeFile(join(consumer, 'package.json'), JSON.stringify({
      private: true, packageManager: 'pnpm@11.0.7', dependencies: { [tool]: `file:${archive}` },
    }));
    const overrides = Object.entries(sourceGraph.overrides).map(([name, target]) => `  ${JSON.stringify(name)}: ${JSON.stringify(target)}`).join('\n');
    await writeFile(join(consumer, 'pnpm-workspace.yaml'), `packages: []\nlinkWorkspacePackages: false\npreferWorkspacePackages: false\noverrides:\n${overrides}\n`);
    // This fictional optional package is not cached. Resolving it would fail offline.
    execFileSync('pnpm', ['install', '--offline', '--no-frozen-lockfile'], { cwd: consumer, stdio: 'pipe', env: { ...process.env, CI: 'true' } });
    const isolatedGraph = await collectToolchainGraph(join(consumer, 'package.json'), [tool], await realpath(join(consumer, 'node_modules')));
    assert.deepEqual(isolatedGraph, sourceGraph);
    await assert.rejects(realpath(join(consumer, 'node_modules', ...absent.split('/'))), { code: 'ENOENT' });
  }
  finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('missing required dependencies still fail instead of being removed as optional', async () => {
  const { directory, source, installed, toolDirectory } = await fixture();
  try {
    await writeFile(join(toolDirectory, 'package.json'), JSON.stringify({ name: tool, version: '1.0.0', dependencies: { [absent]: '~2.3.3' } }));
    await assert.rejects(collectToolchainGraph(join(source, 'package.json'), [tool], installed), /Missing installed required toolchain edge/);
  }
  finally {
    await rm(directory, { recursive: true, force: true });
  }
});
