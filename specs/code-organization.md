# Code organization and extension boundaries

Status: accepted organization contract; migration preserves public import paths, exported names and document behavior.

The product is an independently implemented lightweight modular editor, not a feature-for-feature copy of a heavyweight office suite. Keep core focused on validated document editing, selection, transactions, lifecycle and small extension contracts. Optional functionality belongs to independently importable plugins. Applications may implement their own plugins without adopting built-in UI or unrelated modules. Heavy conversion, collaboration or media processing is not an implicit core requirement.

Essential editing and useful standard plugins must be ready to use. Modularity means selecting existing capabilities through stable imports, not requiring every application to build ordinary editing itself. Preserve tree-shaking and independently measured entrypoint dependency closures. No umbrella entrypoint may pull every optional module into the core graph.

## Feature ownership

- Each functional module owns a folder: `index.ts` is its explicit entrypoint, `types.ts` owns named interfaces/type aliases, and implementation files use names describing their responsibility. Optional styles live beside their feature.
- Core features and plugins must not become one flat directory of unrelated implementations. Table grid and clipboard helpers belong to the table feature; the suggestion engine owns the shared suggestion contract rather than a generic shared directory.
- Separate named type declarations from executable implementation. Internal declarations may be exported from their local `types.ts` for implementation imports without becoming public package exports. Use explicit `export type` lists at the feature entrypoint; do not expose internal types accidentally with `export *`.
- Accepted owner type filenames are `types.ts`, `internal-types.ts` and `*.types.ts`. Runtime-derived aliases belong there too; a type-only import and `typeof` query can refer to an owned runtime constant without adding a runtime import edge. Vue/Svelte script blocks may retain small local inline type literals; named contracts belong beside the adapter.
- Keep existing public names stable. Folder cleanup alone does not justify renaming exported types or introducing interface/type prefixes. Prefer interface for object contracts and type for unions, function signatures and compositions.
- Use `import type` and `export type` for type-only dependencies. Reuse the owning contract; do not duplicate it or introduce `Common`, `Shared` or `Models` type dumping grounds.
- Module helpers have one concrete responsibility. Prefer readable two-space indentation, separate meaningful blocks and document non-obvious invariants and side effects. Existing compact code can be expanded as its responsibility changes; avoid unrelated rewrites.
- Keep listener installation, state transitions, error handling and disposal readable in separate statements/blocks. Do not compress an entire lifecycle into a semicolon-packed line.

## Dependency and packaging boundaries

- Core never imports optional plugins. Optional UI is separate from editing behavior; framework adapters depend on the core contract rather than one another.
- Plugin cooperation uses explicitly documented per-editor contracts. A global singleton registry or event hub must not mix editor instances. Events cannot bypass validation, transactions, read-only or lifecycle cleanup.
- Typed events publish core lifecycle observations and application/plugin-owned custom notifications. They are not RPC: return values, mutation commands and request/response coordination belong to explicit typed APIs. Each subscription has an unsubscribe operation and an owner lifecycle; destroying an editor releases every owned listener. Custom notifications must not impersonate reserved core lifecycle events.
- Keep supported public subpaths and CSS entries stable while moving source files. Update build entry maps, declaration destinations and consumer type checks together. Public consumers use package exports; implementation files use relative imports within a feature.
- `dist/` and size reports are generated from source/build configuration. Change the generator rather than hand-maintaining generated code.

## Acceptance

Source moves preserve runtime behavior, plugin state isolation, public exports and declarations. Existing browser tests remain behavior-oriented; do not add source-text tests that freeze local paths or spelling. Validate the resulting package with build, declarations/package checks, strict type checks and the existing relevant browser suite. Check raw minified/gzip/Brotli/CSS sizes and keep bilingual public API/integration documentation aligned under `documentation.md`; architecture details remain in maintainer specs.

The project AST guard rejects named top-level interface/type declarations in core/plugin implementation files and imports from the core into optional plugin code. Type-owner files remain implementation details unless an explicit public entrypoint exports their contract.
