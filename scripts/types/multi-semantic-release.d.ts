declare module 'multi-semantic-release' {
  import type { Options } from 'semantic-release';
  interface PackageResult {
    name: string;
    result?: false | { nextRelease: { version: string; type: string } };
  }
  const multiRelease: (
    paths: string[],
    options?: Options,
    settings?: { cwd?: string; env?: NodeJS.ProcessEnv; stdout?: NodeJS.WriteStream; stderr?: NodeJS.WriteStream },
    flags?: { sequentialInit?: boolean; ignorePrivatePackages?: boolean; deps: { bump: 'override'; release: 'inherit'; prefix: '^' } },
  ) => Promise<PackageResult[]>;
  export default multiRelease;
}
