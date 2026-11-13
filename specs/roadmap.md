# Product roadmap

The target is a capable lightweight editor, implemented independently in strict TypeScript under MIT. Core/plugins keep zero runtime dependencies; adapters use optional framework peers. Each milestone follows specification → implementation → browser acceptance → size measurement → RU/EN documentation. These milestones are development priorities, not release dates or claims of feature parity.

1. **Table clipboard and correctness — implemented baseline.** HTML/TSV ranges, copy/cut, merged-cell boundaries, bounded grid growth, atomic history. Contract: `specs/table-clipboard.md`.
2. **Everyday editing — lists, colors and link editing implemented.** Lists/nesting, block-boundary Enter/Backspace, links, alignment/colors, clear formatting, and usable toolbar controls. Lists/toolbar contract: `specs/lists-toolbar.md`; lists/toolbar are implemented; colors/link commands and forms are implemented; contract: `specs/colors-links.md`.
3. **Images — implemented.** Insertion dialog, application-owned upload callback, dimensions, captions, alt text, error handling. Contract: `specs/images.md`.
4. **Optional extensions — find/replace and statistics implemented; Markdown shortcuts implemented locally.** Find/replace (`specs/search.md`), statistics (`specs/statistics.md`) and Markdown shortcuts (`specs/markdown-shortcuts.md`) first; mentions/slash commands after the essential document flows (proposed design: `specs/mentions-slash.md`, no runtime yet).
5. **Product integration.** Real IME/mobile/touch/accessibility checks, large-document and memory benchmarks, consumer-package installation and integration examples.

The baseline already includes a versioned document model, formatting/selection/history, table grid and operations, three adapters, theming and local bilingual docs. Passing baseline tests does not establish arbitrary Word/Excel compatibility or production readiness.
