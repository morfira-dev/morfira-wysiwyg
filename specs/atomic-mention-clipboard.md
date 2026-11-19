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
one supported ordinary inline flow or the sibling-block/list-item extensions below. Expand partial atom endpoints privately to
whole references, retaining direction for edit history. Copy is observational:
do not change document, focus, selection or history. Return undefined for an
unowned selection; reject unsupported atom-touching source structure explicitly.
Readonly allows copy but not cut/paste mutations. Plain/nonatomic mention modes
keep their existing behavior; the new command getter rejects without atomic mode.

Paste accepts supported inline content or one ordinary paragraph's inline body
at an ordinary caret or over one supported same-flow range. Preserve surviving
prefix/suffix, formatting, other references and merged-cell geometry. Replace
selected atoms entirely; an interior caret snaps to the configured atom edge.
Ordinary block payloads and sibling targets additionally follow the extension
below. Table/image/foreign/other-owning-semantic payloads and unsupported container
crossings refuse before editing.
The programmatic API handles literal plain text too; native events only intercept
incoming mentions or an atom-touching target, leaving unrelated pastes to their
existing owners. File-bearing events and already handled table/image/plugin events
are not consumed. Explicit table-grid clipboard keeps its separate owner.
Use the existing table-owned per-editor `tables:selection` observation to detect
actual contained explicit cells, with a type-only owner import and no table runtime
dependency. Do not infer ownership from spoofable data-mw-selected attributes.
Native copy/cut can run in the bubble phase after the table's capture owner;
native paste must also check that explicit observation before the core handler.

## Ordinary sibling-block extension

Copy/cut and paste-over-selection additionally accept endpoints inside ordinary
P/H1–H6 leaves sharing one parent: editor root, ordinary blockquote, one TD/TH,
or one LI with ordinary P/H leaves. Every crossed sibling must be an eligible
ordinary P/H leaf (formatting-only whitespace may separate them). Do not cross
unsupported list items, containers, cells, nested branches, quote boundaries, semantic roots,
images, links/code or other protected structures. Same-flow legacy behavior is
preserved. Root/container child-index endpoints remain unsupported in this slice.
Validate complete affected leaves and ancestor ownership before mutation; never
clone resource subtrees or partially delete a refused crossing.

Cross-block copy exports each selected block fragment with its safe original tag/
attributes and supported inline marks/references. Partial atom endpoints expand
privately; unselected text is excluded. Preserve empty selected block boundaries
with an editable placeholder where needed. Plain text separates block fragments
with LF, in addition to inline BR line breaks; no synthetic ID notation is added.
Copy stays observational and still requires at least one touched valid atom.

Cross-block cut keeps the actual first leaf and its attributes/prefix, moves the
last suffix into it with its inline marks and surviving references, and removes
only selected later leaves/inter-block whitespace. The caret is at the prefix/
suffix join outside atoms; a fully empty result has an editable BR. Unrelated
siblings, actual cell/list/quote ancestors and grid geometry retain identity.

Paste accepts inline content, one P, one heading, or an ordinary P/H sequence.
Inline/one P unwrap into the actual starting inline context, retaining the first
source wrapper and joining the last source suffix. Multiple incoming leaves use
first incoming children in that retained wrapper; intermediate incoming wrappers
retain their own tags/attributes; the final incoming wrapper receives the source
suffix, with the caret between payload and suffix. Remove placeholder BR only at
joined edges; preserve real line breaks and middle empty paragraphs. One heading
remains a standalone heading between retained prefix and suffix wrappers, with
the caret before the suffix. At a single-block caret the same block composition
splits its prefix/suffix. Block composition requires an ordinary P/H starting
leaf; direct-inline LI/blockquote/cell flows keep their earlier inline-only
behavior without implicit promotion. Refuse any mixed inline/block or nested structural
payload. Validate the complete resulting document/resource bounds transactionally.

Whole-token normalization, format precedence, read-only/IME/disposal, table/file
ownership and concrete range/node/revision checks from the first slice apply to
all affected leaves and their actual parent after focus/clipboard callbacks.
Each successful cut/paste is one transaction and one isolated history step,
including forward/backward selection and next typing. No generic structural
selection or new schema/API is implied. Consecutive list items use the separate
bounded extension below.

Add representative cross-block regressions for rich partial/backward copy,
cut joining/history, caret and selection multi-block paste, single heading,
empty edges, merged-cell/list/quote isolation, actual unaffected nodes, refused
middle structures, receiver/schema/size validation and reentrant callbacks.
Update the older cross-block refusal cases to the newly supported contract while
retaining unique unsupported container/structure regressions.

## Consecutive sibling list-item extension

