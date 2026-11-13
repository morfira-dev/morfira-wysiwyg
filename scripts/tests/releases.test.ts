import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { releasePackages } from '../release.js';

const fixture = async (message: string, file: string) => {
  const directory = await mkdtemp(join(tmpdir(), 'morfira-release-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const packages = ['core', 'vue', 'other'];
  await writeFile(join(directory, 'package.json'), JSON.stringify({ private: true, workspaces: ['packages/*'] }));
  git('init', '-b', 'main'); git('config', 'user.name', 'Release Fixture'); git('config', 'user.email', 'fixture@example.invalid');
  const remote = join(directory, 'remote.git'); git('init', '--bare', remote); git('remote', 'add', 'origin', remote);
  for (const name of packages) {
    await mkdir(join(directory, 'packages', name), { recursive: true });
    await writeFile(join(directory, 'packages', name, 'package.json'), JSON.stringify({
      name: `@fixture/${name}`, version: '1.0.0',
      ...(name === 'vue' ? { dependencies: { '@fixture/core': '^1.0.0' } } : {}),
    }));
  }
  git('add', 'package.json', 'packages'); git('commit', '-m', 'feat: initial libraries');
  for (const name of packages) git('tag', `@fixture/${name}@1.0.0`);
  await writeFile(join(directory, file), 'changed\n'); git('add', file); git('commit', '-m', message);
  git('push', '--set-upstream', 'origin', 'main', '--tags');
  return { directory, git, remote };
};

for (const scenario of [
  { message: 'feat(core): add table clipboard', file: 'packages/core/new.ts', versions: ['1.1.0', '1.1.0', null] },
  { message: 'docs: update getting started', file: 'README.md', versions: [null, null, null] },
  { message: 'break(core): change document schema', file: 'packages/core/new.ts', versions: ['2.0.0', '2.0.0', null] },
  { message: 'feat(core)!: change document format', file: 'packages/core/new.ts', versions: ['2.0.0', '2.0.0', null] },
  { message: 'fix(vue): preserve selection', file: 'packages/vue/fix.ts', versions: [null, '1.0.1', null] },
]) {
  test(`independent release plan: ${scenario.message}`, async () => {
    const { directory, git, remote } = await fixture(scenario.message, scenario.file);
    try {
      const before = git('status', '--porcelain'); const tags = git('tag');
      const result = await releasePackages(directory, true, remote);
      for (const [index, name] of ['core', 'vue', 'other'].entries()) {
        assert.equal(result.find((pkg) => pkg.name === `@fixture/${name}`)?.release?.version ?? null, scenario.versions[index]);
      }
      assert.equal(git('status', '--porcelain'), before); assert.equal(git('tag'), tags);
      assert.equal(JSON.parse(await readFile(join(directory, 'packages/vue/package.json'), 'utf8')).dependencies['@fixture/core'], '^1.0.0');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
}
