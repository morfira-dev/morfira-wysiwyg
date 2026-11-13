# Table clipboard contract

Status: active milestone. Extends `specs/tables.md` without changing document version 1.

## API and ownership

- Extend the table command API with `copy(): TableClipboardData`, `cut(): TableClipboardData` and `paste(data: TableClipboardInput): void`. Copy returns HTML and TSV; it does not access the system clipboard. Cut returns the same payload and clears cell contents in one history operation.
- Browser copy/cut handles an explicitly selected cell rectangle; native copying of a text selection within one cell remains native. Write clipboard payloads before clearing content on cut.
- Within an existing cell, table HTML or tab-containing plain text invokes range paste. Ordinary rich text/newline-only text remains normal cell paste. Explicit `paste({ text })` can represent a single-column matrix. Outside a table, preserve existing editor paste behavior.
- Handled clipboard events must not reach the core's normal paste path. Dispose capture listeners and status UI with the plugin. State stays per instance.

## Formats and limits

- TSV supports tabs, CRLF/LF rows, empty cells, quoted tabs/newlines, and doubled quote escapes. Reject malformed quoting, payloads above 5 million characters and grids larger than 100 × 100 before mutating the document. A single terminal line separator is a record terminator, not an extra row.
- Sanitize HTML using the core boundary before reading a detached table. Accept exactly one nonnested table, preserve supported cell content and spans, normalize sparse slots to empty cells. HTML table data takes precedence over accompanying TSV; malformed table data must not silently fall through to plain insertion.
- Copy exports semantic table HTML without editor-only attributes. TSV stores merged-cell content at the origin and empty covered slots; HTML retains spans.

## Destination behavior

- Paste starts at the current cell, or the top-left of an explicit expanded rectangle. A larger source may grow the table right/down, within limits.
- For a multi-cell selection, a scalar (one unmerged cell) fills selected cell contents without changing target spans/styles. Any larger source must match the selected rectangle dimensions exactly.
- A destination merge crossing the source footprint boundary causes atomic rejection. Fully covered target merges may be replaced by source structure. Preserve all cells outside the footprint.
- Successful paste is one transaction; undo/redo restores exact document contents and shape. Read-only permits copy but blocks cut/paste mutations.
- Public API errors throw before/within an atomic transaction. Browser handlers catch invalid input, leave content/history unchanged, and show an accessible status message. An optional table `onClipboardError` callback receives the error; no uncaught browser error is expected for rejected clipboard data.

## Acceptance

TSV 2×2 insertion, quoted fields, empty/trailing cells, HTML styles and sanitization, source spans, sparse source, destination growth, merges at footprint boundaries, scalar fill, shape mismatch, over-limit rejection, copy/paste round trip, cut history and write-failure safety, native text-copy fallback, read-only, listener cleanup and independent instances. Browser tests cover Chromium, Firefox and WebKit using clipboard-event fixtures; those fixtures are not certification of every OS/application clipboard format.
