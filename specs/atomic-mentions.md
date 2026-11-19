# Atomic mention navigation and deletion

Status: accepted bounded implementation contract; actual validation belongs to
verification-backlog.md. This is mention-specific editing behavior over existing
schema-v1 spans, not a complete generic atom/node-view/mapped-position SDK.

## Configuration and compatibility

Add MentionOptions.atomic?:boolean (default false); true requires persistent:true.
Default plain and persistent editable modes retain their contracts. The atomic
plugin contributes a text-only content rule for its registered span, requiring
1–201 UTF-16 units without C0/DEL/U2028/U2029. IDs keep existing bounds. Extend
createMentionSchema(options?:MentionSchemaOptions) with atomic?:boolean so
provider-free validators can use the same content contract. Validate/copy options.

The persisted representation remains the same span/morfira:mention/data-mention-id
and literal text children. No new node variant, invisible characters, executable
markup or persisted contenteditable/class/atomic flag is added. A configured
runtime derives contenteditable=false only for registered valid mention spans;
the annotation is presentation, removed/restored on disposal where still owned.
Initial content and reconstructed history/external values receive annotations.
Maintain them with bounded changed-subtree processing, not whole-editor rescans
per keystroke. HTML/JSON codecs strip the transient annotation and rederive it
only from trusted plugin configuration after rendering.

Every reader requiring atomic behavior must opt in. Old registered editable
readers retain IDs but remain editable; missing-schema HTML drops identity and
JSON rejects it as before. Rich/empty/overlong saved labels reject in atomic mode;
applications can retain editable mode or deliberately migrate labels to bounded
literal text before enabling it. No automatic lossy migration or schema-version
bump is implied by this additive configuration. Markdown still rejects identity.

## Navigation and selection

Within supported ordinary text flows (paragraph/headings, ordinary list bodies,
quotes and table-cell paragraphs), horizontal boundary navigation skips an entire
mention. Left/right handling must respect the ordinary block's LTR/RTL direction;
mixed-bidi visual word navigation remains browser behavior, not a new bidi engine.
Shift navigation extends across the whole mention without entering its label.
Pointer selection may select the whole token. An interior collapsed native/API
selection snaps to a nearest outer boundary; a noncollapsed interval touching
the interior expands to complete mention boundaries while keeping direction.
Never steal focus or normalize another editor/outside selection.

No caret is intentionally kept inside a label while atomic mode is active.
Selection changes are observational and create no history. Browser up/down,
Home/End and modified word navigation retain native behavior with boundary
normalization; no universal mobile/IME/accessibility certification is claimed.

## Whole deletion and input safety

Backspace immediately after an atom and Delete immediately before it remove that
whole node in one validated editor transaction. A separate trailing space remains
ordinary text: deleting it is a separate normal action. Range deletion/replacement
inside one supported flow expands partial token endpoints before mutation; keep
unaffected text, marks, adjacent references and merged-cell structure. Retain an
editable placeholder when deleting the last content. Undo/Redo restores ID, label,
selection and runtime atomic rendering; one command emits one user change.

Capture handled keydown/beforeinput before core mutation; prevent default and
stop propagation only when owned. Respect read-only, event.defaultPrevented,
composition/isComposing/legacy229, disposal and actual range/target changes during
focus callbacks. Unsupported atom-touching structural/cross-owner edits refuse
atomically rather than partially deleting IDs; ordinary unrelated input retains
existing behavior. The bounded same-flow, ordinary sibling-block and consecutive
list-item copy/cut/paste extension follows
[atomic-mention-clipboard.md](atomic-mention-clipboard.md), preserving IDs in HTML
and expanding touched token boundaries. Unsupported structural transfers refuse.
App-owned direct DOM/value replacement remains
trusted code and is not sandboxed by this user-input contract.

## Schema and ownership

Add a narrow optional text-content declaration to semantic SchemaNodeSpec,
validated using bounded minLength/maxLength/singleLine rules. Apply it to HTML and
JSON nodes before rendering/serialization; text-only children are required and
aggregate length is checked before concatenation. Default definitions are
unchanged. The trusted schema declaration cannot permit unsafe tags/attributes,
arbitrary contenteditable or user-supplied execution callbacks.

Runtime handlers/listeners/observer/owned annotations are per editor, including
one plugin object reused across instances. Cleanup is idempotent, restores only
owned presentation, and invalidates stale work. No provider/notification/network
side effects are implied by IDs; backend identity/permission checks remain needed.

## Acceptance and weight

Representative tests cover opt-in/default compatibility, schema invalid labels,
HTML/JSON stripping/reapplication, keyboard and pointer boundaries, Shift/backward
selection, complete deletion and next typing, readonly/IME/focus races, history,
lists/merged cells, adjacent tokens, external rebuilds and disposal/reuse. Write
RU/EN docs and homepage/playground examples with clear migration/limits. Avoid a
generic atom engine rewrite or a combinatorial test matrix.

Preserve zero runtime dependencies, explicit CSS and public subpaths. Measure core,
mentions and selected extended profiles raw/gzip/Brotli/CSS; preserve existing
guards. Local behavioral tests/consumers and CI observation are paused by the user.
Build/static checks may run. Commit locally; do not push.

## Native editing-position regression — 2026-11-19

When deriving contenteditable=false for newly inserted labels, preserve the focused editor native Range and direction and reinstall them after annotation changes. WebKit may otherwise expose a valid DOM Range while rejecting the next native insertion. Do not focus an outside editor or touch selection on batches that do not change annotations. Normalize text before installing a deletion caret. Equivalent text affinity is limited to immediately adjacent mention boundaries; ordinary placeholder and retained mark boundaries stay unchanged. Existing paste/typing/history, readonly and composition scenarios exercise these requirements.
