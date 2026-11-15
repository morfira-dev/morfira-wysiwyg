# Synchronous composable transactions

Status: accepted implementation contract. `editor.transact(callback)` composes synchronous trusted plugin edits. Nested transact calls join the outer mutation, commit once and create at most one history/change event. Nested mutation failure poisons the outer transaction even if application code catches it; the outer call restores document, selection, typing affinity, undo and redo and throws. No intermediate selection/change notifications are published.

Read-only outer transactions are no-ops. External replacement (setHTML/setJSON), undo, redo, destroy and read-only changes are rejected inside a transaction and poison it. Normal format/insertHTML commands may compose through transact. Selection changes are allowed but their notifications are delayed until the transaction finishes.

At the start of an outer transaction, an expanded native selection invalidates earlier collapsed typing overrides before invoking the callback, after capturing the undo snapshot. This includes a range installed synchronously before the browser delivers selectionchange, and a range spanning nodes with no text length. A replacement that collapses back to the old text offset must not revive those stale overrides. An initially collapsed selection retains its existing effective typing affinity. Nested transactions do not clear formatting established by the outer callback; failure restores the effective pre-transaction snapshot through the existing rollback path.

Callbacks must finish synchronously. Declared async functions are rejected before invocation; returned thenables are rejected and the synchronous part rolled back. This is a trusted callback API: scheduled work/Promise continuations cannot be cancelled by the editor and must never mutate the provided surface after return. Async providers must await before opening a transaction. No async isolation or sandbox for arbitrary application callbacks is promised.

Commit/normalization errors roll back atomically; listener errors happen after commit and never roll it back. A no-op transaction creates no history entry. Undo/redo restores both content and selection after a composed edit. Core does not import optional plugins.

Acceptance in Chromium/Firefox/WebKit: composed formatting/insertion one-step undo/redo, nested caught error rollback, forbidden operations fail atomically, read-only no-op, selection notifications see only final document, no-op history, sync callback/thenable validation, and throwing post-commit observer retains revision/history.

Custom editor.events.emit inside a document transaction is rejected and poisons the outer operation even if caught. Emit notifications only after a successful transaction; no extra buffering is introduced.
