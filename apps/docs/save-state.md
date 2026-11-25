# Save state

`saveState()` connects the editor to application-owned persistence. It tracks local revisions, unsaved changes, an in-flight callback and failure; separate `createSaveStateUI` displays status and native Save / Retry controls. It supplies no network client, storage or default automatic saving.

Open “Document saving” on the homepage or in the [playground](/playground). The demo prepares unsaved content, simulates 700 ms latency, one recoverable failure and an edit while saving. **It sends and stores nothing.**

## Setup

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { saveState, saveStateCommands } from '@morfira-dev/wysiwyg/plugins/save-state';
import { createSaveStateUI } from '@morfira-dev/wysiwyg/ui/save-state';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/ui/save-state.css';

const editor = createEditor(editorHost, {
  locale: 'en',
  plugins: [saveState({
    save: async (document, { signal }) => {
      // Illustrative application transport: replace endpoint and server contract.
      const response = await fetch('/api/documents/current', {
        method: 'PUT', signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document }),
      });
      if (!response.ok) throw new Error('Application save failed');
    },
  })],
});
const saving = saveStateCommands(editor);
const view = createSaveStateUI(saveHost, editor, {
  onError: (error) => console.error(error),
});
const unsubscribe = saving.subscribe((state) => {
  console.log(state.status, state.dirty, state.revision, state.savedRevision);
});
```

`saveHost` must be an empty connected same-document HTML element outside editor content. The UI requires the plugin. JS/CSS are explicitly selected, outside core/preset defaults. Subscriptions receive the initial snapshot immediately and then instance-owned updates.

## State and commands

`SaveStateSnapshot` is an immutable `{ status, dirty, revision, savedRevision }` snapshot.

| `status` | Meaning |
| --- | --- |
| `saved` | The current local revision has application acknowledgement |
| `dirty` | Content changed after the last acknowledgement |
| `saving` | A persistence callback is pending; newer edits may already exist |
| `error` | The callback failed and the document remains unsaved |

`SaveStateCommands` exposes:

- `getState()` — a fresh state snapshot.
- `save(): Promise<boolean>` — save the current committed revision; `true` means the owned callback completed successfully.
- `retry(): Promise<boolean>` — save the **current revision**, not stale failed data.
- `markSaved()` — explicit application acknowledgement of the current revision, canceling owned pending work.
- `subscribe(listener)` — initial and subsequent snapshots; returns an idempotent unsubscribe.

Concurrent `save()` / `retry()` share the in-flight Promise without submitting twice. Commands reject after disposal; canceled pending work settles `false`.

The UI controller has `element`, `refresh()` and idempotent `destroy()`. Options are `label?` and `onError?`; `SaveStateUIController`, `SaveStateUIOptions`, `SaveStateUIMessageKey` and `saveStateUIMessages` are exported. Visible errors are generic and localized; backend response text is not automatically displayed.

## Revisions, newer edits and external values

Start with `revision = savedRevision = 0`. Every semantic user change, including Undo/Redo, advances the local revision. Undo returning to old content does not acknowledge server persistence.

If a request captured revision 4 while the user advanced to 5, a successful reply acknowledges only 4: revision 5 remains `dirty`. JSON snapshots are detached from the editor; a callback mutating its argument cannot edit the source. Saving leaves document, history and selection unchanged.

A real API document replacement establishes a new saved baseline and cancels stale owned work. Identical controlled feedback does not create another revision. This prevents an old reply from acknowledging a newly loaded document. Use `markSaved()` when the application receives acknowledgement by another route.

`revision` is an **instance-local counter**, not a server version, document ID, authorization token or conflict-resolution guarantee.

## Opt-in autosave

```ts
saveState({
  autoSave: true,
  debounceMs: 800,
  save: (document, context) => persistInApplication(document, context),
});
```

`persistInApplication` is your handler in this fragment. `autoSave` defaults to `false`; `debounceMs` is an integer 0–60000, default 500. Capture JSON only when invoking persistence, not on each keystroke. Retain at most one in-flight snapshot and a later dirty intent. After an older request settles, autosave may schedule the newer revision.

API replacement or readonly cancellation can recover composition tracking without a native `compositionend`. Provisional IME text is never captured for saving. Read-only does not itself prohibit persisting already committed unsaved content; the application owns authorization.

## Cancellation and server responsibilities

Callback context contains `signal: AbortSignal` and captured `revision`. Pass the signal to your transport. API replacement, `markSaved()` and disposal cancel owned waiting work; late settlement cannot update a newer baseline even if the callback ignores abort. Cancellation does not undo a server write that already completed.

Your server must validate documents, user permissions, resource IDs, upload limits and concurrent writes. Retries and multiple tabs require your API's idempotency/version/ETag policy. This plugin installs no `beforeunload` handler and promises neither offline persistence, delivery on page close nor cross-device synchronization.

```ts
unsubscribe();
view.destroy();
editor.destroy();
```

Timers, subscriptions and AbortControllers are cleaned per instance.
