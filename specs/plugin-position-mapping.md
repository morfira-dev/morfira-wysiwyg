# Plugin SDK: explicit transaction position mapping

Status: accepted implementation contract, 2026-11-23. This is an additive,
opt-in UTF-16 text-coordinate layer, separate from exact revision-bound native
selection handles. It does not claim arbitrary structural/model position mapping.

## Public API and coordinates

`editor.positions` exposes `track(index, association?)`, `resolve(handle)`,
`release(handle)`, `subscribe(listener)` and the narrow `setPresentation` setter. Export opaque `EditorPositionHandle`,
`EditorPositions`, `EditorMappedPosition`, `TextMappingStep`,
`EditorTransactionOptions` and `EditorPositionChange` types through core/facade.
Coordinates count `surface.textContent` UTF-16 units, exactly like public
text-offset selection. BR, empty block, image and list boundaries that share a text
offset are not distinguished; use native selection handles for exact boundaries.

Track validates an integer position within the synchronized document and an
association of -1 (before inserted text) or 1 (after, default). Resolve returns a
fresh `{ index, deleted }` observation, or undefined for foreign/released/expired
handles. Tokens never contain DOM, serialized identities or command authority.
A removed interior position stays marked deleted; later insertion or undo must
not silently revive its identity. Release is idempotent. Track/resolve refuse
pending native mutation or active composition/transaction; read-only permits
observation, never editing. Subscriptions are per editor and cleaned on destroy.

## Explicit transaction declaration

`editor.transact(mutate, { mapping: steps })` accepts a bounded array of sequential
`{ from, to, insert }` text replacements. Steps use the text after preceding steps.
Copy and validate declarations before invoking mutation. Apply declared steps to
the exact pre-edit text and require an exact match with committed post-edit text;
unchanged text outside the declared replacements must be retained. A mismatched,
malformed or excessive plan rejects atomically with existing history/selection
rollback. Nested transactions may compose ordinary edits, but a nested mapping
plan is rejected: the outermost transaction owns the complete plan. No mutation
callback, thenable or DOM renderer is accepted in a mapping step.

At insertion boundaries association chooses before/after inserted text. Positions
after a replacement shift by its length delta; positions strictly inside removed
text map to the associated replacement edge with `deleted: true`. Positions on the
outside edges survive according to association. Consumers must reject deleted
positions as semantic targets unless their own contract explicitly tolerates them.

The declared map is not inferred from ambiguous string diffs. Every ordinary
content-changing transaction, native input, composition or external replacement
without a valid explicit plan expires existing handles. Even formatting-only
HTML changes expire them unless an explicit empty plan claims text-coordinate
compatibility. A no-op with unchanged accepted HTML preserves them. Synchronous
uncommitted direct DOM changes expire tracked observations; direct mutation is
trusted application code, not a sandbox or sanitization bypass.

## History and lifecycle

Supported mapped undo/redo apply inverse/forward plans associated with the actual
history entry, not HTML-keyed guesses. Unmapped history expires handles. Positions
created after a mapped edit may move back through undo; deleted flags remain
sticky. A thrown or poisoned transaction invalidates handles after rollback;
it cannot publish a successful map. Grouped ordinary typing remains existing
history behavior and invalidates mapped positions.

Commit notifications report `kind: 'mapped' | 'invalidated'` and copied public
steps for the actual direction. Notifications are observations outside the
transaction rollback boundary; handlers cannot roll back an accepted edit by
throwing. Core change notifications precede position notifications, so a mapping
subscriber that commits a new edit cannot publish newer state before the original
editor change. Revalidate after focus callbacks before invoking a transaction:
replacement, read-only, composition or destruction refuses the old operation.
No global registry or document-wide listener ownership is introduced.
Destroy releases subscriptions/tokens and retained external tokens remain inert.

## Acceptance and accounting

Representative Chromium/Firefox/WebKit cases cover association, compound plans,
unchanged spans, mismatch rollback, typed ownership, deleted positions, undo/redo,
unknown native/external changes, read-only/composition, callbacks and cleanup.
A decoration consumer uses tracked endpoints and drops expired/deleted ranges.
Actual tarball/type smoke and raw/gzip/Brotli measurements are required; no new
runtime dependency, persisted schema revision or preset eager plugin import.

## Accounted runtime atom presentation

`editor.positions.setPresentation(node, false | undefined)` sets or removes ONLY
`contenteditable` on an actual connected XHTML span owned by this editor's
registered semantic schema. Require nonempty single-line text bounded to 2048
units, text-only children, no customized built-in marker, and exact per-node
schema validation of persisted attributes. The optional atom plugin additionally
checks its own registered name/ownership. Read-only permits derived presentation;
transaction/composition/destruction refuse it.

This is a single native attribute setter, not a callback permission or a blanket
observer exception. Drain preexisting mutation records first: unrelated edits
still expire positions, even when the safe annotation can subsequently apply.
Revalidate after notification callbacks, then drain ONLY this setter's exact
attribute records. Unexpected mutations expire the positions. No persisted HTML,
text, history or mapping is changed, and no whole-document scan runs per atom.

Undo/redo may rebuild semantic spans; atom subscriptions rederive this annotation
using the setter without expiring an otherwise valid explicit text map. Arbitrary
application changes to contenteditable still invalidate. Exact DOM selection
handles retain their stricter mutation invalidation and are not preserved by this
text-coordinate accounting method.
