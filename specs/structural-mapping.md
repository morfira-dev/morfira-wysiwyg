# Explicit structural position mapping

Status: accepted bounded implementation contract, 2026-11-23. Additive to
plugin-position-mapping.md; no inferred native mapping or model-engine rewrite.

`editor.positions.trackNode(path, offset, association?)`, `resolveNode(handle)`
and `releaseNode(handle)` track an ordinary text-only P/H1–H6 or direct-text LI.
A path counts ELEMENT children at each level, starting at the surface; it never
counts whitespace Text or comment nodes. Offset is UTF-16 within that leaf.
Empty ordinary blocks (no children or one BR placeholder) support offset 0;
mixed BR/inline/semantic content and internal BR boundaries reject. Different
empty blocks have distinct paths. Tokens are opaque, per editor and observational.
Deleted handles stay deleted through Undo; consumers must not use them as targets.

`EditorTransactionOptions.structuralMapping` is an explicit bounded sequential
plan: split a plain paragraph/heading at a text offset; join adjacent plain
paragraphs/headings preserving left attributes; insert/remove whole supported
blocks/list items; move whole supported nodes including nested LI branches.
Insert/move destinations use element-child indexes; move's parent/index are
interpreted AFTER source removal. Root accepts ordinary P/H and lists; UL/OL
accept LI; LI accepts P/H and lists; ordinary BLOCKQUOTE accepts P/H.
Unsupported semantic split/join, tables, flattening/reparenting invalid children,
unknown fields, cyclic/excessive payloads and invalid paths reject atomically.

Plans replay against the instance's validated schema-v1 document BEFORE the
callback; expected canonical HTML must match the actual canonical post-edit
HTML before history commit. Inserted nodes pass instance HTML/JSON/resource
validation. At most 32 steps, 64-deep bounded integer paths and the existing
aggregate document bounds apply. Split/join/move path transforms preserve the
identity of unaffected tracked leaves even when document text is unchanged.
Unknown changes expire node handles; text-only plans expire node handles, and
structural-only plans expire legacy text handles. Explicitly supplying both
valid plans may preserve both coordinate systems. Presentation accounting and
invalidation/lifecycle retain the previous position contract.

Forward/inverse structural maps attach to the actual history entry. Undo/Redo
can rebuild DOM without losing surviving logical paths; removed identities never
revive. Rollback expires observations. Mapping notifications retain the existing
steps field and add an optional structural:true observation. Exact native
selection handles keep their stricter revision-bound contract.

The optional SDK `structuralCommands(editor).apply(steps)` performs these explicit
operations on actual DOM nodes, preserving unaffected identities and moved list
branches. New inserted/split nodes use schema rendering. It revalidates document,
native selection, read-only and revision after focus and uses one transaction.
It does not enable automatic mapping for native input or arbitrary plugin edits.

Focused three-engine coverage: split/join associations, empty leaf identity,
insert/remove sticky deletion, nested LI moves, history, exact mismatch rollback,
invalid/unsafe plans, unknown edits, read-only/composition, focus replacement,
per-editor isolation and cleanup. Add RU/EN demo/docs and archive/type smoke.
Actual validation and size evidence are recorded separately by the coordinator.


Canonical no-op plans do not create history entries. If a callback physically
moves indistinguishable nodes but produces identical canonical HTML, conservative
mutation invalidation applies; this profile does not invent persisted identity for
otherwise identical model nodes. Changing structure with unchanged text (such as
splitting a paragraph or moving distinct empty P/H leaves) remains mappable.


Every intermediate replayed document passes aggregate serialization/resource
validation before the live callback, even when later steps remove its payload.
Total normalized inserted payload across the whole plan is also capped at the
codec node/serialized limits before retaining further clones. The SDK helper
bounds step/path shape and normalizes payload through the instance codec before
copying it; it does not structuredClone an unbounded raw plan. First lazy node
capture checks actual DOM element-path/namespace/plain-leaf correspondence, not
canonical HTML equality alone. Any semantic ancestor blocks this ordinary profile.


Validated structural capture models are cached privately per editor/canonical
HTML revision, never exposed by getJSON or shared with application callbacks.
Replay copies the cached model before mutation. Content changes, invalidation,
release of the last node handle and destruction clear the extra cached model.
Repeated node captures therefore do not reparse the entire document per handle.
