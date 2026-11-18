import { execFileSync } from 'node:child_process';
import { readdir, readFile, writeFile, realpath, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import multiRelease from 'multi-semantic-release';
import type { Options } from 'semantic-release';
import { persistReleaseState } from './release-state.js';
import type { PublishedReleaseReport } from './release-notification.types.js';

export const assertPublishRuntime = (npmVersion: string, env: NodeJS.ProcessEnv): void => {
  const version = npmVersion.trim();
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`Cannot verify npm CLI version: ${version}.`);
  const [, major, minor, patch] = match.map(Number);
  if (major < 11 || (major === 11 && (minor < 5 || (minor === 5 && patch < 1)))) {
    throw new Error(`npm ${version} cannot publish with OIDC. Install npm >=11.5.1 before starting semantic-release.`);
  }
  if (!env.ACTIONS_ID_TOKEN_REQUEST_URL || !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) {
    throw new Error('GitHub OIDC is unavailable. Grant id-token: write to the publish job.');
  }
};

export const releasePackages = async (cwd: string, dryRun: boolean, repositoryUrl?: string) => {
  cwd = await realpath(cwd);
  const paths: string[] = [];
  for (const name of await readdir(resolve(cwd, 'packages'))) {
    const path = resolve(cwd, 'packages', name, 'package.json');
    const manifest = JSON.parse(await readFile(path, 'utf8')) as { private?: boolean };
    if (!manifest.private) paths.push(path);
  }
  const options: Options = dryRun ? {
    dryRun: true, ci: false, branches: ['main'],
    // Planning must work before npm credentials or trusted-publisher bindings exist.
    plugins: [['@semantic-release/commit-analyzer', { preset: 'conventionalcommits', releaseRules: [{ type: 'break', release: 'major' }] }]],
  } : {};
  if (repositoryUrl) options.repositoryUrl = repositoryUrl;
  const packages = await multiRelease(paths, options, { cwd }, {
    sequentialInit: true, ignorePrivatePackages: true,
    deps: { bump: 'override', release: 'inherit', prefix: '^' },
  });
  return packages.map((pkg) => ({ name: pkg.name, release: pkg.result ? pkg.result.nextRelease : null }));
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const dryRun = process.argv.includes('--dry-run');
  await rm('release-published.json', { force: true });
  if (!dryRun && process.env.GITHUB_ACTIONS !== 'true') throw new Error('Publish through the checked GitHub Actions release workflow. Use --dry-run locally.');
  if (!dryRun) assertPublishRuntime(execFileSync('npm', ['--version'], { encoding: 'utf8' }), process.env);
  const sourceHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const result = await releasePackages(process.cwd(), dryRun);
  if (!dryRun && result.some((pkg) => pkg.release)) await persistReleaseState(process.cwd(), sourceHead);
  console.log(JSON.stringify(result, null, 2));
  await writeFile('release-plan.json', `${JSON.stringify(result, null, 2)}\n`);
  if (!dryRun) {
    const packages = result.flatMap(({ name, release }) => release ? [{ name, version: release.version }] : []);
    if (packages.length) {
      const report: PublishedReleaseReport = {
        version: 1,
        sourceSha: sourceHead,
        runId: process.env.GITHUB_RUN_ID ?? '',
        runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? '',
        packages,
      };
      try {
        await writeFile('release-published.json', `${JSON.stringify(report, null, 2)}\n`);
      }
      catch {
        console.warn('Optional Telegram notification report could not be written; package publication already completed.');
      }
    }
  }
}
