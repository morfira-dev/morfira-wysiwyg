# Lightweight modular product and tree-shaking

Status: accepted. The goal is a maintainable editor for everyday authoring, not feature parity with an enterprise office suite. Essential formatting and ready-to-use table, image, search, statistics, Markdown and suggestion plugins ship with the project. Requiring users to reimplement essential features is not modularity.

Applications explicitly select ready-made plugins through public subpaths and can implement their own extensions using the same supported editor contracts. A ready-made feature must not imply mandatory loading into core. No automatic all-plugin registration, global event bus, conversion service, collaboration engine or framework runtime belongs in core. Heavy workflows are app-owned optional integrations when actually requested.

Preserve ES modules, type-only imports, explicit feature entrypoints, CSS-only package sideEffects metadata and independent optional CSS imports. Core's runtime graph must exclude plugins and frameworks. Importing one plugin must not retain unrelated plugin implementations. Moving source files must preserve published subpaths and existing public names.

Immutable UI dictionaries must remain removable from sanitizer-only imports. Their initialization may use Object.freeze, so preserve private ESM boundaries through library minification rather than relying only on source purity annotations that the minifier can discard. Private dictionary chunks are implementation details; public imports stay unchanged and size reporting counts every emitted JS file once.

`check:tree-shaking` builds actual public imports with esbuild, measures the retained graph and rejects unrelated plugin entries, framework runtimes in core and mandatory CSS. A sanitizer-only build must exclude editor/toolbar creation. Combined suggestions-set and all-plugins reports count each shared chunk once. Module budgets remain measured separately as raw minified JS, gzip, Brotli and CSS. Shared chunks must not be counted multiple times when reporting a combined selected set.

Events are instance-local typed notifications. Commands and transactions own mutations; event listeners do not form an implicit RPC/command dispatcher. Built-in and third-party plugins cooperate through explicit exported event tokens and public commands. Subscription cleanup follows editor lifecycle.

Plugin ownership checks use inputs contributing bytes to the final consumer
output, not every parsed file listed by esbuild. Ignored side-effect-free bare
imports may remain in metafile.inputs while contributing zero bytes. Existing
feature allowlists remain authoritative for every retained plugin chunk; this
distinction must not excuse actual unrelated code. Public mention schema/query
helpers have dedicated selective-import probes alongside the factory probe.

## Revised product profiles and SDK boundary

The revised roadmap targets a ready everyday-authoring experience close to mature editors in common tasks, with evidence-backed improvements in selected bundle size, extension contracts, UI and documentation. Evaluate actual task/feature profiles; do not infer universal superiority from size alone. Enterprise/office-suite parity and unsolicited heavy processing are outside this target.

The active SDK contract is `specs/plugin-sdk.md`: phase 1 adds per-instance typed commands and declarative semantic schema contributions over existing safe schema-v1 wrappers. Compile schema contributions before initial import. Keep validation, history and read-only/composition guards shared with ordinary editing. Node views, atoms, decorations, mapped structural selection and a new editing engine are later capabilities, not prerequisites silently claimed by this slice.

Ready minimal/standard/extended presets are explicit compositions, not automatic registration in the core entrypoint. Preserve independent feature/CSS imports and zero runtime dependencies. Per the user's gzip clarification, core has a 200000 gzip JS byte product guard and optional/table entries a 150000 gzip JS byte guard. The 80000 minified-byte core goal is a soft engineering target; adapters retain their separate 10000 raw JS byte guards. Active measured standard/extended profiles enforce 80000/110000 gzip JS bytes and 20000 raw CSS bytes each; previous raw JS profile caps are retired. Framework runtimes are excluded; raw/gzip/Brotli/CSS and optional fonts/locales are separately reported. See `editor-presets.md` P4 for the policy and closure definitions.
