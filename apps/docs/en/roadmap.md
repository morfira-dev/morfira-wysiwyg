# Roadmap and limitations

The goal is a capable lightweight modular editor. The implementation is independent; the project is evolving, not a claim of full parity with mature document suites.

## Implemented scope

Original TypeScript document tree, validated HTML/JSON boundaries, text selection and formatting, bounded undo/redo, atomic plugin transactions, instance-local table editing, Vue/React/Svelte adapters, CSS variables, bilingual local docs, MIT license and project SDD contracts.

## Document format

The persisted document format is now `EditorDocument` version 1. The previous prototype format has no automatic converter. Existing HTML can be imported through the supported schema; unsupported markup is normalized. Use the facade's selection and plugin methods rather than the removed engine escape hatch.

## Further work

1. Expand real Word/Excel fixtures beyond the implemented HTML/TSV range clipboard, including browser editing boundaries and malformed imported structure.
2. Broad IME/mobile/touch and screen-reader coverage; keyboard-only resize/menu improvements.
3. Images: connect application storage through the upload callback, then drag resizing and cropping. Dimensions, captions and an upload form are available in the demo.
4. Mentions/slash commands and additional optional formatting controls. Markdown typing shortcuts, literal find/replace and Unicode text statistics are implemented in the local preview.
5. Large-document benchmarks, history memory profiling and expanded composition testing.

Collaboration, track changes, comments, pagination and DOCX/PDF import/export are not implemented. Applications own upload transport through a callback; the demo never uploads files. The native input surface still inherits browser editing behavior. Passing behavioral tests is not a security or accessibility certification.

## Licensing

Project source is MIT; see the root LICENSE. Core and table runtime have no third-party dependencies. Frameworks/tooling keep their own licenses and notices; development dependencies are not relicensed by the project's MIT grant.

The local preview includes [literal find/replace](/en/search) and [Unicode statistics](/en/statistics), with case/whole-word options, one-step replacement history, document/selection counts and separate optional entry points. Regex search and simultaneous highlighting of all matches are not implemented; statistics require Intl.Segmenter.

[Markdown typing shortcuts](/en/markdown) are available in the local demo. Phase-1 [mentions/slash snippets](/en/suggestions) are implemented locally as editable text suggestions. Persistent atoms and structural commands remain later phases. Durable identity-bearing mentions need an explicit document-model decision.
