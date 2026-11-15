import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyConsumers } from './browser.js';
import { serveConsumer } from './server.js';
import { collectToolchainGraph, installedManifest, installedToolchainRoots, readManifest } from './toolchain.js';
import type { ConsumerAdapter, ConsumerProfile, ConsumerReport, PackageManifest } from './types.js';

const repository = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const argumentsList = process.argv.slice(2).filter((argument) => argument !== '--');
assert.ok(argumentsList.every((argument) => argument === '--angular22'), 'Supported consumer option: --angular22');
const profile: ConsumerProfile = argumentsList.includes('--angular22') ? 'angular22' : 'default';
const toolchainDirectory = profile === 'angular22' ? join(repository, 'apps/angular22-consumer') : repository;
const toolchainOwner = join(toolchainDirectory, 'package.json');
const sourceInstalledRoot = await realpath(join(repository, 'node_modules'));
// Workspace root bindings can point into the shared .pnpm store; no other lookup escape is allowed.
const sourceLookupDirectories = profile === 'angular22' ? [join(toolchainDirectory, 'node_modules')] : [];
const reportName = profile === 'angular22' ? 'consumer-angular22.json' : 'consumer-packages.json';
const adapters: readonly ConsumerAdapter[] = profile === 'angular22' ? ['angular'] : ['vue', 'react', 'svelte', 'angular', 'web-component'];
if (profile === 'angular22') {
  const [major, minor, patch] = process.versions.node.split('.').map(Number);
  assert.ok((major === 22 && (minor > 22 || (minor === 22 && patch >= 3))) || (major === 24 && minor >= 15) || major === 26,
    'Angular 22 requires Node ^22.22.3, ^24.15.0 or ^26.0.0. Run pnpm with a supported Node executable.');
}
const rootManifest = JSON.parse(await readFile(join(repository, 'package.json'), 'utf8')) as { packageManager: string };
const pnpm = execFileSync('pnpm', ['--version'], { cwd: repository, encoding: 'utf8' }).trim();
assert.equal(`pnpm@${pnpm}`, rootManifest.packageManager, 'Use the repository-pinned pnpm version.');
const readInstalledVersion = async (name: string): Promise<string> => {
  const path = await installedManifest(name, toolchainOwner, sourceInstalledRoot, undefined, sourceLookupDirectories);
  assert.ok(path, `Cannot find installed tool: ${name}`);
  return (await readManifest(path)).version;
};
const angularTools = ['@angular/common', '@angular/compiler', '@angular/compiler-cli', '@angular/core', '@angular/forms', '@angular/platform-browser', '@angular/platform-server', 'rxjs', 'tslib', '@babel/core', '@types/babel__core'];
const sharedTools = ['vite', 'typescript', 'tsx', '@types/node', 'esbuild', ...angularTools];
const tools = profile === 'angular22' ? sharedTools : [...sharedTools, 'vue', 'react', 'react-dom', 'svelte', '@vitejs/plugin-vue', '@sveltejs/vite-plugin-svelte', 'vue-tsc', 'svelte-check', '@types/react', '@types/react-dom'];
const toolchain = Object.fromEntries(await Promise.all(tools.map(async (name) => [name, await readInstalledVersion(name)])));
const expectedAngular = profile === 'angular22' ? '22.' : '21.';
for (const name of angularTools.filter((name) => name.startsWith('@angular/')))
  assert.ok(toolchain[name].startsWith(expectedAngular), `${profile}: ${name} must resolve Angular ${expectedAngular.slice(0, -1)}, got ${toolchain[name]}.`);
