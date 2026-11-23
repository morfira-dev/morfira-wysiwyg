# Collapsed deletion at quote/list body boundaries

Status: accepted additive native-input contract, 2026-11-23. Schema v1 and public
APIs do not change. Actual execution evidence is recorded separately.

## Useful scope and prior behavior

Block paste already creates list items containing ordinary paragraphs/headings
and direct blockquotes. Native wrapped-list inspection excludes these quote
shapes, and ordinary block input excludes list descendants. Their boundary
Backspace/Delete therefore previously consumed a no-op or delegated to native
editing. This slice explicitly normalizes adjacent leaf joins in those documents;
it replaces the ordinary Backspace-after-quote barrier with a guarded join. The
existing repeated-quote fixture contains an image in the preceding quote and
retains its protected-source no-op assertion. Existing Enter/Shift+Enter and noncollapsed/paste contracts are unchanged.

Inside one actual ordinary LI, collapsed Backspace at an ordinary leaf start and
Delete at its end join the same pair of truly adjacent eligible leaves. Supported
pairs are p/h children inside one direct quote; ordinary outer p/h and an adjacent
quote edge; adjacent direct quotes; and ordinary adjacent p/h bodies in an item
that also owns a direct quote. Inline-only quotes are eligible leaves themselves.
Quote/LI element-offset carets normalize only unambiguous adjacent-body edges.

Joins preserve the actual left leaf and its attributes and ancestor quote. Its
inline contents precede the moved right inline contents, and the caret is exactly
between them. The right leaf is removed; an enclosing right quote is removed only
when it has no remaining body/content except formatting whitespace. Remaining
quote bodies, quotes, list branches, sibling items, list attributes and table
cells keep their actual identity/order. The left block's direction/presentation
wins exactly as with existing paragraph joins; explicit inline direction/marks
survive. No attribute from a removed right block is copied to the left or its
children, and preserved quote direction stays on its existing wrapper.

## Boundaries and atomicity

Only real immediate DOM adjacency, optionally separated by inert formatting
whitespace, is eligible. Never jump over a nested branch, another item, nested
quote, pre, image, figure, table, foreign namespace, semantic owner or protected
content. Affected ordinary quote wrappers and leaves must have plain validated
editable inline content without semantic/atomic descendants; malformed/unsupported
boundary shapes are consumed as no-ops, without history or partial deletion.
Unrelated text-character deletion remains native. Unaffected branches and other
cells are not scanned/rebuilt or flattened; cross-level and cross-cell joins are
not introduced. At the absolute backward start of a quote-only item (no direct
p/h siblings), the pre-existing whole-item Backspace owner retains its prior
root unwrap/nested lift or sibling-join decision. This slice does not replace
that independent legacy behavior with a new barrier. Read-only, IME, already
canceled events and transaction validation
retain their existing owners. A failed transaction restores content and selection.

Use the existing cancelable-beforeinput and key fallback paths, one transaction
and one history step. Do not add a second native deletion, observer, global state,
plugin dependency or new public selection model. A successful join clears pending
caret formatting through the existing owner; a barrier preserves it.

## Acceptance

Representative Chromium/Firefox/WebKit keyboard and beforeinput cases cover both
directions, quote-child siblings, outside↔quote, quote↔quote, inline quotes,
headings/marks/br/empty placeholders, real surviving node/branch identity, exact
caret and subsequent typing, one-step undo/redo including original selection,
semantic/foreign/image/nested-quote/branch refusal, canceled/read-only/IME input,
merged-cell isolation and forced schema rollback. Avoid a Cartesian expansion of
all body/payload factors. RU/EN docs/demo and gzip measurements are coordinated
separately; existing data/feature support is not removed to meet a size target.


## Exact internal reuse

The implementation reuses ordinary-body joining across existing list handlers
without changing placeholder, caret or branch ordering. Clipboard/source
classifiers and their existing eligibility policies remain unchanged.
