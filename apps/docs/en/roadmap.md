# Roadmap and limitations

The goal is a capable lightweight modular editor. The implementation is independent; the project is evolving, not a claim of full parity with mature document suites.

## Implemented scope

Original TypeScript document tree, validated HTML/JSON boundaries, text selection and formatting, bounded undo/redo, atomic plugin transactions, instance-local table editing, Vue/React/Svelte adapters, CSS variables, bilingual local docs, MIT license and project SDD contracts.

## Document format

The persisted document format is now `EditorDocument` version 1. The previous prototype format has no automatic converter. Existing HTML can be imported through the supported schema; unsupported markup is normalized. Use the facade's selection and plugin methods rather than the removed engine escape hatch.

## Further work

1. Expand real Word/Excel fixtures beyond the implemented HTML/TSV range clipboard, including browser editing boundaries and malformed imported structure.
2. Broad IME/mobile/touch and screen-reader coverage; keyboard-only resize/menu improvements.
3. Reusable optional link/image/search forms outside the demo; image drag resizing and clipboard/drop file insertion. Applications connect storage through the existing upload callback.
4. Table header/caption commands, autolink and other small plugins for concrete use cases. Mentions/slash, Markdown typing shortcuts, literal find/replace and Unicode statistics are already implemented.
5. Expand real-document coverage of the existing [benchmarks](/en/performance) and installed-package checks. Composition event/history and ordinary paragraph/heading keyboard boundaries have dedicated tests; cross-block selection replacement still needs further normalization.

Collaboration, track changes, comments, pagination and DOCX/PDF import/export are not implemented. Applications own upload transport through a callback; the demo never uploads files. The native input surface still inherits browser editing behavior. Passing behavioral tests is not a security or accessibility certification.

## Licensing

Project source is MIT; see the root LICENSE. Core and table runtime have no third-party dependencies. Frameworks/tooling keep their own licenses and notices; development dependencies are not relicensed by the project's MIT grant.

The local preview includes [literal find/replace](/en/search) and [Unicode statistics](/en/statistics), with case/whole-word options, one-step replacement history, document/selection counts and separate optional entry points. Regex search and simultaneous highlighting of all matches are not implemented; statistics require Intl.Segmenter.

[Markdown typing shortcuts](/en/markdown) are available in the local demo. Phase-1 [mentions/slash snippets](/en/suggestions) are implemented locally as editable text suggestions. Structural commands are available; persistent atoms remain a later phase. Durable identity-bearing mentions need an explicit document-model decision.

Priority: a small reliable everyday editor with ready essential plugins, selective imports/tree-shaking and custom extensions. Heavy office-suite parity is not a goal. Next: real mobile/IME/accessibility checks, clipboard reliability and ready UI for essential modules; add further features for concrete use cases.
