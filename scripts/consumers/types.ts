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
export type ConsumerAdapter = 'vue' | 'react' | 'svelte' | 'angular' | 'web-component';
export type ConsumerProfile = 'default' | 'angular22';
export interface ConsumerScenario {
  adapter: ConsumerAdapter;
  browser: string;
  browserVersion: string;
  userChanges: number;
  uiForms: true;
  sdk: true;
  preset: 'extended';
  readyUI: true;
}
export interface ConsumerReport {
  profile: ConsumerProfile;
  toolchainSource: string;
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
  frameworkFreeCoreConsumer?: boolean;
  frameworkFreeCorePackages?: PackageManifest[];
  frameworkFreeCoreFacade?: string;
  scenarios: ConsumerScenario[];
  temporaryDirectoryRemoved: boolean;
  error?: string;
}
