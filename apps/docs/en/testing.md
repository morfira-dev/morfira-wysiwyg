# Testing and releases

Composition tests use `compositionstart`, intermediate `beforeinput`/`input`, `compositionend` and trailing composition input sequences with explicit DOM changes. They check Unicode, history, selection, external replacement, read-only and plugin candidate-confirmation guards. Synthetic events do not start a system IME: Japanese/Chinese/Korean candidate windows and mobile keyboards remain manual checks. Ordinary-block Enter/Shift+Enter and Backspace/Delete boundaries additionally use real browser keyboard input.

## Local checks

`AGENTS.md`, `skills/morfira-sdd/SKILL.md`, and `specs/` define specification-driven changes. `pnpm run check:project` checks source conventions, licenses and runtime boundaries.

```sh
pnpm install
pnpm exec playwright install chromium firefox webkit
pnpm run check
pnpm run docs:build
```

`check` runs TypeScript/Svelte checks, package builds and size budgets, then browser tests. Browser tests use the built public package exports, not source aliases. `pnpm test --project=chromium` is useful for a focused local run. Browser downloads are development-only.

Coverage includes text formatting and undo/redo, HTML sanitization at import/paste/export, replacing selected text, table insertion and structural operations, merge/split and document round-trips, read-only mode, localization, disposal, and Vue/React/Svelte/Angular/Web Component value/event/lifecycle behavior. React is mounted in StrictMode. This is behavioral coverage, not a claim of 100% source coverage.

New features should add real document scenarios: cross-cell paste, irregular rowspan/colspan, IME composition, large documents, keyboard boundary behavior, external clipboard fixtures, mobile/touch, accessibility, and memory lifecycle. Regression fixtures should be sanitized and contain no customer data.

## Automated semantic releases

The eight library workspaces have independent versions: core, plugins, vue, react, svelte, angular, web-component and the public facade. semantic-release analyzes Conventional Commits for each package's changed files. multi-semantic-release coordinates internal dependency versions and propagates the highest dependency release type to dependent packages. The documentation app stays private.

- `fix(core): ...`, `perf(core): ...` — patch.
- `feat(plugins): ...` — minor.
- `break(core): ...` — the explicit major marker, including dependent adapters and the public facade. Standard `feat(core)!: ...` and `BREAKING CHANGE: ...` footers are also recognized.
- Documentation, test and chore commits alone do not release a library.

Commit scopes help readers; changed files determine affected packages. Tag format examples are `@morfira-dev/wysiwyg-core@1.0.0`, `@morfira-dev/wysiwyg@1.0.0`, and the other package names. Release history is determined per name: a new package without a recognized release tag defaults to an initial `1.0.0` plan; existing packages continue their own versions. Do not infer every package version from a single global "first release". After a successful release, source versions and internal dependency ranges are synchronized with the published packages in one service commit. This does not promise full feature parity with mature editors.

```sh
pnpm run test:release
pnpm run release:plan
```

Planning publishes nothing, pushes no tags, creates no GitHub Release and needs no npm credentials. Actual releases include GitHub release notes. `pnpm run release` runs only inside GitHub Actions after checks. After all packages publish successfully, the release job refreshes `pnpm-lock.yaml` with `pnpm install --lockfile-only --ignore-scripts --no-frozen-lockfile` and saves manifests and lockfile in one `chore(release): sync package versions [skip ci]` commit authored by github-actions[bot]. It pushes with GITHUB_TOKEN without force. This push does not trigger another workflow; the `chore` type also produces no release on a manual rerun. Dry runs, publication failures and no-release runs create no commits. If main has advanced, the push is rejected; published versions are preserved.

## GitHub Actions and npm OIDC

`release.yml` runs on main pushes and manual dispatch. It first calls the complete Check workflow: Chromium/Firefox/WebKit editor tests, types, builds, budgets, documentation and demos. It then uploads a `release-plan` artifact. Publication requires repository variable `NPM_PUBLISH_ENABLED=true`; without it, checks and planning run successfully and publishing is skipped. PRs never publish packages. The documentation site remains local.

For **each** of the eight names (`@morfira-dev/wysiwyg-core`, `@morfira-dev/wysiwyg-plugins`, `@morfira-dev/wysiwyg-vue`, `@morfira-dev/wysiwyg-react`, `@morfira-dev/wysiwyg-svelte`, `@morfira-dev/wysiwyg-angular`, `@morfira-dev/wysiwyg-web-component`, `@morfira-dev/wysiwyg`), add GitHub Actions under npm → Settings → Trusted publishing:

| Field | Value |
| --- | --- |
| Organization/user | `morfira-dev` |
| Repository | `morfira-wysiwyg` |
| Workflow filename | `release.yml` |
| Environment | leave empty |
| Allowed action | `npm publish` |

The workflow grants `id-token: write` and `contents: write`, with no permanent `NPM_TOKEN`. Public packages from this public repository get provenance. Do not set setup-node registry-url: the semantic-release npm plugin manages authentication. [Official npm instructions](https://docs.npmjs.com/trusted-publishers/).

If npm does not allow trust configuration for a new name, its scope owner can publish **only that not-yet-published name** once interactively with 2FA. First inspect its current package.json version and npm name/version availability; do not republish existing packages. For example, after `pnpm run build` and `npm login`, select the relevant command only for a new Angular or Web Component name:

```sh
# Only if this name has not been published:
pnpm --filter @morfira-dev/wysiwyg-angular publish --access public
# Separately, only if this name has not been published:
pnpm --filter @morfira-dev/wysiwyg-web-component publish --access public
```

This really publishes **the current manifest version**; it is not a dry-run. Run it only when intending to release the selected new package. Then configure that name's trusted publisher, verify the other packages' bindings, enable the repository variable and run Release. The automated plan shows each package's version and coordinated internal dependencies. Do not create fictional release tags before publishing. Recreate expired npm bindings using the current npm instructions. Local tests cannot verify npm access or a successful OIDC publication.

The OIDC publish job explicitly installs npm CLI `11.21.2`. Before creating tags, the script checks npm >=11.5.1 and GitHub OIDC availability. pnpm remains the workspace manager. A failure after tag creation may leave that version absent from npm: verify the registry, do not treat a tag as proof of publication, and do not remove published versions.

`pnpm run check` also runs `check:tree-shaking`: real public consumer imports must not retain unrelated plugins, framework runtimes or mandatory CSS. Source checks enforce feature-owned named types and core dependency direction.

Explicit package integration after build: `pnpm run consumers:check` targets eight tarballs and fifteen baseline scenarios; `pnpm run consumers:angular22` adds three Angular 22 scenarios with its separate TypeScript toolchain. Use a compatible Node 24.15+ or Node 22.22.3+ on the 22 branch for the second profile; obtaining its toolchain may require network access and does not change the root lockfile. These numbers describe tooling coverage; each run's reports record its actual results. Observational [performance/history benchmarks](/en/performance): `pnpm run benchmark`; not part of the normal timing-free correctness gate.
