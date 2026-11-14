# Replacement across sibling list items

Status: accepted implementation contract for a bounded local slice. Validation is deferred at the user's request: new tests are written but not executed, builds/type checks/size measurements are not run, and the last measured size report remains the earlier paste baseline. Schema v1 and public API/imports are unchanged.

## Source ownership

Core owns noncollapsed cancelable `beforeinput` for `insertText` with a string payload, `deleteContentBackward` and `deleteContentForward` when a range spans distinct `li` siblings under one ordinary `ul` or `ol`. The same source ownership applies to detached clipboard/API import preflight. List instances and their attributes stay intact; no global list coalescing pass is introduced.

Each item owns either direct inline content or exactly one ordinary `p`/`h1`–`h6` body followed by optional trailing lists. Body children are text, strong/em/u/s/sub/sup/a/span/code/br; inline semantic metadata is preserved. Mixed direct inline/block content, multiple body blocks, formatting whitespace alongside a wrapped body, images, figures, tables and preformatted blocks remain unsupported. The chosen list, item and body wrapper must not carry `data-mw-node`; these are defensive guards, not a claim that SDK v1 can register ul/ol/li semantics. An unchanged semantic ancestor outside the chosen list/items is not retagged or removed.

Endpoints inside a wrapped body retain their exact inline context. An endpoint directly on its `li` at child offset zero is interpreted as the body start; child offset one is the body end before trailing branches. This uses a cloned working Range and never changes the global selection before the transaction snapshot. Other item-level offsets outside the body are blocked. An undo therefore restores the original item-level or backward selection boundaries, rather than the normalized working coordinates.

Ownership is tri-state:

- Neither endpoint belongs to a list item: unowned; the ordinary-block or existing insertion path retains responsibility. A whole list enclosed by outside endpoints is not normalized by this contract.
- Both endpoints belong to the same item: unowned; existing same-item native/list input remains responsible.
- Exactly one endpoint is in an item, or endpoints belong to different lists/parents: blocked before mutation. This does not define mixed list/paragraph replacement or cross-level list deletion.
- Distinct siblings in one list are eligible only when all their own bodies meet the direct-inline or single-wrapper shape. Unsupported covered bodies, semantic roots and partial nested selections are blocked atomically rather than delegated to native deletion.

Left and middle covered items cannot contain nested lists in this slice. The rightmost item may contain only trailing direct `ul`/`ol` branches after its inline body, and its range end must be at or before that body boundary. Those branches are wholly unselected; move the actual branch nodes to the retained first item after its own body without flattening, joining, renumbering or stripping their attributes/metadata. Content after a nested branch makes the shape unsupported. Replacement entirely inside a nested list uses the same sibling policy and preserves all outer ancestors. Formatting-only whitespace nodes between covered sibling items are fully selected gaps and are removed; non-whitespace or other non-item gap nodes block the operation.

## Result and imported payload

Preserve the actual first item and its actual body wrapper, their tags/attributes and untouched inline prefix. Remove only covered later items and their body wrappers, append the final body's inline suffix into the retained body, and keep unrelated siblings, parent list attributes, cell geometry and ancestor DOM identity. Direct and wrapped body kinds may be mixed; the first body's kind wins without introducing nested paragraphs or headings. Insert plain input as literal text in the original starting inline context. Place the caret directly after the payload and before the suffix/retained branches. A body that becomes empty gets one editable placeholder inside its wrapper. Retained trailing branches belong to the first item, outside its wrapper.

Clipboard/API payloads are limited to inline content (including allowed incoming img) or one ordinary paragraph whose wrapper is removed. Payload semantic paragraph/block wrappers, multiple blocks, lists, tables, figures and other structural payloads are rejected during detached preflight for an owned list range. This does not turn pasted paragraphs into multiple items. Plain clipboard newlines remain `br` inside the retained item, following `paste-replacement.md`. Incoming explicit formatting is preserved; an incoming anchor must not be nested inside an existing starting anchor.

Parse/render/sanitize before the outer live edit. Empty sanitized fragments remain no-ops even for an otherwise blocked source; the preflight does not unwrap an ordinary p, so a surviving empty p is still an intentional empty replacement. Invalid public API imports throw; clipboard import rejection remains a no-op. Nested import failure poisons an enclosing transaction even when caught, as in `transactions.md`. Recheck actual source ownership before the live cut because trusted focus listeners may change selection after preflight.

## History and guards

An accepted replacement is one isolated synchronous transaction/change. Undo restores original HTML and exact forward/backward DOM boundaries, including empty bodies and line breaks; redo restores the result and insertion caret. Subsequent ordinary typing has separate history and retains existing native boundary affinity rather than a new forced formatting state.

Caret-only formatting overrides belong to a collapsed selection, not a later selected range. A valid noncollapsed API/clipboard replacement clears those overrides inside the mutation callback after its original snapshot is captured. It must not retain an old override merely because the replacement's new caret has the same text offset as the earlier collapsed caret. Invalid imports, empty sanitized imports and boundary barriers remain no-ops for that pending state. This does not force the browser's mark inheritance after the replacement.

Already canceled events, read-only, composition and noncancelable beforeinput retain existing guards. Unsupported native protocols such as word deletion/replacement targets remain outside this slice. A blocked native operation or detached-preflight refusal before opening the transaction consumes no document/history revision and preserves content, range and unrelated DOM identity. If a trusted focus listener changes the context after preflight, a late fresh-context rejection uses the existing transaction rollback: it preserves the transaction's HTML, selection and history baseline but may rebuild DOM nodes. Unrelated DOM identity is not guaranteed for that late rollback path; this slice does not change the global rollback contract.

Acceptance tests cover real typing and deletion plus beforeinput-only dispatch, both list kinds, nested lists and merged cells, literal inline HTML/plain paste, rich suffix/links, empty/br/Unicode boundaries, preserved trailing branches, list attributes, controlled feedback, guards and atomic rejections. These test definitions are not evidence of a passing run until the deferred validation is performed. No runtime dependency, CSS, public export, engine rewrite or performance claim is introduced.
