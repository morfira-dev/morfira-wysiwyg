# Everyday editing: inline colors and links

Status: implemented local milestone after lists/toolbar; 246 editor/adapter browser tests and 13 site tests pass. Original TypeScript, no runtime dependencies, document schema v1. CI/release checking remains with the user. The already completed lists/toolbar slice is committed separately.

## Inline colors

- `format('color', value)` and `format('background', value)` accept a validated named/hex/rgb/hsl CSS color or false. Only color/background-color may be written. Semicolons, arbitrary declarations, URLs, var() and invalid colors reject before mutation. Reuse schema validation and the browser CSS parser.
- Apply only to selected inline content across marks, links, paragraphs, lists and cells. Retain unselected formatting, block structure and unrelated styles. false removes that inline property while retaining the other; inherited block colors/backgrounds remain block styles. Clear formatting removes inline spans/colors as before.
- At a caret establish pending styles for subsequent text input. They add no history until typing, support disabling an inherited inline color, coexist with boolean marks, and reset on selection movement/external replacement. Undo/redo restores content/caret; read-only prevents changes.
- `getFormats()` reports nearest explicit color/background CSS values and their mixed states. Adjacent identical inline wrappers coalesce so ordinary typing does not add one span per character.

## Links

- Preserve `format('link', string | false)` and add exported `LinkFormat { href: string; title?: string; target?: '_self' | '_blank'; text?: string }`.
- For a nonempty selection, apply/update metadata or remove only selected link segments, preserve marks and unselected links, avoid nested anchors, and create at most one compatible anchor per contiguous block segment. A link across paragraphs must not wrap block nodes into an inline wrapper.
- At a caret inside a link, update/unlink the entire current anchor while preserving its content, images/marks and caret. Omitted metadata retains existing metadata; an empty title removes it. String updates change href only. At a caret outside links, optional nonempty text creates an escaped text-label link; no text means no-op. text is only for new caret links, not label replacement on existing links/selections.
- Validate URLs and metadata before any DOM mutation. Invalid API values throw atomically. HTML/JSON boundaries allow only _self/_blank targets and noopener/noreferrer rel tokens; every _blank anchor receives both tokens. Imported event/unknown attributes remain rejected.
- Each command is one undoable transaction. Read-only blocks edits; creating a label link places the caret after it. No automatic navigation/open-URL action is added to the demo.

## Demo and acceptance

Both homepages/playgrounds get a colors/links sample, text/highlight drafts with apply/reset controls, active/mixed state, and a link form with URL, title, new-tab choice and optional label for insertion without selection. Existing-link metadata populates the form when inspection changes without overwriting a user's drafts during form entry. All controls preserve DOM selection, show errors accessibly and remain bilingual/responsive.

Test Chromium/Firefox/WebKit: partial colors and independent reset, nested marks/style preservation, cross-block/cell structure, pending styles and history, invalid colors/URLs/metadata, read-only/composition/external replacement, mixed states, bounded span count after typing, partial unlink and replacement across existing anchors, caret edit/unlink, target/rel schema roundtrip, literal label escaping and adjacent typing. Docs tests exercise both homepages, form focus, color reset and editing an existing link. Run check, docs build/tests and measure sizes; no claim of full office-HTML normalization or accessibility certification.


The later optional caret-link UI adds an explicit user-initiated safe Open action under [contextual-links.md](contextual-links.md); the original link-form slice does not navigate automatically. Existing formatting, import and history contracts remain unchanged.
