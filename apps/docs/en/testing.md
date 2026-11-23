# Testing and releases

## Authoring tools — 23 November 2026

New authoring tools add object navigation, paragraph layout/format painter and code blocks. Focused evidence is staged: 57/57 navigation/text-tool executions, 39/39 code and 15/15 security executions in three browsers; RU/EN demos/homepage passed 8/8 in Chromium. Builds, types, selective imports and focused real-tarball smoke passed. Full suites and CI were not run. Standard with the tools uses 83305 gzip JS bytes and 19913 raw CSS bytes. Syntax highlighting is an external preview; nested object navigation and universal structural mapping are not claimed.

## Current budget policy — 23 November 2026

After the runs recorded below, the user raised Standard to **90000 gzip JS bytes**.
The last measured maximum of 79961 leaves **10039 bytes** of allowance. This changes
the guard, not the bundle or test evidence. Historical results retain their original
limits. Physical devices and screen readers are unavailable; this is an evidence
limitation, not a next task or release requirement.

## Quote/list boundaries and bundle reserve — 23 November 2026

Focused browser checks passed **579/579**, with a separate **3/3** React StrictMode
case. Affected RU/EN examples passed **12/12** and the new homepage mount case
**1/1**. Builds/types, archive/selective-import guards and focused tarball smoke
passed. Full suites and GitHub CI were not run.

[Quote input demo](/en/list-quote-input) shows native Backspace/Delete joins and
branch barriers. All size guards pass: standard ready 72638 gzip JS bytes, standard
with table properties 79961/80000 and extended 89488. The 39-byte reserve remains
very tight; a substantial reserve is not achieved. No feature or validation was
removed and no budget/compression setting changed.

## Accessibility and responsive UI — 23 November 2026

The focused run passed **135/135** in Chromium, Firefox and WebKit; built RU/EN
examples passed **8/8** in Chromium. Types, builds, selected-import guards,
archives and the focused actual-tarball UI smoke passed. The set covers toolbar
roving focus, native keys, computed contrast, forced colors, coarse-pointer sizes,
short native dialogs and narrow search containers inside wide windows.

The [public laboratory](/en/accessibility) separates desktop automation and touch
emulation from physical devices and screen readers. Actual iOS/Android, OS IME,
VoiceOver/NVDA/JAWS/TalkBack and native zoom remain unverified. Full suites and
GitHub CI were not run. Core JS is unchanged at 32383 gzip bytes; standard ready
is 72279 and extended ready 89125, with all existing guards preserved.

## Extension SDK and Office corpus — 23 November 2026

The final focused run passed **267/267** in Chromium, Firefox and WebKit and
**6/6** RU/EN documentation examples in Chromium. It covers mapping/history,
nodes/atoms, external node views, decorations, the real Office corpus and affected
transactions/links. Types, builds, archives, selective imports and tarball consumers
passed. This is the changed features' focused set, not a full-suite rerun.

Universal structural mapping, editable contentDOM and widget decorations are not
implemented. Word/Excel use pinned upstream captures; the fresh Google Docs payload
came from native Cmd+C and editor checks replay its saved MIME through paste events.
See the [Office guide](/en/office-paste) for provenance and losses.


## Focused SDK verification — 23 November 2026

The new `editor.selection` API and link-form integration passed **156/156** focused
checks in Chromium, Firefox and WebKit. RU/EN SDK examples and affected forms
passed **12/12** in Chromium. Builds, types, archives, tree shaking and size guards
passed; a separate actual-tarball consumer verified public types and behavior.
Core overhead is **904 gzip bytes**, with no new runtime dependencies.

This is the current stage's focused run, not a repeat of the full suite below.
General node views, decorations and position mapping are not implemented yet.


## Complete local verification — 20 November 2026

The fresh local run passed **4714 editor/adapter executions** in Chromium,
Firefox and WebKit. Two existing skips avoid repeating the same browser-independent
Node Markdown-codec process check; that check passed in the Chromium project.
There were no failed or flaky results. All **247 RU/EN documentation checks**,
**15 installed-consumer scenarios** across five adapters, the separate **3 Angular
22 scenarios**, and **15 release-tooling tests** passed. Static checks, declarations,
archive exports, selective imports and bundle guards also passed.

