import assert from 'node:assert/strict';
import { readFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve, sep } from 'node:path';
import type { DependencyManifest, ToolchainGraph } from './types.js';

/** Ignore loader/global fallbacks and keep peer-only bindings in their owning PNPM context. */
export const installedManifest = async (name: string, owner: string, installedRoot: string, peerOwnerName?: string, lookupDirectories: readonly string[] = []): Promise<string | undefined> => {
  const physicalOwner = await realpath(owner);
  const packageRoot = dirname(physicalOwner);
  let peerContext = packageRoot;
  if (peerOwnerName) {
    for (const _part of peerOwnerName.split('/')) peerContext = dirname(peerContext);
  }
  for (const directory of createRequire(physicalOwner).resolve.paths(name) ?? []) {
    const candidate = resolve(directory);
    if (candidate !== installedRoot && !candidate.startsWith(installedRoot + sep) && !lookupDirectories.includes(candidate)) continue;
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
export const readManifest = async (path: string): Promise<DependencyManifest> => JSON.parse(await readFile(path, 'utf8')) as DependencyManifest;
export const collectToolchainGraph = async (owner: string, roots: string[], installedRoot: string, lookupDirectories: readonly string[] = []): Promise<ToolchainGraph> => {
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
    const path = await installedManifest(name, owner, installedRoot, undefined, lookupDirectories);
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
    for (const name of Object.keys(dependencies)) {
      const selector = `${parent}>${name}`;
      const peerOnly = Object.hasOwn(peers, name) && !Object.hasOwn(required, name) && !Object.hasOwn(optional, name);
      const childPath = await installedManifest(name, path, installedRoot, peerOnly ? manifest.name : undefined, lookupDirectories);
      if (!childPath) {
        if (Object.hasOwn(optional, name)) {
          // Preserve the source graph's absence without resolving another platform's package.
          pin(selector, '-');
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
