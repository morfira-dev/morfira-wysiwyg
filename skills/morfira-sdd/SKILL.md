---
name: morfira-sdd
description: Implement or revise Morfira WYSIWYG behavior from project specifications, keeping its independent TypeScript engine, document contracts, adapters, tests, and bilingual documentation aligned. Use for changes in this repository rather than unrelated editor projects.
---

# Morfira specification-driven development

Read the repository's `AGENTS.md` and the relevant feature specification in `specs/`. For engine/document changes start with `specs/editor.md`; table operations additionally use `specs/tables.md`.

Before implementation, describe the requested observable behavior and acceptance scenarios in the relevant spec. Preserve the user's scope; a spec is not permission to publish, perform Git operations, or expand dependencies. Resolve routine choices within existing authorization without adding approval gates.

Implement original, strict TypeScript using `const` arrow functions. Core/plugins have no runtime dependencies; framework adapters declare peers. Use a typed versioned document schema and per-instance plugins. Do not introduce external editor implementations or hide third-party attribution. New code uses MIT.

The approved arrow-method exception is limited to Web Component prototype lifecycle callbacks (`connectedCallback`, `disconnectedCallback`, `attributeChangedCallback`), which the platform discovers on the prototype. Keep them as small delegates; other logic remains arrow functions. Imports must not register a global custom element automatically.

For structural work, follow `specs/code-organization.md`: feature-owned folders, explicit entrypoints, adjacent named types, styles/helpers with their owner and stable public names/subpaths. Keep core small; optional modules and application-owned plugins provide extensions. Per-editor cooperation must preserve validation, transaction, read-only and cleanup boundaries.

Provide essential editing and useful built-in plugins ready to use while retaining selective imports and tree-shaking. Follow `specs/roadmap.md`: approach mature editors in common authoring tasks and prove improvements through comparable feature profiles, supported behavior, UI, documentation and measured size. Do not claim universal superiority, chase enterprise/office-suite parity or require consumers to implement ordinary editing from scratch. Heavy workflows remain explicitly requested optional integrations. Typed per-editor events carry lifecycle/custom notifications, not RPC commands; document ownership and automatic cleanup. Keep named types in owner type files and lifecycle code readable rather than packed into one-line setup/disposal blocks.

P1–P3 behavior presets and U1/U2 modern UI are implemented locally under `specs/editor-presets.md` and `specs/editor-ui.md`. The U3a slice adds explicit opt-in group-priority overflow, preserving wrap by default. Report final validation from actual runs; U3b contextual text formatting is implemented through a separate explicit opt-in entry under `specs/contextual-toolbar.md`, with actual current and historical validation distinguished in the verification backlog. The independent U3c caret/selected-link slice follows `specs/contextual-links.md`, reusing the validated link form and requiring explicit safe Open/lifecycle verification. The independent U3d image-properties slice follows `specs/contextual-images.md` and the edit-only form contract in `specs/ui-forms.md`. The independent U3e table slice follows `specs/contextual-tables.md`, including a selective observational query, typed notifications and owned external controls. U3c also supports text ranges wholly inside one ordinary link; mixed/cross-link ranges and whole-figure/caption-caret contexts remain future slices; standard/extended presets do not implicitly install contextual UI.

The independent Markdown import/export codec follows `specs/markdown-codec.md` through `/codecs/markdown`, separate from `/plugins/markdown` typing shortcuts. Keep it DOM-free, bounded, safe and absent from core/preset closures. Document lossy formatting and rejected structures explicitly; do not claim full CommonMark/GFM conformance.

Persistent mention references follow `specs/persistent-mentions.md`. They are opt-in editable semantic spans by default; `specs/atomic-mentions.md` adds an explicit mention-specific atomic navigation/deletion profile; preserve IDs through registered HTML/JSON, retain search/suggestion ownership barriers and distinguish display labels from backend-authorized identity.

Atomic reference clipboard follows `specs/atomic-mention-clipboard.md`: bounded
same-flow, ordinary sibling-block and supported consecutive list-item HTML preserves IDs, plain text never invents them, copy is observational,
and cut writes both formats before mutation with callback-time target validation.
Keep file/table clipboard ownership and unsupported structural boundaries intact.
Cross-block composition preserves source prefixes/suffixes and safe incoming
paragraph/heading structure. The bounded sibling-LI profile preserves actual
unselected final bodies/branches. Its recursive trailing-branch extension transfers
fully selected ordinary branches with hierarchy and IDs, using one bounded source/
payload policy. Different-level own-body endpoints within one ordinary tree use
the final structural-interval profile: preserve surviving paths at their levels,
never flatten them to join text. Refuse unrelated trees/protected owners and
interleaved bodies; never infer general structural selection support. This closes
planned mention feature expansion; return to the broader roadmap, with concrete
bugs handled as regressions rather than successive speculative micro-milestones.

Search result painting follows `specs/search-highlights.md` through the optional native CSS Highlight UI. Keep document/selection/history unchanged, feature-detect support, preserve other registry owners and avoid a heavy DOM/overlay fallback. Search ranges are observations, not mapped SDK positions or command authority.

