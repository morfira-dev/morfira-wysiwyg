import { readdir, readFile, writeFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import multiRelease from 'multi-semantic-release';
import type { Options } from 'semantic-release';

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
  if (!dryRun && process.env.GITHUB_ACTIONS !== 'true') throw new Error('Publish through the checked GitHub Actions release workflow. Use --dry-run locally.');
  const result = await releasePackages(process.cwd(), dryRun);
  console.log(JSON.stringify(result, null, 2));
  await writeFile('release-plan.json', `${JSON.stringify(result, null, 2)}\n`);
}
