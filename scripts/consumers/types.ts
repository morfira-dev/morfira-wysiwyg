export interface PackageManifest {
  name: string;
  version: string;
}
export interface DependencyManifest extends PackageManifest {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
}
export interface ToolchainGraph {
  packages: string[];
  overrides: Record<string, string>;
  absentOptionalDependencies: string[];
  absentOptionalPeers: string[];
}
export interface PackedLibrary extends PackageManifest {
  folder: string;
  archive: string;
  sha256: string;
}
export interface InstalledLibrary extends PackageManifest {
  location: string;
}
export interface ConsumerScenario {
  adapter: 'vue' | 'react' | 'svelte';
  browser: string;
  browserVersion: string;
  userChanges: number;
}
export interface ConsumerReport {
  status: 'passed' | 'failed';
  node: string;
  pnpm: string;
  platform: string;
  packages: PackedLibrary[];
  installed: InstalledLibrary[];
  resolved: Record<string, string>;
  toolchain: Record<string, string>;
  rootLockfileSHA256?: string;
  toolchainGraph?: ToolchainGraph;
  installedToolchainGraph?: ToolchainGraph;
  scenarios: ConsumerScenario[];
  temporaryDirectoryRemoved: boolean;
  error?: string;
}
