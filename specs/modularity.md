# Lightweight modular product and tree-shaking

Status: accepted. The goal is a maintainable editor for everyday authoring, not feature parity with an enterprise office suite. Essential formatting and ready-to-use table, image, search, statistics, Markdown and suggestion plugins ship with the project. Requiring users to reimplement essential features is not modularity.

Applications explicitly select ready-made plugins through public subpaths and can implement their own extensions using the same supported editor contracts. A ready-made feature must not imply mandatory loading into core. No automatic all-plugin registration, global event bus, conversion service, collaboration engine or framework runtime belongs in core. Heavy workflows are app-owned optional integrations when actually requested.

Preserve ES modules, type-only imports, explicit feature entrypoints, CSS-only package sideEffects metadata and independent optional CSS imports. Core's runtime graph must exclude plugins and frameworks. Importing one plugin must not retain unrelated plugin implementations. Moving source files must preserve published subpaths and existing public names.

Immutable UI dictionaries must remain removable from sanitizer-only imports. Their initialization may use Object.freeze, so preserve private ESM boundaries through library minification rather than relying only on source purity annotations that the minifier can discard. Private dictionary chunks are implementation details; public imports stay unchanged and size reporting counts every emitted JS file once.

`check:tree-shaking` builds actual public imports with esbuild, measures the retained graph and rejects unrelated plugin entries, framework runtimes in core and mandatory CSS. A sanitizer-only build must exclude editor/toolbar creation. Combined suggestions-set and all-plugins reports count each shared chunk once. Module budgets remain measured separately as raw minified JS, gzip, Brotli and CSS. Shared chunks must not be counted multiple times when reporting a combined selected set.

Events are instance-local typed notifications. Commands and transactions own mutations; event listeners do not form an implicit RPC/command dispatcher. Built-in and third-party plugins cooperate through explicit exported event tokens and public commands. Subscription cleanup follows editor lifecycle.
