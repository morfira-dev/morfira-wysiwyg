# Application-owned save-state integration

Status: accepted large-block slice; executed evidence belongs to verification-backlog.md.

## Independent behavior and UI

Expose `/plugins/save-state`: `saveState(options)` and `saveStateCommands(editor)`.
Options require `save(document: EditorDocument, context: SaveStateContext): void |
Promise<void>`; optional autoSave?:boolean (default false), debounceMs?:integer
0–60000 (default500) and onError?. Validate/copy configuration before installing.
Context has readonly signal:AbortSignal and revision:number. No implicit fetch,
storage, beforeunload handler, timer polling, URL/auth policy or server versioning.
Core/presets do not install it. Plugin state is per editor and runtime-dependency-free.

Export SaveStateStatus = 'saved'|'dirty'|'saving'|'error', SaveStateSnapshot
{readonly status, dirty:boolean, revision:number, savedRevision:number},
SaveStateContext, SaveStateOptions, SaveStateCommands. Commands: getState() returns
an immutable snapshot; save():Promise<boolean>, retry():Promise<boolean>,
markSaved():void, subscribe(listener):()=>void. A subscription is observational,
instance-owned, cleaned automatically; define and document immediate delivery
(the initial state is delivered once on subscribe). Disposed commands except an
idempotent unsubscribe reject; pending work settles false on cancellation.

Expose separate `/ui/save-state` and explicit `/ui/save-state.css`:
`createSaveStateUI(host, editor, options?)` requires the plugin and accepts label?
and onError?. Return readonly element, refresh(), destroy(). Export adjacent
SaveStateUIController/Options/MessageKey and saveStateUIMessages RU/EN. A native
Save/Retry button and polite localized status show saved/unsaved/saving/error;
use generic errors rather than backend messages. Empty external same-document
HTML host, instance ownership, cleanup and setup rollback match existing optional UI.
Readonly does not prohibit persisting already committed unsaved content; storage
authorization belongs to the application. Composition disables capture/Save until
committed or canceled. UI can search no content and never edits the document.

## Revision, concurrency and cancellation

Start saved at revision0/savedRevision0. Every semantic user change (including
Undo/Redo) increments revision and marks dirty; matching an old byte sequence does
not automatically acknowledge persistence. Core controlled feedback with identical
content must not create a new revision. Real source:'api' document replacement
establishes a new saved baseline, aborts/invalidates pending work and clears retry
state. markSaved() is explicit application acknowledgement of the CURRENT revision,
with the same cancellation behavior. Do not touch document/history/selection.

A save captures only one detached validated JSON snapshot of the current committed
revision, with no live DOM references. Callback mutation of that snapshot cannot
modify the editor. One callback is in flight per instance; concurrent save/retry
coalesce to its Promise and must not double-submit. Set request ownership before
notifying subscribers/calling trusted code; revalidate after reentrant callbacks.
Success acknowledges only the captured revision. If user edits while saving, the
newer revision remains dirty, and opt-in autosave schedules its later snapshot
only after the earlier request settles. Failure retains dirty=true and generic
error status; retry captures the CURRENT revision rather than resending stale
failed data. Promise-returning, synchronous and throwing callbacks are supported.
No unhandled rejected promises from failed/aborted/ignored late work.

AbortController plus generation/request ownership guard disposal, real API replacement
and markSaved. A callback may ignore AbortSignal: cancellation must still settle
owned returned promises false promptly and consume later fulfillment/rejection
without updating a new baseline or another request. Never claim that abort rolls
back an already completed server write; applications need their own document IDs,
authorization/idempotency/concurrency checks. No raw backend error text enters UI.

Autosave is opt-in and debounced, not a full-document read on each keystroke.
Keep no snapshot while merely dirty; snapshot only when actually invoking save.
At most one in-flight snapshot and one later dirty intent. Autosave never captures
provisional IME content; defer until composition commits. Composition tracking
recovers after API/readonly cancellation without relying on compositionend. Clear
all timers, controllers, subscriptions and owned UI on disposal/setup failure.
Thrown diagnostics/subscriber callbacks cannot prevent required cleanup or notify
another instance. Subscriber reentrancy must not duplicate request completion.

## Acceptance and documentation

Use focused three-browser cases for revision/Undo state, manual and debounced save,
one-inflight/coalescing/edit-during-save, success/error/retry, API baseline and
markSaved cancellation (including callback ignoring signal), reentrant callbacks,
readonly/IME recovery, detached snapshot and two-instance/disposal/UI localization.
Prefer representative cases instead of multiplying every combination.
RU/EN demo simulates latency, one recoverable error and edit-during-save without
network/storage. Guide distinguishes UI state from server acknowledgement and
makes application-owned backend validation/auth/conflict policy explicit.

Budgets: headless plugin 8000 gzip JS, UI closure/standalone12000 gzip JS including
retained selected core helpers, CSS2000 raw bytes. Measure deduplicated
standard-save-state-ready (behavior+UI) under 80000 gzip JS /20000 raw CSS, and
standard-authoring-ready with preview+save-state UI under the same standard cap.
No new dependencies, implicit fonts, core imports of optional modules or budget
increases. Full local suites/matrices require a fresh explicit user instruction.
