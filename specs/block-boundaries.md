# Paragraph and heading input boundaries

Status: implementation contract; schema v1 and public APIs remain unchanged.

## Registered semantic leaves

The registered `data-mw-node` identity belongs to its declared wrapper. Enter inside a registered paragraph/heading splits into two wrappers of the same tag and copies the registered metadata, following phase-1 non-atomic child editing. Enter at a registered heading's end creates an ordinary paragraph sibling; it copies built-in presentation attributes but no `data-*` identity or metadata. Enter in an empty registered heading preserves that heading and its required metadata, with an editable placeholder, and creates the same ordinary paragraph sibling. The original wrapper must never be retagged or silently lose its semantics.

Collapsed Backspace/Delete treats either independently registered leaf as a join barrier, whether it is the current or neighboring leaf. Consuming that boundary is a no-op without a history revision. Ordinary paragraphs inside a semantic blockquote can still split/join under that unchanged parent. Shift+Enter retains the semantic wrapper and inline metadata. Existing composition/read-only/canceled-event guards apply unchanged.

Acceptance: real keyboard and beforeinput heading exits (including empty), interior splits, Shift+Enter, barriers in both directions, one-step undo/redo and subsequent typing at the exact caret. Capture event errors to verify that known marker/tag validation failures cannot escape from an ordinary Enter. Retain unrelated sibling DOM/content and schema metadata; no schema or public-API change.

## Scope and behavior

Core owns a small explicit handler for ordinary XHTML paragraphs/headings (`p`, `h1`–`h6`) containing text and supported inline marks/links/spans/code/br. Lists retain their existing handler. The bounded replacement of a noncollapsed selection across ordinary sibling leaves follows `input-replacement.md`. Preformatted text, figures, atomic inline content, foreign/unknown structures and other selections spanning blocks retain their existing behavior; this milestone does not claim arbitrary cross-container replacement normalization.

Within one eligible block, Enter replaces any selected text and splits the block, preserving inline markup and block attributes. Paragraphs continue as paragraphs. A heading split in its interior remains a heading; Enter at its end creates a paragraph, and Enter in an empty heading converts it into a paragraph. Shift+Enter replaces the selection with a line break without splitting the block; a terminal placeholder break keeps the caret editable after that break.

At a collapsed block start, Backspace joins an immediately preceding eligible paragraph/heading sibling. At a collapsed block end, Delete joins an immediately following eligible sibling. Both operations preserve the left block's identity, attributes and inline contents, append the right contents, and place the caret exactly at the join. A neighboring list/table/figure/pre/unknown element is a barrier. Joins never cross parent containers, table cells, list items or blockquotes. At the edge of a table cell or blockquote the handler consumes the boundary deletion without moving content outside that container. Eligible parents are the editor root, a blockquote or a td/th; list descendants are excluded.

Structural keys/beforeinput are ignored during composition or when modifier shortcuts apply. Read-only blocks mutations. Enter in ordinary blocks reaches beforeinput first, allowing optional typing rules to consume it before the core split; an already canceled beforeinput is respected. Every supported operation runs through the existing validated transaction/history contract, with one undo step, exact content and selection restoration, and no extra native edit after a handled key. Joins preserve the DOM caret after line breaks as well as within normalized adjacent text nodes. Rejected shapes remain delegated to existing input behavior rather than partially edited.

## Acceptance

Chromium, Firefox and WebKit exercise rich paragraph/heading splits, heading-end and empty-heading exit, Shift+Enter followed by typing, selected-text replacement, Backspace/Delete joins with Unicode and marks, undo/redo at exact block boundaries, table/figure/list barriers, separate merged-cell containers, read-only and composition guards. Browser keyboard events test actual editing integration; a synthetic beforeinput test checks mobile-style dispatch without claiming real-device IME/mobile certification. No timing assertions or new runtime dependencies.
