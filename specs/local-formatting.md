# Local inline boolean formatting

Status: implemented optimization contract. This is a private execution choice; public formatting names, schema v1, validation, pending caret formats and one-step history remain unchanged. Measure before/after with the existing core benchmark rather than adding timing assertions to browser tests.

## Eligible leaf blocks

For a noncollapsed range whose two DOM boundaries belong to the same paragraph or heading (`p`, `h1`–`h6`), boolean inline formatting may transform that one block instead of rebuilding the entire surface. The block must contain only text and supported XHTML inline elements (`strong`, `em`, `u`, `s`, `sub`, `sup`, `a`, `span`, `code`), without nested blocks, atomic/void barriers, foreign namespaces, comments or unknown elements. Ancestors between it and the surface must be known structural containers; inline ancestors outside the chosen block reject the local path so inherited mark semantics cannot change.

Unsupported shapes, surface-level range endpoints outside a shared leaf, cross-block ranges, atoms and complex ancestor contexts retain the existing whole-document path. Colors, links, clear formatting, block operations and caret-only pending formats are not changed by this optimization.

## Transformation and validation

Compute text offsets relative to the candidate using the real native Range. Parse the selected block's outerHTML through the existing document boundary, reuse the same typed inline transformation, and render one replacement block with its allowed attributes. No arbitrary DOM wrapper surgery or unvalidated HTML insertion is introduced. Replacing the selected block also removes unsupported attributes there. Normalize adjacent text nodes in the detached replacement so bookmark paths agree with later HTML history replay. Restore selection within its rendered text; keep the editor focused and preserve immediate backward orientation.

The core transaction still captures and validates the entire persisted document and enforces total resource limits before/after mutation. A failure rolls back content, selection and history using the normal transaction contract. Public HTML/JSON boundaries continue sanitizing the complete surface; the local path does not promise in-place canonicalization of unrelated application-mutated DOM.

Enabling an already present target mark keeps that validated marked subtree intact rather than splitting it around the selection. Its full text length still advances the shared transform offset, so selections continuing into plain siblings or later blocks format the correct characters. This idempotence applies to both local and whole-document execution. If the validated replacement has identical outerHTML, leave the existing block and native Range untouched and create no history. On a successful eligible operation, unrelated blocks, list items, table cells, images and their DOM-owned listeners remain connected with the same identity. The selected block's identity is not preserved. Undo/redo may reconstruct the document as before; their guarantees concern content and selection, not arbitrary DOM identity.

## Acceptance

Exercise Chromium, Firefox and WebKit: add/remove boolean marks within nested marks/links/colors; UTF-16 offsets; immediate forward/backward selection and following input; one-step undo/redo; leaf paragraphs in nested lists and merged table cells; unrelated DOM identity/listeners; sanitization of selected-block attributes; read-only; and full-path compatibility for cross-block ranges, atoms/voids and external inline ancestors. Tests assert user-visible document/selection/lifecycle behavior, not private dispatch counters. Measure raw/gzip/Brotli changes and update both language versions of the documentation.
