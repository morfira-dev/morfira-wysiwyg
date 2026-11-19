# Persistent mention references

Status: accepted bounded implementation contract; actual runs belong to
verification-backlog.md. This is an additive identity-reference slice over SDK
phase-1 semantic spans, not a generic atomic-node or mapped-selection engine.
The optional atomic navigation/deletion profile follows [atomic-mentions.md](atomic-mentions.md);
this document describes the compatible editable default.

## Public API and representation

Keep `/plugins/mentions` and the existing provider/controller. Add
`MentionOptions.persistent?: boolean`, default false for compatibility. In true
mode the plugin contributes the schema before initial import, and a successful
choice inserts `<span data-mw-node="morfira:mention" data-mention-id="ID">@Label</span>`
plus a separate trailing space in the existing single choice transaction.
The ID is literal opaque text, 1–256 UTF-16 units, without C0/DEL or Unicode
line/paragraph separators. Labels keep the existing provider bounds and are
inserted as text, never executable markup. No URL, DOM-ID/selector lookup,
transport, automatic notification or identity lookup is attached to that ID.

Export `createMentionSchema(): SchemaNodeSpec` for applications validating stored
references without installing a provider; return a fresh definition. Export
`getMentions(editor): MentionReference[]` with fresh `{ id, text }` records in
document order, including repeated occurrences. It requires the live mentions
plugin and performs an explicit read only; it is not an automatic whole-document
scan on input. Ordinary false/default mode keeps editable text insertion.

Use schema v1's registered span; no new DocumentNode variant/contenteditable=false
or invisible sentinels. HTML/JSON imports retain registered metadata through
history, editor copy/paste and adapters. Missing-plugin HTML readers discard
identity and retain visible content; missing-schema JSON readers reject reserved
unregistered nodes under the existing SDK contract. The independent Markdown
codec rejects these semantics rather than silently exporting away IDs.

## Editing and identity boundaries

This reference is editable, not atomic. Native text edits can change its visible
text while keeping the same ID; display text is not authoritative identity.
Generic supported formatting may preserve, split or duplicate an ordinary inline
wrapper under existing schema rules. Do not claim indivisible deletion, caret
snapping, immutable labels or arbitrary structural editing across semantic nodes.
Search/replacement and structural operations retain their existing semantic
barriers; no broad cross-plugin operation contract is introduced here.

Suggestion detection treats semantic wrappers as barriers and never opens within
one or collects a trigger across it. Choice must still revalidate the actual
query/range after focus, async provider completion, external replacement,
readonly/composition and disposal. Reuse one plugin object safely across editors;
every request/observer/listener retains its current instance cleanup. One choice
is one user change/Undo; redo does not refetch providers or reopen suggestions.

## Schema validation and security

Add compatible optional `minLength` and `singleLine` fields to SDK text attribute
rules; default 0/false preserves existing validators. Validate integer minimum
0..maxLength and boolean singleLine at compilation. True rejects C0/DEL and
Unicode line/paragraph separators at both HTML and JSON boundaries. Mention IDs
use minLength1/maxLength256/singleLine true, required on the registered span.
Invalid imported identity values reject atomically before live mutation.

Safe schema reconstruction still filters event attributes, foreign namespaces,
unchecked URLs and CSS; arbitrary contenteditable/class attributes are not
enabled. Imported references and provider data are untrusted identity claims.
Applications must verify IDs, permissions and notification authorization on the
backend. The frontend neither proves identity nor authorizes mention effects.
Copied references can refer to another application/tenant; the host owns that
resolution policy. No lookup or network request is performed by this module.

## Acceptance, examples and measurement

Add representative tests for opt-in vs default insertion, initial HTML/JSON,
round-trip/copy/paste, visible literal unsafe-looking labels/IDs, invalid and
missing IDs, one-step selection/history and typing outside the span, readonly/
IME/async stale choices, two instances and disposal. Add focused SDK text rule
boundaries and public types without repeating the full suggestion/browser matrix.
RU/EN docs and homepage/playground explicitly demonstrate saved IDs and editable
reference semantics. Add installed-consumer smoke source for later execution.

Keep zero runtime dependencies and no implicit global CSS. Optional chip styling
lives in existing explicitly imported suggestions CSS, scoped to .mw-content and
the fixed semantic marker. Customize --mw-mention-color/background/radius/padding;
no class/contenteditable attribute or ID-based dynamic CSS selector is persisted.
Measure core/mentions/shared-menu and extended profile raw/gzip/Brotli/CSS; core
must not import mentions. Preserve existing guards and preset default behavior.
Per user instruction local behavioral tests/consumer executions and CI observation
are paused; build/static checks may run. Commit locally, do not push.
