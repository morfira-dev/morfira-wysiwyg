# Testing and releases

## Local checks

`AGENTS.md`, `skills/morfira-sdd/SKILL.md`, and `specs/` define specification-driven changes. `pnpm run check:project` checks source conventions, licenses and runtime boundaries.

```sh
pnpm install
pnpm exec playwright install chromium firefox webkit
pnpm run check
pnpm run docs:build
```

`check` runs TypeScript/Svelte checks, package builds and size budgets, then browser tests. Browser tests use the built public package exports, not source aliases. `pnpm test --project=chromium` is useful for a focused local run. Browser downloads are development-only.

Coverage includes text formatting and undo/redo, HTML sanitization at import/paste/export, replacing selected text, table insertion and structural operations, merge/split and document round-trips, read-only mode, disposal, and all three adapters' value/event/lifecycle behavior. React is mounted in StrictMode. This is behavioral coverage, not a claim of 100% source coverage.

New features should add real document scenarios: cross-cell paste, irregular rowspan/colspan, IME composition, large documents, keyboard boundary behavior, external clipboard fixtures, mobile/touch, accessibility, and memory lifecycle. Regression fixtures should be sanitized and contain no customer data.

## Automated semantic releases

The six library workspaces have independent versions. semantic-release analyzes Conventional Commits for each package's changed files. multi-semantic-release coordinates internal dependency versions and propagates the highest dependency release type to dependent packages. The documentation app stays private.

- `fix(core): ...`, `perf(core): ...` — patch.
- `feat(plugins): ...` — minor.
- `break(core): ...` — the explicit major marker, including dependent adapters and the public facade. Standard `feat(core)!: ...` and `BREAKING CHANGE: ...` footers are also recognized.
- Documentation, test and chore commits alone do not release a library.

Commit scopes help readers; changed files determine affected packages. Tags use `@morfira-dev/wysiwyg-core@1.0.0`, `@morfira-dev/wysiwyg@1.0.0`, and the other package names. Without existing release tags, semantic-release starts at `1.0.0`. After a successful release, source versions and internal dependency ranges are synchronized with the published packages in one service commit. This does not promise full feature parity with mature editors.

```sh
pnpm run test:release
pnpm run release:plan
```

Planning publishes nothing, pushes no tags, creates no GitHub Release and needs no npm credentials. Actual releases include GitHub release notes. `pnpm run release` runs only inside GitHub Actions after checks. After all packages publish successfully, the release job refreshes `pnpm-lock.yaml` with `pnpm install --lockfile-only --ignore-scripts --no-frozen-lockfile` and saves manifests and lockfile in one `chore(release): sync package versions [skip ci]` commit authored by github-actions[bot]. It pushes with GITHUB_TOKEN without force. This push does not trigger another workflow; the `chore` type also produces no release on a manual rerun. Dry runs, publication failures and no-release runs create no commits. If main has advanced, the push is rejected; published versions are preserved.

## GitHub Actions and npm OIDC

`release.yml` runs on main pushes and manual dispatch. It first calls the complete Check workflow: Chromium/Firefox/WebKit editor tests, types, builds, budgets, documentation and demos. It then uploads a `release-plan` artifact. Publication requires repository variable `NPM_PUBLISH_ENABLED=true`; without it, checks and planning run successfully and publishing is skipped. PRs never publish packages. The documentation site remains local.

For **each** package (`@morfira-dev/wysiwyg-core`, `@morfira-dev/wysiwyg-plugins`, `@morfira-dev/wysiwyg-vue`, `@morfira-dev/wysiwyg-react`, `@morfira-dev/wysiwyg-svelte`, `@morfira-dev/wysiwyg`), add GitHub Actions under npm → Settings → Trusted publishing:

| Field | Value |
| --- | --- |
| Organization/user | `morfira-dev` |
| Repository | `morfira-wysiwyg` |
| Workflow filename | `release.yml` |
| Environment | leave empty |
| Allowed action | `npm publish` |

The workflow grants `id-token: write` and `contents: write`, with no permanent `NPM_TOKEN`. Public packages from this public repository get provenance. Do not set setup-node registry-url: the semantic-release npm plugin manages authentication. [Official npm instructions](https://docs.npmjs.com/trusted-publishers/).

If npm does not allow trust configuration for a new package name, its scope owner must publish initial packages once interactively with 2FA. After `pnpm run build` and `npm login`, run these commands in order:

```sh
pnpm --filter @morfira-dev/wysiwyg-core publish --access public
pnpm --filter @morfira-dev/wysiwyg-plugins publish --access public
pnpm --filter @morfira-dev/wysiwyg-vue publish --access public
pnpm --filter @morfira-dev/wysiwyg-react publish --access public
pnpm --filter @morfira-dev/wysiwyg-svelte publish --access public
pnpm --filter @morfira-dev/wysiwyg publish --access public
```

This really publishes `0.2.0`; it is not a check and should run only when ready to release. Then configure all six trusted publishers, enable the repository variable and run Release. The first automated `1.0.0` release updates internal dependencies. Do not create fictional release tags before publishing. Newly configured npm trust must complete a successful publish within 2 days; recreate an expired binding. Local tests cannot verify npm access or a successful OIDC publication.

The OIDC publish job explicitly installs npm CLI `11.21.2`: npm 10 bundled with Node.js 22 cannot publish this way. Before creating tags, the script checks npm >=11.5.1 and GitHub OIDC availability. pnpm remains the workspace manager. A failure after tag creation may leave that version absent from npm: verify the registry, do not treat a tag as proof of publication, and do not remove published versions.

`pnpm run check` also runs `check:tree-shaking`: real public consumer imports must not retain unrelated plugins, framework runtimes or mandatory CSS. Source checks enforce feature-owned named types and core dependency direction.

Explicit package integration: `pnpm run consumers:check` after build. Observational [performance/history benchmarks](/en/performance): `pnpm run benchmark`; not part of the normal timing-free correctness gate.
