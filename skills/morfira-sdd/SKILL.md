---
name: morfira-sdd
description: Implement or revise Morfira WYSIWYG behavior from project specifications, keeping its independent TypeScript engine, document contracts, adapters, tests, and bilingual documentation aligned. Use for changes in this repository rather than unrelated editor projects.
---

# Morfira specification-driven development

Read the repository's `AGENTS.md` and the relevant feature specification in `specs/`. For engine/document changes start with `specs/editor.md`; table operations additionally use `specs/tables.md`.

Before implementation, describe the requested observable behavior and acceptance scenarios in the relevant spec. Preserve the user's scope; a spec is not permission to publish, perform Git operations, or expand dependencies. Resolve routine choices within existing authorization without adding approval gates.

Implement original, strict TypeScript using `const` arrow functions. Core/plugins have no runtime dependencies; framework adapters declare peers. Use a typed versioned document schema and per-instance plugins. Do not introduce external editor implementations or hide third-party attribution. New code uses MIT.

For structural work, follow `specs/code-organization.md`: feature-owned folders, explicit entrypoints, adjacent named types, styles/helpers with their owner and stable public names/subpaths. Keep core small; optional modules and application-owned plugins provide extensions. Per-editor cooperation must preserve validation, transaction, read-only and cleanup boundaries.

Provide essential editing and useful built-in plugins ready to use while retaining selective imports and tree-shaking. Do not chase heavyweight enterprise-editor parity or require consumers to implement ordinary editing from scratch. Typed per-editor events carry lifecycle/custom notifications, not RPC commands; document ownership and automatic cleanup. Keep named types in owner type files and lifecycle code readable rather than packed into one-line setup/disposal blocks.

For changed behavior, add tests that demonstrate document content, selection, history, or lifecycle results. Use real browser tests for Selection/Range and input behavior. Include malformed imported data and merged-table cases when those contracts change. Keep the public subpath imports stable unless a breaking change is explicitly required.

Update both language versions of affected docs and examples. If an old example or format stops working, document the replacement and migration limits; do not retain false compatibility claims.

Use pnpm 11.0.7 for workspace commands and keep pnpm-lock.yaml frozen in CI.

Run checks proportionate to the change. Engine or plugin changes require `pnpm run check`; docs changes require `pnpm run docs:build` and `pnpm run test:docs`. Avoid building packages while browser tests consume their outputs. Editor and docs test results use distinct directories. Inspect bundle size changes and package runtime-dependency boundaries.

Finish by reporting the behavior implemented, actual test results, measured bundle sizes when relevant, and remaining limitations. Distinguish passing acceptance scenarios from untested product goals.
