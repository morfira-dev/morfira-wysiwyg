# Optional HTML source editing

Status: accepted implementation contract, 2026-11-23. Public `/ui/source` and
explicit `/ui/source.css`; no dependency, editor core change or preset inclusion.

`createSourceEditor(host, editor, options?)` creates an owned native dialog with
an HTML draft, Check HTML, read-only normalized HTML preview, Apply and Cancel.
`open()` returns whether the dialog opened; `close()`, `isOpen()`, `getValue()`,
`setValue(string)`, `preview()` and `destroy()` form the reusable controller.
The returned preview contains only `{ html, changed }`. A changed preview means
that parsing/serialization normalized the input; it is not a complete diff or a
claim that only dangerous markup was removed. Unsupported tags/attributes/styles
may be omitted, aliases canonicalized and structural wrappers normalized.

Drafts are literal textarea values bounded to 5000000 UTF-16 units, the existing
codec ceiling. Check and Apply use the current instance schema's inert parse and
string serialization, including aggregate document resource limits. The preview
is literal text, not rendered HTML: it cannot fetch resources. Applying accepted
images into the actual document may fetch them under the application's policy.
No regex sanitizer, arbitrary HTML execution, executable preview or grammar
editor is introduced. Schema-registered semantic attributes retain their policy.

Open captures an exact revision-bound native selection; when none exists, it
establishes a root-start caret without importing data. Modal textarea editing is
an application-owned draft and never an editor change. Apply normalizes the latest
draft, closes modal inertness, restores the saved selection and revalidates exact
native points, revision, actual initial HTML, composition, read-only and external
host ownership after focus callbacks and again inside `editor.transact`.

A successful Apply replaces the whole surface using a schema-rendered validated
fragment inside one user transaction. Its resulting caret is collapsed at the
start of the first ordinary root P/H body, before its children. If the first
child is protected/semantic, non-body or leading text, use the root-start gap
instead; never enter an atomic label. An empty accepted document receives the
normal validated P/BR placeholder before selection, so subsequent typing uses
that existing body rather than creating a duplicate paragraph. Undo restores the
original document/selection; Redo restores the source edit. There is no `setHTML` external-replacement call and
no intentional history reset. Same canonical HTML closes without a new entry.
Core may additionally create its normal editable root wrappers/trailing paragraph.
The additive transaction resetTyping option clears stale pending caret formats
after the Undo snapshot, including when old and new carets share text index zero.
No arbitrary structural position map is claimed for whole-document replacement.

Cancel changes no document/history and does not restore a stale native selection.
A changed external value or other editor change closes the stale modal without
applying it; the literal draft remains available through `getValue()`. Read-only,
root composition and destroy close it; confirmed API/read-only composition
cancellation releases local latches. Draft IME blocks Apply until compositionend.
Selection-only movement to a different editor-owned target while open causes
Apply to refuse rather than overwriting that newer intent. Moving/removing the
external host disposes the owned dialog on the next guarded operation/refresh.
Every event/subscription/capture is per editor and cleaned up on destroy.

Focused Chromium/Firefox/WebKit cases cover literal unsafe source and no-network
preview, canonical explanation, one-step history and selection, no-op/cancel,
invalid aggregate resources, stale identical-markup reconstruction, synchronous
focus hooks, newer selection intent, read-only/composition, external host loss,
instance isolation and disposal. RU/EN examples use public imports. Actual runs
and gzip/raw/Brotli/CSS measurements are recorded separately by integration.
