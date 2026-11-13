# Architecture and size

## Workspaces

| Workspace | Responsibility |
| --- | --- |
| `packages/core` | Document schema, HTML/JSON validation, Selection/Range operations, history, transactions, plugin lifecycle and optional toolbar |
| `packages/plugins` | Independent table grid, structural commands, selection and contextual UI |
| `packages/vue`, `packages/react`, `packages/svelte` | Framework bindings with lifecycle cleanup |
| `packages/wysiwyg` | Public subpath exports |
| `apps/docs` | Local Russian/English documentation |
| `specs`, `skills/morfira-sdd` | Behavior specifications and project development workflow |

## Runtime boundary

Core and plugins have no runtime dependencies. Frameworks are adapter peers. Build, documentation and test tools are development dependencies. The root public entry exports core only; table and framework subpaths are separate imports.

The editing implementation is original TypeScript using const arrow functions. Version 1 JSON contains semantic nodes; an inert HTML template is read into an allowlisted tree and DOM nodes are created from checked values. Browser contenteditable handles native text entry; explicit Selection/Range operations handle commands. History stores bounded document revisions with selection bookmarks. Plugin state and cleanup are per instance.

This is an early engine: snapshot history is simple and bounded rather than a collaborative operation log. Large-document performance, browser-generated block normalization and complex composition need additional evaluation. Small size is not evidence of complete feature parity.

## Size accounting

`pnpm run build` writes `size-report.json`: minified raw JS, gzip and Brotli; CSS is separate. It includes every emitted runtime chunk, excluding declarations/maps. Svelte component source is compiled/minified for measurement, not mistaken for just its tiny entry file. Framework runtimes are excluded.

Current guardrails: core JS 200000 bytes, table JS 150000, each adapter 10000. Measurements are per package; compressed sizes sum actual compressed emitted files. New plugins must keep independent entry budgets.

## Source contracts

`pnpm run check:project` enforces arrow-function implementations, MIT package metadata and zero core/plugin runtime dependencies. SDD contracts live in `specs/editor.md` and `specs/tables.md`; read `AGENTS.md` before changing them. API/document-format changes need SemVer and bilingual documentation updates.
