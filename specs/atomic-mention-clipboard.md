# Clipboard for atomic mention references

Status: accepted bounded implementation contract; actual runs belong to
verification-backlog.md. Extends [atomic-mentions.md](atomic-mentions.md) without
changing the persisted schema or installing a clipboard transport.

## API and scope

Atomic mode handles owned cancelable copy/cut/paste ClipboardEvents using their
clipboardData, and exposes mentionClipboardCommands(editor) through the existing
/plugins/mentions entry. It requires a live atomic mentions instance and returns
copy():MentionClipboardData|undefined, cut():MentionClipboardData|undefined and
paste(input:MentionClipboardInput):boolean. Data is fresh `{html:string,text:string}`;
input contains optional html/text strings. Validate types/unknown input keys and
existing 5,000,000-unit document/resource bounds before mutation. No navigator
clipboard access, permission request, network or new dependency is implicit.

Copy/cut own a noncollapsed native range touching at least one valid atom, within
one supported ordinary inline flow. Expand partial atom endpoints privately to
whole references, retaining direction for edit history. Copy is observational:
do not change document, focus, selection or history. Return undefined for an
unowned selection; reject unsupported atom-touching source structure explicitly.
Readonly allows copy but not cut/paste mutations. Plain/nonatomic mention modes
keep their existing behavior; the new command getter rejects without atomic mode.

Paste accepts supported inline content or one ordinary paragraph's inline body
at an ordinary caret or over one supported same-flow range. Preserve surviving
prefix/suffix, formatting, other references and merged-cell geometry. Replace
selected atoms entirely; an interior caret snaps to the configured atom edge.
Block/multiblock/table/image/foreign/other-owning-semantic payloads or cross-flow
targets refuse before editing, rather than broadening structural paste contracts.
The programmatic API handles literal plain text too; native events only intercept
incoming mentions or an atom-touching target, leaving unrelated pastes to their
existing owners. File-bearing events and already handled table/image/plugin events
are not consumed. Explicit table-grid clipboard keeps its separate owner.
Use the existing table-owned per-editor `tables:selection` observation to detect
actual contained explicit cells, with a type-only owner import and no table runtime
dependency. Do not infer ownership from spoofable data-mw-selected attributes.
Native copy/cut can run in the bubble phase after the table's capture owner;
native paste must also check that explicit observation before the core handler.

## Data, normalization and safety

text/html contains only schema-validated selected content, registered mention
IDs and supported inline formatting. Never include runtime contenteditable,
classes, listeners, source application data or unchecked attributes. Build a
detached typed fragment/serialization in an inert context; do not clone active
DOM subtrees containing resource elements merely to serialize them. Reject
unsupported source/payload before any active render. The plain text format holds
visible text/labels, with explicit BR as newline, and contains no hidden ID or
invented mention syntax. Pasting @Label from plain text never reconstructs an ID.

Prefer nonempty HTML to text. Malformed/invalid registered HTML rejects atomically,
without falling back to apparently valid text and losing identity. Parse through
the receiver's schema before allowed output is rendered. IDs remain bounded
opaque untrusted references; labels are literal text and atomic text-content rules
still apply. Unsafe elements/attributes/URLs follow normal safe reconstruction;
unregistered HTML markers follow existing missing-schema reader policy. Every
atomic receiver rederives its owned annotation; editable receivers may preserve
ID without atomic behavior, plain readers may retain text but discard identity.

## Cut, history and races

Native cut writes both allowed formats successfully before deleting anything.
Write failure never removes source content or adds history; do not clear unrelated
clipboard formats. The browser owns OS clipboard behavior, so no transactional OS
rollback guarantee is made. Programmatic cut returns data to the caller's in-memory
buffer and removes content as its explicit editor action, without an OS write.

Successful cut/paste is one validated editor transaction, one user change and one
Undo/Redo revision, restoring ID, label and selection. Empty/no-op/rejected commands
add none. Keep an editable placeholder after cutting the final token. After paste,
caret is outside the last inserted atom; later ordinary typing must not alter its
label. No hidden persisted caret sentinel is allowed.

Capture live range/flow/actual atom nodes and intent/API revision. Revalidate after
focus callbacks and clipboard writers, including same-HTML DOM reconstruction,
readonly/IME/disposal and changed selection. Retained APIs/listeners cannot act on
a replacement target. Cancel handled events to avoid duplicate core paste/cut;
uncancelable events do not start a second synthetic edit. Do not rewrite clipboard
data or apply old content when another owner already handled the event. Cleanup
releases all listeners/registrations and leaves the editor/controller lifetimes
independent across multiple instances.

## Examples, tests and weight

Add representative browser definitions for copy HTML/text without runtime attrs,
partial/backward ranges, native cut write failure and focus races, same-flow paste
at caret/over tokens, plain-text fallback without IDs, schema rejection and limits,
rich surrounding marks, merged cells, readonly/IME, history/next typing, source/
receiver isolation and disposal. Avoid repeating the full table/atomic matrix.
Add RU/EN docs and a demo in-memory clipboard using explicit commands and user
controls; distinguish synthetic event coverage from actual OS permissions/support.

Preserve zero runtime dependencies, public subpaths, core/plugin graph and current
gzip/CSS guards. Report raw/gzip/Brotli and selected profile closures. Local tests,
installed-consumer execution and CI observation are paused by the user. Static
build/type/package/tree-shaking/docs/size checks may run. Commit locally, no push.
