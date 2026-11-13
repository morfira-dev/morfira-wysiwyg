import { execFileSync } from 'node:child_process';
import { readFile, readdir, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';

export const persistReleaseState = async (directory: string, expectedHead: string): Promise<string | undefined> => {
  const cwd = await realpath(directory);
  const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  if (git('branch', '--show-current') !== 'main') throw new Error('Release state can only be saved on main.');
  if (git('rev-parse', 'HEAD') !== expectedHead) throw new Error('Release source HEAD changed; refusing to save release state.');
  if (git('diff', '--cached', '--name-only')) throw new Error('Release state requires an empty Git index.');

  const paths = ['pnpm-lock.yaml'];
  for (const name of await readdir(resolve(cwd, 'packages'))) {
    const path = `packages/${name}/package.json`;
    const manifest = JSON.parse(await readFile(resolve(cwd, path), 'utf8')) as { private?: boolean };
    if (!manifest.private) paths.push(path);
  }
  git('ls-files', '--error-unmatch', '--', ...paths);
  // Do not generate package locks or run lifecycle scripts during persistence.
  execFileSync('pnpm', ['install', '--lockfile-only', '--ignore-scripts', '--no-frozen-lockfile'], { cwd, stdio: 'inherit' });
  if (!git('diff', '--name-only', '--', ...paths)) return undefined;

  git('add', '--', ...paths);
  execFileSync('git', ['commit', '-m', 'chore(release): sync package versions [skip ci]'], {
    cwd, stdio: 'inherit',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'github-actions[bot]', GIT_AUTHOR_EMAIL: '41898282+github-actions[bot]@users.noreply.github.com',
      GIT_COMMITTER_NAME: 'github-actions[bot]', GIT_COMMITTER_EMAIL: '41898282+github-actions[bot]@users.noreply.github.com',
    },
  });
  // A concurrent main update must reject the push, never replace history.
  git('push', 'origin', 'HEAD:refs/heads/main');
  return git('rev-parse', 'HEAD');
};
