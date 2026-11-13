# Local feature laboratory

Status: implementation milestone. The `/playground` and `/en/playground` pages expose the supported current editor API; the Russian and English homepages expose the same complete laboratory immediately after the hero, before feature cards.

- Provide an editable showcase document plus article/table/empty samples. Sample replacement is explicit and resets history through the external-value API.
- Expose all supported inline marks, heading levels 1–6/paragraph, ordered/bullet lists, blockquote, code block, alignment and undo/redo. Preserve the editor selection while interacting with controls.
- Expose existing link formatting through a URL form and selected text; image insertion uses checked HTML with URL/alt/optional initial width. Do not pretend file uploads, drag image resize or collaboration exist.
- Expose every table command: create dimensions, logical rectangle selection, row/column insert/delete, merge/split, delete table, cell/border color and numeric column width. Include safe in-page clipboard buffers for copy/cut/paste and editable TSV/table HTML, alongside native keyboard clipboard usage. The page does not request system clipboard permissions.
- Expose HTML/JSON snapshots and checked import; malformed JSON/errors appear accessibly without changing the document. Show read-only, document/history state and configurable scoped CSS variables (theme, accent, font size, spacing, radius).
- Localize all lab controls in Russian/English; keep responsive layout, readable forms and visible keyboard focus. Do not count framework/tooling/demo weight as editor core size.
- Keep temporary content in browser memory. Show unsupported features honestly. The server remains local and running for the user after the requested handoff.

Acceptance: format selected text, change blocks, insert checked link/image, perform table operations and TSV range paste, inspect/import JSON, reject invalid JSON without mutation, switch read-only/theme, and show the laboratory without horizontal overflow at mobile width. Verify built pages and browser errors.

Lists/toolbar milestone: `specs/lists-toolbar.md` adds nested-list samples, indent/outdent, clear inline formatting, mixed states and localized keyboard-accessible toolbar controls to both homepages and playgrounds.

Colors/link milestone: `specs/colors-links.md` adds validated text/highlight controls, link metadata editing and a dedicated example to both language homepages and playgrounds.

Images milestone: see `specs/images.md` for bilingual image selection/metadata, captions, cancellable application upload callback and explicit local-only logo simulation.

Find/replace milestone: `specs/search.md`. Both homepages/playgrounds expose literal case/whole-word search across rich inline content, native active selection, current/all replacement, live results, read-only navigation and honest no-regex/no-cross-block limitations.

Statistics milestone: `specs/statistics.md`. Optional document/selection grapheme, non-whitespace and word counts populate the shared status and a bilingual inspector table, without document mutations.
