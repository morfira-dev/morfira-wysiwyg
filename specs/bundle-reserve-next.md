# Next standard gzip reserve

Status: accepted behavior-preserving refactor, 2026-11-23. The reported starting
profiles are core 32383, ready standard 72279, standard with table properties
79818/80000 and extended 89125 gzip JS bytes. Final figures must come from the
unchanged coordinated build/size tooling; these starting figures are not a new
measurement by this implementation task.

## Table-properties owned slice

Consolidate duplicated select-option definitions between table property form
construction and draft validation in a feature-owned internal metadata module.
Preserve every option, ordering, localized label key, canonical submitted value,
validation limit, validation message and pre-mutation validation sequence.
Consolidate six identical CSS field/property pairs used by cell change detection
and mutation; keep text alignment/direction, semantic planning, target validation,
transaction/history, state readers and per-cell write ordering with their owner.
No new public API/schema behavior, dependency, shared/core/tables edit, diagnostic
shortening, optional capability removal or measurement/limit/closure change.

The owned slice is expected to save a modest amount; it does not promise 1–2KB
by itself. Retain readable structural refactors only if coordinated measurement
shows useful benefit. Required focused behavior coverage is
`tests/table-properties.spec.ts` and `tests/table-properties-form.spec.ts` across
Chromium/Firefox/WebKit, with `tests/docs/table-properties.spec.ts` when public
demo controls change. Default local policy remains focused checks only; no full
suite, push or publication is authorized by this specification.

## Image selection resolver

Remove the duplicated retained image-range resolver from behavior and form UI
closures through one image-owned helper. Preserve public imports, native-range
containment/clone validation, form-owned saved ranges, caption caret and selected
image/figure resolution, distinct edit/resize eligibility, diagnostics and flags.
Verify existing image caption/form-edit/alignment/size-lock regressions; count
shared JavaScript once in unchanged selected profiles. No image operation,
provider, upload, crop or resize capability is removed.

### Ordered property validation follow-up

Replace repeated own-field checks/assignments with one private ordered validator
registry. Keep rejection of unknown/symbol/non-plain patches before any getter;
validate/read accepted fields in exactly the existing order, including the two
header axes and caption normalization. Keep all diagnostic strings and error
classes. Share typed enum memberships between validators and state readers,
retaining their current allowed values and false/mixed behavior. A local generic
cell-state projection may remove repeated absent-target branches while preserving
reader evaluation order. Target/semantic validation, command planning, transaction
focus guards, captions, row/grid behavior and public types are unchanged.

## Internal core mechanics

Share exactly the existing ordinary-body join mechanics between wrapped list
Backspace, forward sibling-body Delete and the new quote joins. Eligibility and
branch placement stay with each caller. The helper returns a live Range; quote
cleanup still happens before the caller's existing selection finalizer.

Share the identical formatting block-tag set and selected text split into three
UTF-16 fragments. Each visitor keeps its own position update, traversal, inherited
mark/link handling, empty/semantic owner rules, wrapping and compaction. Do not
merge those intentionally different visitors. Retain only measured useful
refactors; existing formatting/link/color/font and list history regressions cover
these paths without implementation-matching tests.

The initial source-inline and detached-payload factoring candidates were not retained: their smaller raw output did not improve the selected gzip profile. Their existing source/payload guards remain unchanged.

Share the identical native Selection removeAllRanges/addRange pair through the
internal selection owner. Each caller still constructs its own Range and reads
its original Document selection at the same point, after its original focus,
mutation and validation. Preserve optional-null behavior and native exceptions;
direction-aware setBaseAndExtent decisions and marker placement remain with their owners. The helper is
not exported through public package entrypoints or command authority.

Native block editing, sibling replacement, paste and root-quote inspection share
one ordinary p/h1–h6 vocabulary/selector under their input owner. Keep the same
tag membership, parent/semantic/namespace guards and each caller's traversal.
Native marker restoration retains its existing backward branch; its ordinary
forward remove/add pair uses the same internal Range application helper.

Image Range application and post-focus align/resize checks share exact mechanics;
style and size signatures, error strings, command guards and callback order remain
caller-owned. Shared image figure/ancestor/descendant inspection keeps edit's
broader ordinary-figure policy separate from strict resize/alignment policy.
A regression preserves metadata edit on complex ordinary figures while refusing
resize/alignment there without mutation or history.


## Final bounded outcome

The combined new quote-input feature and retained optimizations pass every active
size guard. Standard ready is 72638 gzip JS bytes; standard with table properties
is 79961/80000, leaving only 39 bytes. Core is 32868 gzip. This is not the useful
1–2KB reserve originally desired: the new editing behavior consumes most savings.
No limit/profile/charset/compressor change or feature/security-check removal is
used to pass. Final measured raw/gzip/Brotli/CSS and executed focused results are
recorded in verification-backlog.md. Shared enum data remains feature-owned under
table-properties and is reused by command validation, state readers and UI.


## Superseding budget policy — 2026-11-23

The subsequent user-approved Standard guard is 90000 gzip JS bytes. The final
79961-byte composition therefore leaves 10039 bytes of allowance. Historical
39-byte reserve statements describe the previous 80000-byte guard; additional
byte-level reserve refactoring is no longer a next priority. No runtime feature,
compression setting or historical validation result changes with this decision.
