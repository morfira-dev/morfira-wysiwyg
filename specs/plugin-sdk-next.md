# Plugin SDK: revision-bound selection handles

Status: **accepted implementation contract — 2026-11-23**. The next SDK block
adds revision-bound selection handles and adopts them in the link form. Runtime
and package evidence must be recorded separately in verification-backlog.md.
The phase-1 schema/command contract remains [plugin-sdk.md](plugin-sdk.md).

## Accepted public contract

`editor.selection: EditorSelectionHandles` exposes `capture()`,
`isCurrent(handle)`, `getRange(handle)`, `restore(handle)` and `release(handle)`.
Export the opaque `EditorSelectionHandle` and `EditorSelectionHandles` types
through the existing core/facade entrypoints. Capture returns undefined without
one valid native range owned wholly by the connected editor. Handles are frozen
opaque identities; foreign/forged/released/stale handles refuse observational
queries/restoration without throwing or mutating content/history. getRange returns
an observational clone and cannot be used to change internal boundary authority.
isCurrent/getRange may observe an unchanged target inside a synchronous transaction;
capture/restore refuse there. Actual DOM mutation invalidates the observed target.

Capture preserves actual boundary nodes, offsets and direction, including BR,
empty-block and element child-index boundaries. Selection-only changes do not
invalidate document currentness. This is not authority to apply an old draft:
consumers separately check semantic targets, newer selection intent, read-only,
composition, dismissal and lifecycle before executing existing guarded commands.

Any committed content change, external replacement with different actual nodes,
undo/redo that changes content, rollback rebuilding nodes, or pending observed
subtree mutation invalidates handles. Freshness checks drain MutationObserver
records synchronously, including replacement with identical HTML before observer
delivery; comparing serialized HTML alone is insufficient. A capture made while
uncommitted DOM mutations are pending refuses. Same-value controlled feedback
preserves handles only when it retains the original document nodes. Direct DOM
mutation is trusted application code, but observed changes fail closed; this API
does not authorize or sanitize direct DOM changes. Detachment/replacement and
invalid boundary offsets also refuse.

Composition start invalidates existing captures and capture/restore refuse during
composition. Read-only permits observational capture/restoration, never mutation.
restore makes no explicit focus call; browser-native Selection assignment can
still focus a contenteditable. Revalidate after assignment and any synchronous
application callbacks; reject changed/destroyed targets and do not overwrite a
new application-selected range. Invalid calls do not deliberately change focus,
selection or history; browser/application side effects during an attempted valid
restore are not rolled back as document edits.

release is idempotent and clears retained boundary references. Automatic
invalidation clears references for all active handles; destruction disconnects
observers and releases state. Keep no strong registry of expired handles and no
global mutable editor registry. Install mutation tracking lazily when captures
need it; do not impose full-document serialization on every selection query.

The first consumer is only the reusable link form: replace its remembered live
Range authority with handles while retaining anchor/selected-text guards, draft
recovery, focus-time revalidation and existing undo/read-only behavior. Other
forms retain their contracts until separately adopted. Add a public plugin-author
example, focused three-engine regressions, actual-tarball type/runtime smoke,
selective-import verification and raw/gzip/Brotli measurements.

No persisted schema change, runtime dependency, node views, general atoms,
decorations or position mapping is included. These remain subsequent SDK blocks.

## Acceptance and limits

Use representative Chromium, Firefox and WebKit scenarios for exact forward and
backward selection restoration, empty/BR/element boundaries, isolation and forged
tokens, observational clones, same-value feedback, synchronous identical-markup
replacement, native input/composition, rollback, history, release and destruction.
Exercise focus callbacks that replace content, select a newer target or destroy
an editor; assert refusal and preserved content/history rather than implementation
layout. The link form retains its existing semantic and draft-recovery matrix.

The initial 1–2 KB gzip engineering expectation is not a new guard or a measured
result. Measure the actual core and affected selected-profile overhead, count
shared chunks once, preserve existing budgets and record evidence honestly.
Runtime behavior and docs tests do not establish complete accessibility or memory
leak freedom. No heap/GC claims follow from checking explicit disposal.
