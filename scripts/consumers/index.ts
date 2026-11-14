import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyConsumers } from './browser.js';
import { serveConsumer } from './server.js';
import type { ConsumerReport, DependencyManifest, PackageManifest, ToolchainGraph } from './types.js';

const repository = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const rootManifest = JSON.parse(await readFile(join(repository, 'package.json'), 'utf8')) as { packageManager: string };
const pnpm = execFileSync('pnpm', ['--version'], { cwd: repository, encoding: 'utf8' }).trim();
assert.equal(`pnpm@${pnpm}`, rootManifest.packageManager, 'Use the repository-pinned pnpm version.');
/** Ignore loader/global fallbacks and keep peer-only bindings in their owning PNPM context. */
const installedManifest = async (name: string, owner: string, installedRoot: string, peerOwnerName?: string): Promise<string | undefined> => {
  const physicalOwner = await realpath(owner);
  const packageRoot = dirname(physicalOwner);
  let peerContext = packageRoot;
  if (peerOwnerName) {
    for (const _part of peerOwnerName.split('/')) peerContext = dirname(peerContext);
  }
  for (const directory of createRequire(physicalOwner).resolve.paths(name) ?? []) {
    const candidate = resolve(directory);
    if (candidate !== installedRoot && !candidate.startsWith(installedRoot + sep)) continue;
    if (peerOwnerName && candidate !== join(packageRoot, 'node_modules') && candidate !== peerContext) continue;
    try {
      const path = await realpath(join(candidate, ...name.split('/'), 'package.json'));
      assert.ok(path.startsWith(installedRoot + sep), `Dependency binding escaped its installed node_modules: ${path}`);
      return path;
    }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && code !== 'ENOTDIR') throw error;
    }
  }
  return undefined;
};
const readManifest = async (path: string): Promise<DependencyManifest> => JSON.parse(await readFile(path, 'utf8')) as DependencyManifest;
const readInstalledVersion = async (name: string): Promise<string> => {
  const path = await installedManifest(name, join(repository, 'package.json'), await realpath(join(repository, 'node_modules')));
  assert.ok(path, `Cannot find installed tool: ${name}`);
  return (await readManifest(path)).version;
};
const collectToolchainGraph = async (owner: string, roots: string[], installedRoot: string): Promise<ToolchainGraph> => {
  const pending: string[] = [];
  const visited = new Set<string>();
  const packages = new Set<string>();
  const overrides = new Map<string, string>();
  const absentOptionalDependencies = new Set<string>();
  const absentOptionalPeers = new Set<string>();
  const pin = (selector: string, target: string) => {
    const previous = overrides.get(selector);
    assert.ok(previous === undefined || previous === target, `Ambiguous installed toolchain edge ${selector}: ${previous} versus ${target}. Refusing to force incompatible resolutions.`);
    overrides.set(selector, target);
  };
  for (const name of roots) {
    const path = await installedManifest(name, owner, installedRoot);
    assert.ok(path, `Missing installed toolchain root: ${name}`);
    pending.push(path);
  }
  while (pending.length) {
    const path = pending.pop()!;
    if (visited.has(path)) continue;
    visited.add(path);
    assert.ok(path.startsWith(installedRoot + sep), `Toolchain resolution escaped its installed node_modules: ${path}`);
    const manifest = await readManifest(path);
    const parent = `${manifest.name}@${manifest.version}`;
    packages.add(parent);
    const optional = manifest.optionalDependencies ?? {};
    const required = manifest.dependencies ?? {};
    const peers = manifest.peerDependencies ?? {};
    const dependencies = { ...peers, ...required, ...optional };
    for (const [name, range] of Object.entries(dependencies)) {
      const selector = `${parent}>${name}`;
      const peerOnly = Object.hasOwn(peers, name) && !Object.hasOwn(required, name) && !Object.hasOwn(optional, name);
      const childPath = await installedManifest(name, path, installedRoot, peerOnly ? manifest.name : undefined);
      if (!childPath) {
        if (Object.hasOwn(optional, name)) {
          assert.ok(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(range), `Uninstalled optional dependency ${selector} is not exact (${range}); cannot reproduce it offline without guessing.`);
          pin(selector, range);
          absentOptionalDependencies.add(selector);
          continue;
        }
        if (!Object.hasOwn(required, name) && manifest.peerDependenciesMeta?.[name]?.optional) {
          absentOptionalPeers.add(selector);
          continue;
        }
        throw new Error(`Missing installed required toolchain edge: ${selector}`);
      }
      const child = await readManifest(childPath);
      pin(selector, child.name === name ? child.version : `npm:${child.name}@${child.version}`);
      pending.push(childPath);
    }
  }
  return {
    packages: [...packages].sort(),
    overrides: Object.fromEntries([...overrides].sort(([a], [b]) => a.localeCompare(b))),
    absentOptionalDependencies: [...absentOptionalDependencies].sort(),
    absentOptionalPeers: [...absentOptionalPeers].sort(),
  };
};
const tools = ['vue', 'react', 'react-dom', 'svelte', 'vite', '@vitejs/plugin-vue', '@sveltejs/vite-plugin-svelte', 'typescript', 'vue-tsc', 'svelte-check', 'tsx', '@types/node', '@types/react', '@types/react-dom'];
const toolchain = Object.fromEntries(await Promise.all(tools.map(async (name) => [name, await readInstalledVersion(name)])));
const report: ConsumerReport = {
  status: 'failed', node: process.version, pnpm, platform: `${process.platform}/${process.arch}`,
  packages: [], installed: [], resolved: {}, toolchain, scenarios: [], temporaryDirectoryRemoved: false,
};
const temporary = await mkdtemp(join(tmpdir(), 'morfira-packed-consumer-'));
const run = (args: string[], cwd: string) => {
  console.log(`Consumer check: pnpm ${args.join(' ')}`);
  execFileSync('pnpm', args, { cwd, stdio: 'inherit', env: { ...process.env, CI: 'true' } });
};
let failure: unknown;
try {
  report.rootLockfileSHA256 = createHash('sha256').update(await readFile(join(repository, 'pnpm-lock.yaml'))).digest('hex');
  const toolchainGraph = await collectToolchainGraph(join(repository, 'package.json'), tools, await realpath(join(repository, 'node_modules')));
  report.toolchainGraph = toolchainGraph;
  console.log(`Pinning ${toolchainGraph.packages.length} installed toolchain packages through ${Object.keys(toolchainGraph.overrides).length} version-qualified dependency edges.`);
  const archives = join(temporary, 'archives');
  const consumer = join(temporary, 'consumer');
  await mkdir(archives);
  await cp(join(repository, 'scripts/consumers/fixtures'), consumer, { recursive: true });
  for (const folder of ['core', 'plugins', 'vue', 'react', 'svelte', 'wysiwyg']) {
    const directory = join(repository, 'packages', folder);
    const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')) as PackageManifest;
    run(['pack', '--pack-destination', archives], directory);
    const archive = join(archives, `${manifest.name.replace('@', '').replace('/', '-')}-${manifest.version}.tgz`);
    const sha256 = createHash('sha256').update(await readFile(archive)).digest('hex');
    report.packages.push({ name: manifest.name, version: manifest.version, folder, archive, sha256 });
  }
  const dependencies = Object.fromEntries(report.packages.map((entry) => [entry.name, `file:${entry.archive}`]));
  const manifest = {
    name: 'morfira-isolated-consumer', private: true, type: 'module',
    packageManager: rootManifest.packageManager,
    dependencies, devDependencies: toolchain,
  };
  await writeFile(join(consumer, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  const overrides = Object.entries({ ...toolchainGraph.overrides, ...dependencies }).map(([name, target]) => `  ${JSON.stringify(name)}: ${JSON.stringify(target)}`).join('\n');
  await writeFile(join(consumer, 'pnpm-workspace.yaml'), `packages: []\nlinkWorkspacePackages: false\npreferWorkspacePackages: false\nsaveExact: true\nallowBuilds:\n  esbuild: true\noverrides:\n${overrides}\n`);
  run(['install', '--offline', '--no-frozen-lockfile'], consumer);
  const installedRoot = await realpath(join(consumer, 'node_modules'));
  const installedGraph = await collectToolchainGraph(join(consumer, 'package.json'), tools, installedRoot);
  report.installedToolchainGraph = installedGraph;
  assert.deepEqual(installedGraph, toolchainGraph, 'Isolated toolchain dependency graph must match the actual installed repository graph.');
  for (const entry of report.packages) {
    const path = join(consumer, 'node_modules', ...entry.name.split('/'));
    const location = await realpath(path);
    assert.ok(location.startsWith(installedRoot + sep), `${entry.name}: must resolve within isolated node_modules, not workspace source`);
    const installed = JSON.parse(await readFile(join(path, 'package.json'), 'utf8')) as PackageManifest;
    assert.equal(installed.name, entry.name);
    assert.equal(installed.version, entry.version);
    report.installed.push({ name: installed.name, version: installed.version, location });
  }
  const entries = ['@morfira-dev/wysiwyg', ...['vue', 'react', 'svelte', 'plugins/tables', 'plugins/images', 'plugins/search', 'plugins/statistics', 'plugins/markdown', 'plugins/mentions', 'plugins/slash', 'plugins/suggestions', 'style.css', 'plugins/tables.css', 'plugins/suggestions.css'].map((path) => `@morfira-dev/wysiwyg/${path}`)];
  report.resolved = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '--eval', `process.stdout.write(JSON.stringify(Object.fromEntries(${JSON.stringify(entries)}.map((entry) => [entry, import.meta.resolve(entry)]))))`], { cwd: consumer, encoding: 'utf8' })) as Record<string, string>;
  for (const [entry, target] of Object.entries(report.resolved)) {
    assert.ok((await realpath(fileURLToPath(target))).startsWith(installedRoot + sep), `${entry}: public export must resolve inside installed artifacts`);
  }
  run(['exec', 'tsc', '--noEmit'], consumer);
  run(['exec', 'vue-tsc', '--noEmit'], consumer);
  run(['exec', 'svelte-check', '--tsconfig', './tsconfig.json'], consumer);
  run(['exec', 'vite', 'build'], consumer);
  const server = await serveConsumer(join(consumer, 'dist'));
  try { report.scenarios = await verifyConsumers(server.url); }
  finally { await server.close(); }
  report.status = 'passed';
}
catch (error) {
  failure = error;
  report.error = error instanceof Error ? error.message : String(error);
}
finally {
  await rm(temporary, { recursive: true, force: true });
  report.temporaryDirectoryRemoved = true;
  await mkdir(join(repository, 'artifacts'), { recursive: true });
  await writeFile(join(repository, 'artifacts/consumer-packages.json'), JSON.stringify(report, null, 2) + '\n');
}
if (failure) throw failure;
console.log(`Six isolated tarball packages and ${report.scenarios.length} production browser consumer scenarios passed. Report: artifacts/consumer-packages.json`);
