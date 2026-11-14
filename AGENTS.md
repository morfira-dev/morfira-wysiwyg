# Morfira WYSIWYG — project instructions

Read `skills/morfira-sdd/SKILL.md` before changing document behavior, public API, plugins, adapters, build boundaries, or documentation. Follow the feature specifications under `specs/`; update a relevant specification before changing its contract. Routine corrections within an existing contract do not require user approval.

Use pnpm 11.0.7 for installation and all workspace scripts. Keep only pnpm-lock.yaml; CI installs with --frozen-lockfile.

## Product and ownership

- Maintain an independently implemented editor and table system. Do not wrap, vendor, rename, or disguise an external editing engine. New code is MIT licensed. Preserve required notices for any actual third-party code; do not misrepresent authorship.
- Core and plugins have zero runtime dependencies. Vue, React, and Svelte are peer dependencies of their adapters. Keep build, test, and documentation tooling development-only. Add a dependency only when the user's task requires it and an existing platform capability cannot reasonably satisfy it.
- Public imports are `@morfira-dev/wysiwyg`, `/vue`, `/react`, `/svelte`, and `/plugins/tables`. Keep plugins out of the core dependency graph.
- Source, tests, and build scripts use strict TypeScript. Functions are `const name = (...) => ...`, including exported functions; do not use named `function` declarations. JSON, CSS, Markdown, Vue/Svelte templates, and generated JavaScript are expected non-TS artifacts.
- Organize source by functional feature folders with explicit `index.ts` entrypoints and adjacent `types.ts` for named declarations. Keep styles and helpers with their owner; preserve public type names and subpaths during moves. Read `specs/code-organization.md` before structural changes. Do not expose internal helper types accidentally or create generic type dumping grounds.
- Keep core lightweight and optional functionality in plugins. Support application-owned extensions through documented per-editor contracts; feature-for-feature parity with CKEditor/TinyMCE or an office suite is not a product goal. Do not add heavy conversion, collaboration or processing subsystems merely to match another editor; implement them only for an explicitly requested use case, outside core.
- Ship the essential editing features and useful built-in plugins ready to use. Preserve selective imports and tree-shaking so consumers load only the chosen modules; extensibility must not require users to rebuild basic editing themselves.
- Plugin/core interaction uses typed per-editor events for notifications and lifecycle observation. Custom notifications must have an explicit owner and cleanup; events are not an RPC/command bus and cannot replace validated atomic commands.
- Keep named interfaces and type aliases in the owning feature's `types.ts`, `internal-types.ts` or `*.types.ts`, including aliases derived from runtime constants. Do not pack listener setup, state changes, disposal and error handling into unreadable one-line lifecycle blocks.
- Use independent SemVer with semantic-release and multi-semantic-release; keep internal dependencies and the public facade compatible. Explicitly document breaking changes to public APIs or document formats.

## Editing invariants

- A versioned typed document schema owns persisted data. Validate both HTML and JSON boundaries. Rebuild allowed DOM nodes/attributes; never accept executable markup, event attributes, unchecked URLs, arbitrary style declarations, or foreign namespaces.
- Do not use `document.execCommand`. Use explicit document operations and Selection/Range APIs. Undo/redo must cover native input, formatting, paste, and plugin edits, restore selection, and clear appropriately on external document replacement.
- Plugin state is per instance. Every listener, observer, pointer capture, menu, and subscription needs cleanup. Read-only must block user mutations and allow external value synchronization.
- Tables use a logical grid for rowspan/colspan. Structural operations must preserve unaffected cell content, reject invalid selections atomically, and participate in history. Test merged cells, not only rectangular unmerged grids.
- Adapters preserve selection on controlled-value feedback, suppress events for external replacement, update read-only reactively, and dispose on unmount. React StrictMode is required.
- Appearance is customizable through scoped `--mw-*` CSS variables. Optional UI must not be required to use core. Documentation styles must not leak into the embedded editor.

## Required validation and documentation

- Add behavior tests for changed editing contracts; exercise Chromium, Firefox, and WebKit. Do not replace a regression test with implementation-matching assertions.
- `pnpm run check`: package builds, declarations, selective-import/tree-shaking checks, bundle budgets, type checks, and editor/adapter tests. `pnpm run docs:build` and `pnpm run test:docs`: bilingual site and live examples. Report which checks actually ran and material unverified behavior.
- For package-integration work, run `pnpm run consumers:check` after build: actual tarball consumers must not resolve workspace source aliases. Performance work follows `specs/performance.md`; run explicit observational benchmarks without concurrent builds/tests and never turn local timings into universal capacity claims.
- Keep Russian and English API/example pages consistent. Mark unsupported and experimental behavior honestly; do not claim full compatibility or complete accessibility without evidence.
- Measure raw minified JS, gzip, Brotli and CSS separately. Current JS guardrails: core 200000 bytes, table entry 150000 bytes, each adapter 10000 bytes. Framework runtimes, source maps, and declarations are not runtime-size measurements. Tighten or revise budgets only with an explained product reason.
- Do not commit, push, create branches/tags, publish packages, or deploy without an explicit request. The documentation site is local-only unless the user requests publication.
