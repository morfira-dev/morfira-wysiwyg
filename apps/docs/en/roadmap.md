# Roadmap and limitations

Morfira is an independently implemented lightweight modular TypeScript editor under MIT. The target is ready everyday authoring close to mature editors in common tasks, with a small selected bundle, understandable extensions, modern UI and detailed documentation. Improvements require concrete scenarios and measurements. Full enterprise or office-suite parity is not a commitment.

## Implemented baseline

- A versioned document tree, validated HTML/JSON boundaries, selection/formatting, bounded undo/redo history and atomic composable transactions.
- Nested lists, headings, blockquotes, basic code blocks, colors, alignment and link editing.
- A logical table grid, merged cells, structural operations, column sizing and HTML/TSV range clipboard.
- [Images](/en/images): URLs, alt text, dimensions, captions and application-owned upload callbacks with cancellation.
- [Find/replace](/en/search), [Unicode statistics](/en/statistics), [Markdown shortcuts](/en/markdown), editable-text [mentions/slash suggestions and structural slash actions](/en/suggestions).
- [Instance events](/en/events), selective imports/tree-shaking, CSS variables and [reusable optional link/image/search forms](/en/ui). The homepage and playground use these public forms.
- [RU/EN localization](/en/localization), custom translations and language changes without document replacement. Vue, React, Svelte, Angular 21/22 [adapters](/en/adapters) and an explicitly registered Web Component.
- Local bilingual documentation, installed-tarball consumer checks and [observational benchmarks](/en/performance).

Composition/history and ordinary paragraph/heading keyboard boundaries have bounded contracts and tests. These do not replace real OS IME, mobile keyboard, touch or screen-reader checks. Those areas are not certified or considered fully verified.

## Next milestones

Milestones define development order, not release dates. Each includes a specification, browser scenarios, size measurements and matching RU/EN examples.

1. **Plugin SDK and extensible schema — phase 1 implemented.** Typed commands, payload validation, command state and declarative plugin schema contributions compiled before initial import. Phase 1 preserves format v1: allowed HTML wrappers carry validated semantic markers and metadata. Arbitrary HTML tags, custom node views, atoms, decorations and a new immutable editing model are not promised by this phase.
2. **Input and history correctness.** Cross-block selection replacement, structural deletion, complex-selection insertion and text drag/drop. Real IME, autocorrect, dictation and mobile devices need separate checks. Choose history/locality optimizations from measurements on identical documents.
3. **Ready UI and presets.** Minimal/standard/extended compositions, a toolbar builder, dropdowns, palettes, popovers/dialogs, contextual controls and responsive overflow. Unify icons, tokens, density, focus and keyboard behavior. Ordinary authoring must not require copying laboratory logic into an application.
4. **Everyday capabilities.** Checklists, additional autolink triggers, font family/size, a horizontal-rule command/UI, list properties and text direction. Small fullscreen/preview/special-character modules and save-state integration follow their own contracts. Font files never load automatically.
5. **Images and tables.** Clipboard/drop files, pointer/keyboard image sizing, proportions/alignment and upload progress/error/retry. Tables gain an insertion picker, properties, header rows, caption UI, row minimum heights and accessible sizing. Preserve merged-grid correctness and one-step history; applications still own upload transport.
6. **External paste compatibility.** Real Word, Excel, Google Docs, LibreOffice and browser fixtures with a support matrix. Separate safe import, plain text and optional Office normalization. HTML sanitization alone does not prove preservation of Office formatting.
7. **Markdown, persistent mentions and search.** A separate import/export/paste codec with explicit syntax and loss/fallback rules. Durable mention IDs and atomic selection follow the required SDK foundation. Highlighting all search matches must not alter persisted content. Slash actions use the shared command registry.
8. **Optional advanced modules.** Provider-registry video embeds with click-to-load, formulas with a documented format and separately selected resources, content styles and print layouts. DOCX/PDF conversion, review and collaboration require separately requested integration scope and architecture/size assessment.
9. **Continuous quality checks.** Every milestone updates RU/EN API, working examples, limits, migrations and size reports. Expand plugin-author guidance, five-wrapper recipes, SSR, controlled values, CSP and uploads. Visual, keyboard, contrast, zoom, reduced-motion, real screen-reader/device and performance checks are acceptance criteria rather than work postponed until all features ship.

## Size targets

Sizes use decimal bytes. JS/CSS are measured after minification; gzip and Brotli are separate. Count each shared chunk once per selected composition. Exclude framework runtimes, source maps and declarations; report fonts and additional locales separately.

| Profile | Target | Status |
| --- | --- | --- |
| Core | Up to 80000 minified JS bytes | Working development target |
| Core | 200000 minified JS bytes | Existing enforced hard guard |
| Table entry | 150000 minified JS bytes | Existing enforced hard guard |
| Each adapter | 10000 minified JS bytes | Existing guard, framework runtime excluded |
| Standard with selected plugins/UI | 200000 minified / 65000 gzip JS bytes | Proposed target; define and measure a real preset first |
| Extended | 350000 minified / 110000 gzip JS bytes | Proposed target, not a completed measured composition |
| Standard CSS | 20000 minified CSS bytes | Proposed target |

This plan does not change build guards automatically. Presets need an actual feature list/loading graph before a separate budget guard is introduced. A smaller bundle does not establish faster input or lower history memory; measure these independently.

## Format and remaining limits

Persistence uses `EditorDocument` version 1. The previous prototype format has no automatic converter. HTML imports through the supported schema; unsupported markup is normalized. Public API/document changes require explicit compatibility notes and a migration decision.

Reusable forms and [SDK phase 1](/en/plugin-sdk) are implemented. [Autolink](/en/autolink) runs after a native Space; Enter and paste are not triggers. Complete ready presets and subsequent SDK phases remain planned. Markdown shortcuts are not Markdown import/export. Current mentions insert editable text without durable IDs. Regex search and simultaneous highlighting of all matches are not implemented; statistics require `Intl.Segmenter`.

Collaboration, track changes, comments, pagination and DOCX/PDF import/export are not implemented. The demo never uploads files; applications own upload transport through a callback. Passing scenarios do not certify security, accessibility, leak freedom or compatibility with arbitrary Office documents.

## Licensing and publication

Project source is MIT. Core/plugin runtime has no third-party dependencies. Frameworks/tooling retain their own licenses and notices. Documentation stays local; site/package publication and Git writes require a separate user request.
