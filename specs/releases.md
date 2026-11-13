# Independent automated package releases

Status: requested implementation. Supersedes the Changesets workflow after the user explicitly requested semantic-release and upload to `morfira-dev/morfira-wysiwyg`.

- Keep six independently versioned MIT library workspaces and the existing public subpath API. The documentation workspace stays private.
- Use semantic-release with multi-semantic-release for file-based commit attribution, independent `<package-name>@<version>` tags, release notes and coordinated internal dependency updates. Release dependent packages with the highest dependency release type to propagate breaking API changes. Pin the release tooling versions in the lockfile; all tooling is development-only.
- Conventional Commits: `fix`/`perf` produce patch, `feat` produces minor, `break` produces major (for example `break(core): change document schema`); standard `!`/`BREAKING CHANGE` markers are also recognized. Docs/tests/chore alone do not release a library. A commit touching multiple libraries affects each. The first automated release without existing release tags is `1.0.0` according to semantic-release; repository versions are development placeholders until a release. The first release does not assert complete feature parity or accessibility.
- CI checks builds, types, budgets, all three editor browsers, bilingual docs and live docs examples. Publication follows successful checks on `main`, with a concurrency lock and full git history. PRs never publish.
- Use GitHub Actions OIDC trusted publishing, scoped public packages, provenance, `contents: write` and `id-token: write`. Do not print credentials or require a permanent npm token. No documentation deployment.
- Activate automatic npm publication with repository variable `NPM_PUBLISH_ENABLED=true` only once all six npm package trusted-publisher bindings exist for owner `morfira-dev`, repository `morfira-wysiwyg`, workflow `release.yml`. Prior to activation, CI and a credential-free release plan run, with publication explicitly skipped. npm ownership/configuration is an external prerequisite, not a passing local check.
- New npm names may need a first manual/token-backed publication before npm allows configuring trust. Document the supported bootstrap procedure honestly; do not claim npm is configured solely because workflow YAML exists.
- A dry-run reports candidate versions and dependency bumps without publishing, pushing tags, or creating GitHub releases. Exercise a disposable git fixture with changed packages, dependent packages, documentation-only commits and breaking changes. Pack artifacts must contain usable public exports, declarations, MIT notices, and no development-only files.
- Initial upload preserves any remote history; inspect the remote before writing and never force-push. The user explicitly authorized upload and release setup; package publication still depends on npm trust activation.

## Workspace tooling

Use pnpm 11.0.7, matching morfira-ui, with `pnpm-workspace.yaml` and a committed `pnpm-lock.yaml`. CI uses frozen-lockfile installation. Link local packages through `linkWorkspacePackages: true` while keeping ordinary compatible dependency ranges for coordinated semantic-release. pnpm manages the monorepo; the semantic-release npm plugin uses its own npm CLI for registry publication/OIDC. Do not keep an npm package lock.

## npm scope correction

The user corrected the npm organization to `@morfira-dev` before publication. Rename all six library packages and their internal dependency/peer ranges, workspace consumers, build externals, tests and bilingual examples to this scope. The public facade is `@morfira-dev/wysiwyg` with the same `/vue`, `/react`, `/svelte`, `/plugins/tables` and CSS subpaths. No packages have been published under the previous scope; no compatibility aliases are required. GitHub owner/repository and OIDC workflow identity remain `morfira-dev/morfira-wysiwyg` and `release.yml`. Acceptance: frozen pnpm install, builds/exports/declarations, all browser and docs tests, and release planning must resolve only the corrected scope.