assert.ok(toolchain.typescript.startsWith(profile === 'angular22' ? '6.' : '5.9.'), `${profile}: unexpected compiler ${toolchain.typescript}.`);
const report: ConsumerReport = {
  profile, toolchainSource: profile === 'angular22' ? 'apps/angular22-consumer' : 'repository',
  status: 'failed', node: process.version, pnpm, platform: `${process.platform}/${process.arch}`,
  packages: [], installed: [], resolved: {}, toolchain, scenarios: [], temporaryDirectoryRemoved: false,
};
const temporary = await mkdtemp(join(tmpdir(), `morfira-packed-consumer-${profile}-`));
const run = (args: string[], cwd: string) => {
  console.log(`Consumer check: pnpm ${args.join(' ')}`);
  execFileSync('pnpm', args, { cwd, stdio: 'inherit', env: { ...process.env, CI: 'true' } });
};
let failure: unknown;
try {
  report.rootLockfileSHA256 = createHash('sha256').update(await readFile(join(repository, 'pnpm-lock.yaml'))).digest('hex');
  const installationOverrides = new Map<string, string>();
  const toolchainGraph = await collectToolchainGraph(toolchainOwner, tools, sourceInstalledRoot, sourceLookupDirectories, installationOverrides);
  const toolchainDependencies = await installedToolchainRoots(toolchainOwner, tools, sourceInstalledRoot, sourceLookupDirectories);
  report.toolchainGraph = toolchainGraph;
  console.log(`Pinning ${toolchainGraph.packages.length} installed toolchain packages through ${Object.keys(toolchainGraph.overrides).length} version-qualified dependency edges.`);
  const archives = join(temporary, 'archives');
  const consumer = join(temporary, 'consumer');
  await mkdir(archives);
  await cp(join(repository, 'scripts/consumers/fixtures'), consumer, { recursive: true });
  for (const folder of ['core', 'plugins', 'vue', 'react', 'svelte', 'angular', 'web-component', 'wysiwyg']) {
    const directory = join(repository, 'packages', folder);
    const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')) as PackageManifest;
    run(['pack', '--pack-destination', archives], directory);
    const archive = join(archives, `${manifest.name.replace('@', '').replace('/', '-')}-${manifest.version}.tgz`);
    const sha256 = createHash('sha256').update(await readFile(archive)).digest('hex');
    report.packages.push({ name: manifest.name, version: manifest.version, folder, archive, sha256 });
  }
  const dependencies = Object.fromEntries(report.packages.map((entry) => [entry.name, `file:${entry.archive}`]));
  if (profile === 'default') {
    const minimal = join(temporary, 'core-only');
    await mkdir(minimal);
    await writeFile(join(minimal, 'package.json'), JSON.stringify({
      name: 'morfira-framework-free-consumer', private: true, type: 'module',
      packageManager: rootManifest.packageManager,
      dependencies: { '@morfira-dev/wysiwyg': dependencies['@morfira-dev/wysiwyg'] },
    }, null, 2) + '\n');
    const minimalOverrides = Object.entries(dependencies).map(([name, target]) => `  ${JSON.stringify(name)}: ${JSON.stringify(target)}`).join('\n');
    await writeFile(join(minimal, 'pnpm-workspace.yaml'), `packages: []\nlinkWorkspacePackages: false\npreferWorkspacePackages: false\nsaveExact: true\noverrides:\n${minimalOverrides}\n`);
    run(['install', '--offline', '--no-frozen-lockfile'], minimal);
    const minimalRoot = await realpath(join(minimal, 'node_modules'));
    for (const name of ['react', 'react-dom', 'vue', 'svelte', '@angular/core', '@angular/common', '@angular/forms']) {
      let present = false;
      try { await lstat(join(minimalRoot, ...name.split('/'))); present = true; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      assert.equal(present, false, `Core-only consumer unexpectedly installed framework binding ${name}.`);
    }
    const physicalPackages: PackageManifest[] = [];
    const inspectPackage = async (path: string) => {
      const physical = await realpath(path);
      assert.ok(physical.startsWith(minimalRoot + sep), `Core-only package escaped its isolated node_modules: ${physical}`);
      const installed = await readManifest(join(physical, 'package.json'));
      assert.ok(Object.hasOwn(dependencies, installed.name), `Core-only consumer unexpectedly installed external package ${installed.name}.`);
      const packed = report.packages.find((entry) => entry.name === installed.name)!;
      assert.equal(installed.version, packed.version);
      physicalPackages.push({ name: installed.name, version: installed.version });
    };
    const store = join(minimalRoot, '.pnpm');
    for (const entry of await readdir(store, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'node_modules') continue;
      const modules = join(store, entry.name, 'node_modules');
      for (const binding of await readdir(modules, { withFileTypes: true })) {
        if (!binding.isDirectory() || binding.name.startsWith('.')) continue;
        if (binding.name.startsWith('@')) {
          for (const scoped of await readdir(join(modules, binding.name), { withFileTypes: true })) {
            if (scoped.isDirectory()) await inspectPackage(join(modules, binding.name, scoped.name));
          }
        }
        else await inspectPackage(join(modules, binding.name));
      }
    }
    assert.deepEqual(physicalPackages.map((entry) => entry.name).sort(), report.packages.map((entry) => entry.name).sort(), 'Core-only consumer must install exactly the eight internal packages.');
    const probe = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '--eval', "import { createEditor } from '@morfira-dev/wysiwyg'; process.stdout.write(JSON.stringify({ type: typeof createEditor, browser: typeof window, path: import.meta.resolve('@morfira-dev/wysiwyg') }));"], { cwd: minimal, encoding: 'utf8' })) as { type: string; browser: string; path: string };
    assert.equal(probe.type, 'function');
    assert.equal(probe.browser, 'undefined');
    assert.ok((await realpath(fileURLToPath(probe.path))).startsWith(minimalRoot + sep), 'Core-only facade must resolve to its own installed tarball.');
    report.frameworkFreeCoreConsumer = true;
    report.frameworkFreeCorePackages = physicalPackages.sort((a, b) => a.name.localeCompare(b.name));
    report.frameworkFreeCoreFacade = probe.path;
    console.log('Framework-free facade consumer: exactly eight internal packages, no framework peers, Node import passed.');
  }
  const manifest = {
    name: 'morfira-isolated-consumer', private: true, type: 'module',
    packageManager: rootManifest.packageManager,
    dependencies, devDependencies: toolchainDependencies,
  };
  await writeFile(join(consumer, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  const overrides = Object.entries({ ...Object.fromEntries(installationOverrides), ...dependencies }).map(([name, target]) => `  ${JSON.stringify(name)}: ${JSON.stringify(target)}`).join('\n');
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
  const entries = ['@morfira-dev/wysiwyg', ...['vue', 'react', 'svelte', 'angular', 'web-component', 'plugins/tables', 'plugins/images', 'plugins/search', 'plugins/statistics', 'plugins/markdown', 'plugins/autolink', 'plugins/fonts', 'plugins/list-properties', 'plugins/text-direction', 'plugins/horizontal-rule', 'plugins/checklists', 'plugins/mentions', 'plugins/slash', 'plugins/suggestions', 'ui/links', 'ui/images', 'ui/search', 'presets/minimal', 'presets/standard', 'presets/extended', 'ui/editor', 'ui/standard', 'ui/extended', 'style.css', 'plugins/tables.css', 'plugins/suggestions.css', 'plugins/checklists.css', 'ui/forms.css', 'ui/editor.css'].map((path) => `@morfira-dev/wysiwyg/${path}`)];
  report.resolved = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '--eval', `process.stdout.write(JSON.stringify(Object.fromEntries(${JSON.stringify(entries)}.map((entry) => [entry, import.meta.resolve(entry)]))))`], { cwd: consumer, encoding: 'utf8' })) as Record<string, string>;
  for (const [entry, target] of Object.entries(report.resolved)) {
    assert.ok((await realpath(fileURLToPath(target))).startsWith(installedRoot + sep), `${entry}: public export must resolve inside installed artifacts`);
  }
  if (profile === 'default') {
    run(['exec', 'tsc', '--noEmit'], consumer);
    run(['exec', 'vue-tsc', '--noEmit'], consumer);
    run(['exec', 'svelte-check', '--tsconfig', './tsconfig.json'], consumer);
  }
  run(['exec', 'ngc', '-p', 'tsconfig.angular.json'], consumer);
  run(profile === 'angular22' ? ['exec', 'vite', 'build', '--config', 'vite.angular.config.ts'] : ['exec', 'vite', 'build'], consumer);
  const server = await serveConsumer(join(consumer, 'dist'));
  try { report.scenarios = await verifyConsumers(server.url, adapters); }
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
  await writeFile(join(repository, 'artifacts', reportName), JSON.stringify(report, null, 2) + '\n');
}
if (failure) throw failure;
console.log(`Eight isolated tarball packages and ${report.scenarios.length} production browser consumer scenarios passed (${profile}). Report: artifacts/${reportName}`);
