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

Image commands use `/plugins/images` and remain outside the core graph. `images.js` measures that entry and its shared chunks separately; `plugins.js` continues to measure the table entry and its shared chunks. Each entry has a 150000-byte minified JS guardrail, matching the existing optional-plugin envelope; shared chunks count in each independently loadable entry.

`search.js` measures the search entry and its shared chunks independently from images/tables. Its minified JS guardrail is 150000 bytes, matching other optional modules. Native Selection/Range selects results without persistent highlight wrappers.

`markdown.js` is measured independently with its shared chunks under the same 150000-byte minified JS guardrail as other optional modules. Core does not import it.

`mentions.js`, `slash.js`, `suggestions.js` are measured as independent entries including shared chunks. Loading them together loads the shared engine once; summing entry sizes overcounts shared code. Menu CSS (`suggestions.css`) is measured separately from table CSS.

## Feature ownership and selective imports

Source now follows functional folders: `core/src/{editor,document,selection,formatting,lists,events,ui/toolbar}` and `plugins/src/{tables,images,search,statistics,markdown,mentions,slash,suggestions}`. Named types belong to adjacent `types.ts`/`*.types.ts`; entrypoints expose explicit public contracts. Source moves preserve public subpaths and names.

Essential features/plugins ship ready to use. Applications choose imports and may implement custom plugins; core does not auto-register modules or framework runtimes. `pnpm run check:tree-shaking` bundles real public consumer imports and rejects unrelated plugin entries, mandatory CSS and framework leakage. A sanitizer-only import must exclude editor/toolbar creation. These checks complement per-entry raw/gzip/Brotli budgets.

[Typed per-instance events and composable transactions](/en/events) support extension cooperation without a global singleton or command RPC bus. Heavy office conversion/collaboration processing is not a default feature or a parity target.

`suggestions-set.js` and `all-plugins.js` in size-report.json measure selected unions of JS files, counting each shared chunk once. These are measurements, not mandatory presets; CSS, framework runtimes and documentation UI are separate.

Local boolean inline formatting in a plain paragraph/heading uses the same typed transformation and validator on that leaf block, keeping unrelated DOM nodes connected. Cross-block/complex content, colors, links and clear formatting retain the general path. History still validates the entire persisted document; this is not an incremental document engine.
