import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { persistReleaseState } from '../release-state.js';
import { releasePackages } from '../release.js';

const createFixture = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'morfira-release-state-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const pnpm = (...args: string[]) => execFileSync('pnpm', args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const remote = join(directory, 'remote.git');
  git('init', '-b', 'main'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid');
  git('init', '--bare', '-b', 'main', remote); git('remote', 'add', 'origin', remote);
  await writeFile(join(directory, '.gitignore'), 'node_modules/\nremote.git/\n');
  await writeFile(join(directory, 'README.md'), 'Original\n');
  await writeFile(join(directory, 'package.json'), JSON.stringify({ private: true, packageManager: 'pnpm@11.0.7' }));
  await writeFile(join(directory, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\nlinkWorkspacePackages: true\n');
  const setVersions = async (version: string) => {
    for (const name of ['core', 'vue']) {
      await mkdir(join(directory, 'packages', name), { recursive: true });
      await writeFile(join(directory, 'packages', name, 'package.json'), JSON.stringify({
        name: `@fixture/${name}`, version,
        ...(name === 'vue' ? { peerDependencies: { '@fixture/core': `^${version}` } } : {}),
      }, null, 2) + '\n');
    }
  };
  await setVersions('1.0.0');
  pnpm('install', '--lockfile-only', '--ignore-scripts', '--no-frozen-lockfile');
  git('add', '.gitignore', 'README.md', 'package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'packages');
  git('commit', '-m', 'feat: initial packages');
  git('push', '-u', 'origin', 'main');
  return { directory, git, pnpm, remote, setVersions };
};
const withFixture = async (action: (fixture: Awaited<ReturnType<typeof createFixture>>) => Promise<void>) => {
  const fixture = await createFixture();
  try { await action(fixture); } finally { await rm(fixture.directory, { recursive: true, force: true }); }
};

test('successful batch persists versions, internal ranges and frozen lockfile in one pushed non-releasing commit', async () => {
  await withFixture(async ({ directory, git, pnpm, remote, setVersions }) => {
    await writeFile(join(directory, 'packages/core/feature.ts'), 'export const feature = true;\n');
    git('add', 'packages/core/feature.ts'); git('commit', '-m', 'feat(core): new feature');
    const sourceHead = git('rev-parse', 'HEAD');
    // Simulate the artifacts and tags produced by a successful multirelease.
    for (const name of ['core', 'vue']) git('tag', `@fixture/${name}@1.1.0`);
    git('push', 'origin', 'main', '--tags');
    await setVersions('1.1.0');
    await writeFile(join(directory, 'README.md'), 'Unrelated local edit\n');
    const commit = await persistReleaseState(directory, sourceHead);
    assert.ok(commit); assert.equal(git('rev-parse', 'HEAD^'), sourceHead);
    assert.equal(git('--git-dir', remote, 'rev-parse', 'refs/heads/main'), commit);
    assert.equal(git('log', '-1', '--format=%s'), 'chore(release): sync package versions [skip ci]');
    assert.equal(git('log', '-1', '--format=%ae'), '41898282+github-actions[bot]@users.noreply.github.com');
    assert.deepEqual(git('diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD').split('\n').sort(), ['packages/core/package.json', 'packages/vue/package.json', 'pnpm-lock.yaml']);
    assert.equal(JSON.parse(git('show', 'HEAD:packages/core/package.json')).version, '1.1.0');
    assert.equal(JSON.parse(git('show', 'HEAD:packages/vue/package.json')).peerDependencies['@fixture/core'], '^1.1.0');
    pnpm('install', '--frozen-lockfile', '--ignore-scripts');
    assert.equal(git('diff', '--name-only'), 'README.md');
    assert.equal(await persistReleaseState(directory, commit), undefined);
    assert.equal(git('rev-parse', 'HEAD'), commit);
    const plan = await releasePackages(directory, true, remote);
    assert.ok(plan.every((pkg) => !pkg.release), 'The service commit must not cause another release.');
  });
});

test('persistence rejects an existing staged edit before changing the lockfile', async () => {
  await withFixture(async ({ directory, git, setVersions }) => {
    const lock = await readFile(join(directory, 'pnpm-lock.yaml'), 'utf8');
    const head = git('rev-parse', 'HEAD'); await setVersions('1.1.0');
    await writeFile(join(directory, 'README.md'), 'Staged by user\n'); git('add', 'README.md');
    await assert.rejects(persistReleaseState(directory, head), /empty Git index/);
    assert.equal(git('diff', '--cached', '--name-only'), 'README.md');
    assert.equal(await readFile(join(directory, 'pnpm-lock.yaml'), 'utf8'), lock);
    assert.equal(git('rev-parse', 'HEAD'), head);
  });
});

test('persistence rejects a wrong source HEAD or branch', async () => {
  await withFixture(async ({ directory, git }) => {
    const head = git('rev-parse', 'HEAD');
    await assert.rejects(persistReleaseState(directory, '0'.repeat(40)), /HEAD changed/);
    git('switch', '-c', 'other');
    await assert.rejects(persistReleaseState(directory, head), /only be saved on main/);
    assert.equal(git('rev-parse', 'HEAD'), head);
  });
});

test('a concurrent main update rejects the push and preserves the newer remote commit', async () => {
  await withFixture(async ({ directory, git, remote, setVersions }) => {
    const head = git('rev-parse', 'HEAD');
    const competing = git('commit-tree', git('rev-parse', 'HEAD^{tree}'), '-p', head, '-m', 'chore: concurrent update');
    git('push', 'origin', `${competing}:refs/heads/main`);
    await setVersions('1.0.1');
    await assert.rejects(persistReleaseState(directory, head), /git push/);
    assert.equal(git('--git-dir', remote, 'rev-parse', 'refs/heads/main'), competing);
    assert.equal(git('log', '-1', '--format=%s'), 'chore(release): sync package versions [skip ci]');
  });
});