Checklist interactions follow `specs/checklists.md`: optional scoped CSS markers
and Ctrl/Meta+Enter toggle one validated actual task without persisted UI nodes.
Preserve owned selection/history, refuse stale focus-time targets and keep pointer
hit testing bound to the visible marker. Command-only opt-out remains available;
glyphs are not advertised as native focusable checkboxes or complete accessibility.

For plugin SDK work, follow `specs/plugin-sdk.md` before implementation. Its first slice is per-instance typed commands and declarative semantic schema extensions over existing safe schema-v1 wrappers; mapped structural selection, custom node views, generic atoms/decorations and a new editing engine remain later work; mention-specific atomic behavior follows its independent contract. Preserve validation, initial-import ordering, history and plugin cleanup without silently changing stored documents.

Revision-bound selection handles follow `specs/plugin-sdk-next.md`: exact DOM
points, per-editor opaque ownership, synchronous stale-target refusal, explicit
release and lifecycle cleanup. They do not map positions through edits or replace
consumer intent/semantic checks and guarded commands. The link form is the first
consumer; do not silently migrate unrelated forms. Active competitor comparisons
use TinyMCE, CKEditor 5 and notectl; retain Quill comparisons only as historical
evidence.

The user's original product limits are gzip: core 200000 gzip JS bytes and optional entries/tables 150000 gzip JS bytes. Keep the separate adapter guard of 10000 raw JS bytes, explicit small-feature raw guards, and the soft core optimization target of 80000 minified bytes. Measured headless and ready standard profiles enforce 80000 gzip JS bytes; extended profiles enforce 110000 gzip JS bytes. Their previous raw JS caps are retired; each standard/extended profile still enforces 20000 minified CSS bytes. Minimal is measured without an additional preset guard. See `specs/editor-presets.md` P4 for the user-directed policy reason and selected closures. Count shared chunks once; report raw/gzip/Brotli/CSS independently, optional fonts/locales separately and exclude framework runtimes. Compare competitors only using equivalent feature profiles and compression.

For changed behavior, add tests that demonstrate document content, selection, history, or lifecycle results. Use real browser tests for Selection/Range and input behavior. Include malformed imported data and merged-table cases when those contracts change. Keep the public subpath imports stable unless a breaking change is explicitly required.

Update both language versions of affected docs and examples. If an old example or format stops working, document the replacement and migration limits; do not retain false compatibility claims.

Use pnpm 11.0.7 for workspace commands and keep pnpm-lock.yaml frozen in CI.

Run checks proportionate to the change. Per the user instruction of 2026-11-20, default local validation is relevant builds/types/size/package checks and focused regressions for the changed contract. Do not automatically run complete editor/adapter, documentation or installed-consumer suites after each task. Full local test runs require a fresh explicit user request; an earlier one-off request does not carry over to later features. This local policy overrides older full-check requirements in specifications. CI retains its required complete matrix. Use `docs:build:site` after package builds and select only affected live-example tests by default. Avoid building packages while browser tests consume their outputs. On this development laptop, run complete browser-heavy editor, docs and installed-consumer jobs sequentially when combined load causes timeouts; retain interrupted/failed runs and verify the affected cases without weakening timeouts or assertions. CI jobs keep their independent runner/shard architecture. Full checks must use a fresh task-owned Vite server after the build: reusing a server across package rebuilds can leave HMR-versioned and plain module URLs with different branded SDK registries. Stop only task-owned servers or use an isolated port, preserving user-owned previews. Editor and docs test results use distinct directories. Inspect bundle size changes and package runtime-dependency boundaries. Packaging/integration work follows `specs/package-consumers.md` using focused real tarball smoke without source aliases; complete consumer matrices remain explicitly requested local runs. Performance work follows `specs/performance.md`: measure built artifacts, separate plugin profiles and avoid concurrent builds/tests during timings; preserve incomplete results and report observational limits.

Finish by reporting the behavior implemented, actual test results, measured bundle sizes when relevant, and remaining limitations. Distinguish passing acceptance scenarios from untested product goals.

CI feedback follows `specs/continuous-integration.md`: one checked package build, the complete three-browser matrix (four Chromium, six Firefox, four WebKit shards), two docs shards and independent consumer jobs with a required aggregate gate. Browser jobs use the official image matching the installed Playwright version, without per-job apt. Publication restores those checked artifacts from the current workflow/commit and still waits for every gate. When the verified library artifacts already exist, `docs:build:site` performs the site stage without rebuilding packages; `docs:build` retains standalone build-plus-site behavior. Verify the actual new GitHub critical path before claiming the user's seven-minute complete-cycle target, and distinguish no-release runs from live publication; do not remove unique regressions merely to shorten elapsed time.

For the implemented next SDK layers, read specs/plugin-position-mapping.md and
specs/plugin-extensions.md. Preserve explicit UTF-16 transaction plans, real
history-entry mapping, separately accounted runtime presentation and per-editor
cleanup. Optional SDK modules must stay outside core/preset graphs. External-host
node views are not editable contentDOM, and native highlight ranges are not
widget decorations. Office corpus provenance follows specs/office-paste.md; keep
raw captured bytes/hashes/licenses, native captures and upstream samples distinct.
