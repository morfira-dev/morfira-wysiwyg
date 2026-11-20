# Optional rich text drag/drop

Implement `/plugins/text-drop` as an independently imported zero-dependency plugin,
not a change to core's default blocked drop behavior or a default preset install.
Exports textDrop(options?), textDropCommands(editor), TextDropOptions,
TextDropState, TextDropCommands. Options copied/strictly validated before setup:
enabled?: boolean (default true), onError?: (error: unknown)=>void. Commands expose
fresh getState():{enabled:boolean}, setEnabled(boolean); these preferences are
non-document state and readonly-safe. Disposed APIs throw; setup/listeners/state
and cleanup are per editor, even when one plugin factory is reused. SSR-safe.

Support noncollapsed selections wholly within one ordinary inline flow: P/H1–H6,
direct-inline LI, blockquote or TD/TH; wrapped P/H list bodies are supported via
their own closest flow. Both endpoints must share the closest flow. Selected
fragments may contain text, BR and safe inline marks/links/spans, never image,
figure/caption, pre/code, table/list/structural wrappers, protected semantic nodes,
foreign namespaces or contenteditable=false. Ordinary code inline is excluded.
Source and target ancestors cannot be protected. A drop target is a collapsed real
DOM Range resolved from native caretRangeFromPoint/caretPositionFromPoint at the
event coordinates, owned by this actual connected editor wrapper. Unsupported
targets are refused, not inferred through global character offsets or current
selection. Allow empty supported leaf boundaries. Native pointer/device variation
is not certified by constructed DragEvent tests.

At supported dragstart, capture a live source Range, literal text, sanitized inline
HTML and document revision, write both transfer formats, and add a bounded opaque
per-drag private MIME token. Do not mark document nodes or move source yet. If
writing fails, cancel the owned drag and preserve source. Never log transfer text.
Bound each original HTML/plain transfer to 20000 UTF-16 units; oversize or empty
payloads refuse atomically. Use inert parsing/serialization, no active resource
rendering or raw unvalidated markup sink. HTML may have a single ordinary P/H
wrapper that is unwrapped to inline content; multiple/structural wrappers, images,
semantic markers and protected/foreign contents reject. Do not fall back to plain
text when a nonempty HTML payload fails. Plain text preserves literal characters
and converts CRLF/CR to LF, then line breaks to BR, without interpreting markup.

External transfers and transfers from a different editor always copy. A matching
current instance-owned private token moves the source by default; Ctrl/Meta/Alt
explicitly copy. Native dragover advertises allowed copy/move only for supported
types/target; don't parse whole payload repeatedly. Never claim any file transfer
(files/items or Files type), leaving existing image/table clipboard ownership
untouched. Unrecognized or defaultPrevented events stay with their owner.

Move source deletion and insertion compose inside one existing synchronous
editor.transact; insertion uses validated existing insertHTML. A live destination
Range tracks earlier source deletion without text-offset guesses. Preserve source
and target block/cell/list structure, selected rich formatting, unselected text,
rowspan/colspan and neighbors. Normalize only touched inline flows; an emptied
source gets an editable BR, while remaining BRs are retained. Drop inside/on either
edge of its source is consumed as a no-op, preserving history and redo. Destination
caret ends after inserted content; next typing stays there, outside newly inserted
trailing mark/link wrappers while preserving the pre-existing destination context.
Undo restores original
content and drag source selection, Redo restores moved content/post-drop caret.
Success is one user change. Invalid/failed/stale drops must not delete source.

Reserve and revalidate actual source/destination ownership, revision, range/text,
enabled/composition/readonly state before and after editor.focus(), transfer
callbacks and transaction entry. Focus/application callbacks may replace content,
destroy the plugin or focus outside the editor. Refuse without redirecting a stale
operation. Any committed document change invalidates the pending move; readonly,
composition, disable, dragend and disposal clear owned drag state. Suppress native
deleteByDrag for the owned gesture so browser follow-up cannot delete source a
second time. This is a bounded gesture guard, not a new generic beforeinput model.
Composition guards recover on API replacement/readonly cancellation, even without
compositionend. Diagnostics are trusted callbacks; exceptions cannot leak state.
Plugin is not an application sandbox, generic atomic-node SDK or backend policy.
Inspect actual selected nodes before cloneContents so rejected source images do
not cause active-document clone resource work. Perform transfer writes/dropEffect
callbacks before document mutation and revalidate afterwards. A canceled dragstart
releases its gesture guard immediately, since dragend may never arrive. Existing
transactions.md still governs post-commit observer exceptions: a committed edit is
retained and is not rolled back merely because a change observer throws.

Add risk-oriented browser regressions: same-flow forward/backward move/copy with
rich marks, cross-flow/list/merged-cell preservation, self-drop no-op/redo, literal
external multiline and inline HTML, malformed/resource/file/semantic refusal,
readonly/IME/focus replacement/transfer-write failure, one transaction/history,
native caret geometry and lifecycle/instance reuse. Run Chromium/Firefox/WebKit
focused cases only. Real OS drag/drop and touch devices remain separate evidence.
Add main demo with draggable selected text instructions and keyboard move/copy
alternatives; explain unsupported structural/mention/file flows in RU/EN docs.
No CSS requirement. Standalone public closure <=15000 gzip JS; measured optional
standard-text-drop-ready keeps 80000 gzip JS/20000 raw CSS. No full local suites,
CI observation or Git writes without explicit request.