Extend the same API/native ownership to consecutive ordinary LI siblings of one
actual ordinary UL/OL. Support direct-inline item bodies and item bodies formed
by ordinary P/H sequences, including mixed endpoint body representations across
different items. Use only the safe inline set from earlier slices. Endpoints must
be inside own item bodies, not nested branches; list/item ownership, ancestor
namespaces, concrete items/body nodes, direction, revisions and range points are
checked before and after callbacks. Root/list container child-index endpoints,
unrelated list trees/cells, checklist items, quotes/pre/figures/resources,
foreign or other semantic owners and mixed inline/block item bodies refuse.

Selected nested branches additionally follow the recursive extension below.
Refuse unsupported selected branch contents atomically rather than flattening
or losing their content. The final item's
unselected later ordinary bodies and trailing ordinary UL/OL branches survive as
actual nodes, in their original order. Branch contents stay opaque and are never
cloned or copied merely for preservation. Interleaved blocks after branches stay
outside this profile. Same-item and ordinary sibling-block behavior is preserved.

Cross-item copy serializes one safe original UL/OL wrapper with selected LI
fragments and their validated attributes. Preserve selected partial endpoint
bodies and fully selected middle bodies/items; expand touched atoms privately.
Keep direct-inline versus P/H item-body structure and formatting. Plain text uses
LF between own body blocks and between items, without bullets/hidden ID syntax.
Copy still requires at least one touched valid atom and changes no focus/selection.
List start/reversed/marker attributes are copied as stored; selection-relative
numbering is not recalculated.

Cut keeps the actual first LI and original list attributes, first unselected
preceding bodies/prefix, and joins the final suffix into the retained starting
body. Remove selected subsequent bodies/items and formatting gaps; append the
actual final unselected following bodies/branches in order under the first item.
Promote a direct-inline retained body to an ordinary P only when later block
bodies require an unambiguous item shape, moving its actual descendants. No LI
may be nested directly in another LI. Empty joins retain an editable placeholder.

Paste accepts previous inline/one-P/P-H profiles over a supported cross-item range
and additionally one ordinary UL/OL payload containing one or more ordinary
LI bodies (nested branches follow below; no task metadata or mixed/orphan roots). A list payload
requires a supported list-item target at a caret or selection; refuse it outside
an eligible item. Merge first incoming own-body content into the retained first
item at its prefix; insert following incoming items as actual siblings within
the existing target list. The final incoming item receives the source suffix,
unselected subsequent bodies and branches, with the caret before the suffix.
One incoming item stays within the retained target LI. Preserve incoming later
item/body attributes and target list attributes; the target list type wins and
no automatic counter renumbering/coalescing is implied. Insert multiple P/H roots
as bodies within the retained item rather than as separate items. An ordinary
single heading retains its standalone body semantics. Direct-inline items may
be promoted to ordinary P bodies when composition requires block siblings.

Rebuild incoming list data through the receiver schema before active rendering;
bound nodes/depth/serialized and text sizes before uncontrolled allocation.
Retain all earlier writer/reader race, no-resource-clone, readonly/IME, disposal,
table/file ownership and one-transaction/history guarantees. Native cut writes
both formats before changing items. Plain text never reconstructs an identity.
Add focused representative tests (not a full factor matrix), migrate obsolete
cross-item rejection cases to actual cross-list/unsupported-branch barriers, and extend the
memory demo and both languages with the exact supported/refused profiles.

## Transfer through selected trailing nested branches

Support fully covered trailing ordinary UL/OL branches on the first and
intermediate items of the existing same-list sibling-endpoint profile. Recursively
accept direct-inline or ordinary P/H own bodies followed by ordinary UL/OL branches
with the same shape. Sibling endpoints use this profile; endpoints at different
levels additionally follow the structural interval below. Bodies after branches
remain unsupported. Preserve nested UL versus OL, list/item/body
attributes and every registered mention ID. Do not flatten, coalesce, retag or
renumber the branch tree.

Cross-item copy includes the fully selected branches after each corresponding
selected own-body fragment, preserving depth-first source order and hierarchy in
schema-validated HTML. The final item's unselected following bodies/branches
remain outside the copied fragment. Plain text emits visible text in source
order with LF at body/item/branch boundaries, without invented bullets, indentation
or hidden IDs; hierarchical structure is represented by HTML. Copy remains
observational. Cutting removes covered branches only after both clipboard writes
succeed, joins source edges as before and retains unselected final nodes by actual
identity. Inline/P/H replacement over the same selected interval also removes
fully selected branches as selected content; it must not retain a hidden duplicate.

Incoming list payloads may contain recursively nested trailing branches. Keep
branches belonging to the first incoming item under the retained first target
item; insert subsequent outer incoming items as siblings. On the final incoming
item (or retained item for a one-item payload), append source suffix and unselected
following own bodies before trailing branches, then preserve incoming branches
followed by unselected source branches. Move actual incoming/source branch roots
without merging their internal lists. No own-body block may appear after a branch,
and no LI may be a direct LI child. Direct-inline bodies receive P promotion only
when required by following body blocks; branches alone do not force promotion.

