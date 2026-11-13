# Typed editor events

Status: accepted implementation contract. The event layer is a small per-editor notification API, not a command bus or plugin dependency system. No runtime dependency or global editor channel is introduced.

`createPluginEvent<T>(name)` creates an opaque SSR-safe token. Plugins export shared tokens from their contracts and use `editor.events.on(token, listener)` / `emit(token, payload)`. Equal display names do not merge independently created tokens. Core owns reserved string events `change: EditorChange`, `selectionchange: TextSelection | undefined`, `readonlychange: boolean`, and `destroy: void`. Public emit accepts only plugin tokens; reserved lifecycle events cannot be spoofed. Existing subscribe/onSelectionChange remain compatible signatures.

Delivery is synchronous FIFO: nested emit queues behind the current notification. Listener sets are snapshotted; removed listeners are skipped and new listeners wait for the next event. All current listeners are tried even if another throws; errors are reported in an AggregateError after the queue drains. Notification errors never roll back committed document/history state. Core payloads are independent snapshots per listener; plugin payload ownership remains with the emitting application (no arbitrary deep cloning).

Read-only events represent real state transitions. Selection events within a transaction wait for the final commit or rollback. Destroy marks the editor inactive, delivers the final destroy event, stops ordinary queued delivery and clears all subscribers even if teardown callbacks fail. Dispose functions remain safe and idempotent after destroy. Setup failure also tears down the event resources.

Acceptance: native/API/history notifications, aliases, typed custom payloads, same-name token isolation, per-editor isolation, add/remove/reentrant order, listener errors with committed history, destroy during delivery and throwing cleanup, SSR-safe factory, rejected reserved emission. No wildcard topics, transport, async subscribers, middleware, cancellable mutations or collaborative state is implied.

Custom editor.events.emit inside a document transaction is rejected and poisons the outer operation even if caught. Emit notifications only after a successful transaction; no extra buffering is introduced.