This confirms the automated scenarios on the checked local source, without a
claim of complete Office fidelity, real-device IME, physical OS color-picker or
screen-reader certification. It does not establish GitHub CI or npm publication.
The public guides' current status links refer to this run; older dated checkpoints
below retain their historical scope.


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

`release.yml` runs on main pushes and manual dispatch. The complete Check workflow covers Chromium/Firefox/WebKit editor tests, types, builds, budgets, documentation and demos; an independent dry-run uploads the `release-plan` artifact in parallel. Browser jobs use the official Playwright container matching the frozen lockfile version: browsers and system libraries are already included, with no separate apt installation. Every scenario remains mandatory: four Chromium, six Firefox and four WebKit shards, two documentation shards and both consumer profiles. Publication waits for successful Check and planning jobs and restores the checked builds for the same commit from the current workflow without rebuilding. The complete-cycle target is seven minutes; actual time also depends on GitHub queues and external service availability and is recorded from a real run. Publication requires repository variable `NPM_PUBLISH_ENABLED=true`; without it, checks and planning run successfully and publishing is skipped. PRs never publish packages. The documentation site remains local.

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


## Optional Telegram notification

After successful live publication and version persistence, the workflow can send **one aggregate message listing the package names and versions actually released** through `@nuykon/semantic-release-tg-bot`. The plugin is a release-tooling devDependency, outside editor core/plugins and browser bundles. Private tooling requires Node 22.20.0 or newer.

The message groups changes by package: each version lists commit subjects with their labels (`feat(core)`, `fix(plugins)`, `perf`, `break`, and `!` for breaking changes) and links to the exact commits. Each package uses its own directory and release range; a dependent adapter does not inherit the core package's commit list. Releases caused only by internal dependency updates say so explicitly. Commit bodies, authors and generated version-sync commits are excluded. Large releases use shorter previews, omitted-change counts and a link to each package's complete release notes. Space is shared across packages so one long changelog cannot displace the other versions. No additional secrets are required.

In repository Settings → Secrets and variables → Actions, configure:

| Secret | Purpose |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Your bot token |
| `TELEGRAM_CHAT_ID` | Recipient’s numeric chat ID or a channel’s `@username` |
| `TELEGRAM_BOT_PROXY` | Optional proxy in the format supported by the plugin |

For a private message, open the bot and send `/start` first: a bot cannot initiate a private conversation. Obtain the numeric ID from an update’s `message.chat.id` in your own Bot API client; a user’s username is not a replacement for that ID. A channel can use its `@username` when the bot has permission to publish. Keep the token, private chat ID and proxy credentials out of source, command arguments and logs; use secrets. Missing required secrets skip notification without blocking npm publication.

The existing `release-plan.json` remains a plan, not proof of publication. The CLI removes separate `release-published.json` before release/planning and writes it only after successful actual publication, the version-persistence service commit and plan write. The report contains the source SHA before that commit, GitHub run ID/attempt and only released package/version pairs. The sender checks this provenance against the current workflow. Dry runs, no-release runs and publication/persistence failures send no success message. A rerun without newly released packages sends nothing either.

The separate `release:notify` step follows release instead of running in per-package semantic-release hooks. Only this step has continue-on-error and a two-minute timeout: a Telegram failure neither undoes published npm packages nor turns publication into a notification error. Failure to write the optional report warns; inability to remove a stale report is detected before publication. Transport-level exactly-once delivery after an ambiguous timeout is not guaranteed; no persistent deduplication service is added. Telegram secrets are scoped to the notification step, not planning.

**Verified on November 18, 2026:** [GitHub run 44336166347](https://github.com/morfira-dev/morfira-wysiwyg/actions/runs/44336166347) passed the complete gate, published eight packages, persisted versions and the lockfile, and received Telegram API confirmation for the combined notification. This verifies the credentials and recipient access used in that run, not human readership or an independent proxy test. No local tests or builds were run for integration/CI correction, as requested by the user. Documentation hosting remains local.