Use one shared bounded recursive policy for selected source branches and incoming
normalized list trees: node/depth/serialized bounds apply before rendering and
uncontrolled allocation, across the complete selected/pasted tree. Reject selected
foreign/resource/quote/pre/table/link/code/task/other-owned content at any depth
before mutation or native clipboard writes. Unselected final branch descendants
remain opaque; do not clone or serialize them just to preserve them. Serialization
reconstructs typed data rather than cloning active DOM resources. Concrete selected
branch root identities, parent/list/item/body shape and DOM/intent revisions are
revalidated after callbacks. A rejected nested branch invalidates the complete
operation without plaintext fallback, partial source removal or history revision.

Keep all earlier read-only/IME/disposal, table/file ownership, native writer/reader
race and single-transaction/history contracts. Add focused regressions for first/
middle/deep branch ID transfer, native cut/history and following-node identity,
nested list paste at caret/over selection including one incoming item, branch
order and empty own bodies, deep malformed/resource/task/size rejection and
callback replacement. Migrate prior blanket crossed-branch/nested-payload refusal
tests to unsupported protected branch cases. Add RU/EN docs and memory-demo controls
showing both retained hierarchy and the separate final unselected branch.

## Different-level structural intervals and feature completion

This is the final planned mention clipboard expansion in this milestone; later
work returns to the broader roadmap. Do not invent successive mention-specific
micro-milestones for every list permutation. Concrete regressions and verified
bugs remain eligible fixes. Runtime acceptance is still pending while tests are
paused; implemented scope must not be described as universal list editing.

Accept own-body endpoints at different levels within one ordinary recursive list
tree: ancestor-own-body to descendant, descendant to later ancestor-level item,
and cousin branches. Resolve the closest common actual UL/OL containing both
endpoints, without crossing unrelated list roots, cells or protected owners.
Existing sibling/same-flow behavior retains priority and its joining semantics.
Validate concrete endpoint paths, intersected ordinary LI/body/list wrappers and
fully selected subtrees through the existing bounded grammar. Endpoints within
links/code/task/foreign/semantic/mixed/interleaved bodies remain barriers. Root/
UL child-index endpoints remain unsupported. Partial atom edges expand privately.

Copy reconstructs the selected typed tree under the common list wrapper, clipping
text/marks at the endpoints while preserving required ancestor LI/UL/OL shells,
attributes, fully selected branches and IDs. Unselected ancestor body text and
outside siblings are excluded. Empty context-only own bodies may need a BR to
retain valid editable list shape. Plain text follows the same LF policy as the
recursive slice; nesting is represented by HTML. No active DOM clone is used.

For different-level cut/replacement, preserve partial endpoint paths at their
existing levels rather than joining/flattening across levels. A validated Range
deletion removes exactly selected text/nodes; fully covered siblings/subtrees are
removed, surviving endpoint wrappers and unrelated nodes keep identity. Repair
only affected empty own bodies/leaves with editable placeholders and remove empty
selected-path list shells if necessary, without rewriting unrelated branches.
Leave the caret at the original start boundary outside tokens. Unselected endpoint
suffixes remain in their surviving structural paths; no implicit dedent or level
reparenting is performed just to join text.

Paste first performs that interval deletion and inserts the existing validated
inline/P-H/recursive-list payload at its retained starting own-body caret using
the established same-item composition rules. A list payload adapts its outer list
type to the target list, preserving its internal hierarchy and IDs; context-only
ancestor shells in copied HTML are real structural data, not a mapped-position
instruction or automatic relative-depth rewrite. Unselected target branches move
only under the existing explicit list-paste composition rules. Do all operations
inside one transaction/change/Undo with original forward/backward history. Reject
the complete operation before native clipboard writes/mutation when preflight
finds an invalid intersected path/subtree. Snapshot actual common root, endpoint
paths, ranges, intent/API/DOM revisions and revalidate after all callbacks.

Add a compact representative set for all three endpoint relationships and native/
API copy/cut/paste, actual surviving hierarchy/suffix nodes, branch IDs, next typing
and history, partial backward atoms, source/receiver isolation, unsafe paths/tree
limits and callback replacement. Migrate obsolete cross-level refusals to unrelated
tree/owner/structure barriers. Add RU/EN demo selections with clearly explained
non-flattening result. Keep optional weight/core boundaries and test pause intact.

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

Capture live range/flows/common parent/actual atom nodes and intent/API revision. Revalidate after
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

## Browser boundary regressions — 2026-11-19

Retain the insertion Range independently of native editable-caret canonicalization when composing subsequent incoming list items. Normalize text before installing the final native caret; equivalent neighboring text boundaries are allowed while retaining the same logical position. Ordinary insertion immediately beside an atom stays outside its label, including WebKit. Pointer activation must retain the whole-token selection after the browser default pointer focus sequence. Synthetic clipboard fixtures explicitly provide their in-memory transfer on all engines; a constructor-created transfer is not evidence that a browser exposes that same object.
