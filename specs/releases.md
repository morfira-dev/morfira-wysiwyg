# Independent automated package releases

Status: requested implementation. Supersedes the Changesets workflow after the user explicitly requested semantic-release and upload to `morfira-dev/morfira-wysiwyg`.

- Keep six independently versioned MIT library workspaces and the existing public subpath API. The documentation workspace stays private.
- Use semantic-release with multi-semantic-release for file-based commit attribution, independent `<package-name>@<version>` tags, release notes and coordinated internal dependency updates. Release dependent packages with the highest dependency release type to propagate breaking API changes. Pin the release tooling versions in the lockfile; all tooling is development-only.
- Conventional Commits: `fix`/`perf` produce patch, `feat` produces minor, `break` produces major (for example `break(core): change document schema`); standard `!`/`BREAKING CHANGE` markers are also recognized. Docs/tests/chore alone do not release a library. A commit touching multiple libraries affects each. The first automated release without existing release tags is `1.0.0` according to semantic-release; repository versions are synchronized after successful releases. The first release does not assert complete feature parity or accessibility.
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

## OIDC runtime and interrupted first release

Publish jobs explicitly install npm CLI 11.21.2 (Node 22 already meets its engine requirement). pnpm remains the workspace manager. Before semantic-release can create tags, the live entry point must reject npm below 11.5.1 or missing GitHub OIDC request URL/token; dry-run planning remains credential-free. Test the minimum supported npm version, older/malformed versions and missing OIDC permissions.

The initial failed publication left core and Vue 1.0.0 tags but no corresponding npm versions. Preserve these tags and published 0.2.0 packages. Correct the public package descriptions in both manifests in the recovery fix so semantic-release produces patch versions for those packages, with coordinated internal dependencies; other packages keep their normal independent release calculation. Do not delete tags or unpublish packages. Verify all six registry versions after the recovery workflow.

## Persisting successful release state

After all packages in a live multirelease finish successfully, persist the updated public package manifests and `pnpm-lock.yaml` in exactly one commit on `main`. Refresh the lockfile with pnpm 11.0.7 using lockfile-only installation, ignored lifecycle scripts and explicitly disabled frozen mode. No runtime dependencies are added.

- The release entry point calls persistence only after the awaited multirelease succeeds and at least one package was released. Dry runs, failed/partial releases and no-release runs do not commit or push.
- Persist only tracked public `packages/*/package.json` manifests and the root lockfile. Preserve unrelated modifications; reject a pre-staged index, unexpected source HEAD, or non-main branch before persistence.
- Commit as github-actions[bot] with `chore(release): sync package versions [skip ci]`. Push using the existing checkout GITHUB_TOKEN and a normal fast-forward-only push to main; never force, rebase or overwrite concurrent work. If the branch advanced during release, fail visibly so the already published state can be reconciled separately.
- GitHub skips push workflows for GITHUB_TOKEN commits; `[skip ci]` also prevents push CI when another authorized transport is used. Conventional Commits treats the service commit as non-releasing even if someone manually dispatches Release later.
- No version changes means no empty commit/push. Package release tags remain on the source commit that produced the published artifacts.
- Initially align the checked-in manifests/internal ranges with the six already published package versions in the implementation's non-releasing chore commit, and refresh the lockfile. Future releases persist their own results automatically.

Acceptance: a disposable real Git/pnpm workspace receives new core/adapter versions and all internal ranges plus a valid frozen lockfile in exactly one pushed service commit; unrelated source changes are excluded. A subsequent semantic-release plan has no releases. Re-running persistence creates no commit. Existing staged changes, a wrong branch/HEAD and concurrent remote changes are rejected without overwriting the remote. Publication failure and dry-run keep persistence disabled.
