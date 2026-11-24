# Events and editor extensions

Morfira is a small modular editor with ready-made essential plugins. Applications select imports; core never loads tables, images or a framework automatically. Custom extensions use the same public commands, transactions and events.

## Core events

```ts
const stopChange = editor.events.on('change', ({ html, source }) => {
  console.log(source, html);
});
const stopSelection = editor.events.on('selectionchange', (selection) => {
  console.log(selection?.index, selection?.length);
});
const stopReadOnly = editor.events.on('readonlychange', (value) => {
  console.log(value);
});
const stopLocale = editor.events.on('localechange', ({ locale, translations }) => {
  console.log(locale, translations);
});
const stopDestroy = editor.events.on('destroy', () => {
  // Final cleanup. Editor commands are already unavailable.
});
```

`change` follows a user operation, undo/redo or an external replacement that actually changes the value (`source: 'user' | 'api'`). `selectionchange` provides a `TextSelection | undefined` snapshot; a notification does not promise the value changed on every call. `readonlychange` only reports actual transitions. Each core listener receives an independent small snapshot.

`localechange` supplies an independent `EditorLocale` snapshot `{ locale, translations }` only when language configuration changes. It is not a document `change` and changes no content, selection or history. Its subscription has the same cleanup rules as other core events. See [localization](/localization) for keys, fallback and localizing custom UI.

Existing `subscribe` and `onSelectionChange` remain compatible facades. Subscriptions are not immediate. Every returned disposer is idempotent, including after destroy. Subscriptions belong to the instance and are automatically cleared on teardown.

## Controlled input commit receipts

`EditorInputCommit` is a core-owned, readonly notification of a completed input operation. Subscribe with `editor.events.on('inputcommit', listener)`; plugins cannot emit it. It is not a command bus, an RPC result or a cancellable/precommit transform.

| Field | Contract |
| --- | --- |
| `inputType` | `'insertParagraph'` or `'insertFromPaste'` |
| `sourceEvent` | The exact causal DOM `Event`, for identity correlation only |
| `selection` | Post-input `SelectionBookmark` or `undefined`; each listener gets independent bookmark objects and path arrays |
| `isCurrent()` | Whether the committed content, actual structural selection and pending caret formats still match, with the editor active, writable and outside composition |

```ts
import type { EditorInputCommit } from '@morfira-dev/wysiwyg';

const stopInput = editor.events.on('inputcommit', (receipt: EditorInputCommit) => {
  if (!receipt.isCurrent()) return;
  console.log(receipt.inputType, receipt.sourceEvent.type, receipt.selection);
  // Revalidate your own bounded candidate/context before any follow-up command.
});

// When this observer's owner is disposed:
stopInput();
```

This slice covers only changed, validated **core-controlled** paragraph insertion and actual clipboard paste from a cancelable cause. The cause can be a beforeinput event, a direct plain-list keydown or clipboard paste; when list keyboard normalization dispatches beforeinput, that normalized event is the cause. `sourceEvent` carries no authority: modifying/canceling it cannot undo the committed input. It exposes no clipboard payload in the receipt. Plugin-local preparation may correlate the exact event identity with a WeakMap; generic `change` is not input identity.

Native-only input, Shift+Enter, blocked/canceled/rejected/no-op operations, composition, API insertHTML/setHTML/setJSON, ordinary plugin commands and history do not produce this receipt. It is not universal input middleware.

The operation's `change` and `selectionchange` notifications precede `inputcommit`. Delivery remains synchronous FIFO, with independent bookmarks per listener. Reentrant edits or selection/format changes may make a receipt stale before your listener runs; disposal, read-only or composition activation also invalidate it. `isCurrent()` does not focus or select anything and is not authorization or detection of arbitrary untracked DOM mutation. Moving selection away and back can leave the same current state.

Notification failures occur after commit, outside rollback. All applicable listeners/receipt delivery are attempted even after an earlier change/selection listener throws; aggregated errors are reported afterward. Destroy follows the existing delivery-stop rules. A follow-up validated command creates a separate transaction/history operation: a receipt cannot retroactively join the original input. [Autolink](/autolink) deliberately keeps Enter/paste and conversion as two Undo operations.

## Plugin cooperation

A shared contract module defines a typed token:

```ts
// types.ts
export interface AssetInserted {
  src: string;
}
```

```ts
// events.ts
import { createPluginEvent } from '@morfira-dev/wysiwyg';
import type { AssetInserted } from './types';

export const assetInserted = createPluginEvent<AssetInserted>('assets:inserted');
```

One plugin reports a completed operation; another observes it:

```ts
import type { EditorPlugin } from '@morfira-dev/wysiwyg';
import { imageCommands } from '@morfira-dev/wysiwyg/plugins/images';
import { assetInserted } from './contracts/events';

export const assetStatus = (): EditorPlugin => ({
  name: 'asset-status',
  setup: (editor) => editor.events.on(assetInserted, ({ src }) => {
    console.log('Inserted', src);
  }),
});

// In the application controller, after resolving your storage URL:
imageCommands(editor).insert({ src: '/uploads/photo.png', alt: 'Photo' });
editor.events.emit(assetInserted, { src: '/uploads/photo.png' });
```

Plugins import **the same token**. Two factory calls with the same name create different events. Public `emit` cannot accept core event strings. Creating/importing tokens is SSR-safe; there is no global channel linking editors.

Custom payloads belong to the application: no deep copy or security boundary is implied. Treat them as immutable. Events are notifications, not a replacement for direct commands or a way to return editing results. `false`, a Promise or `preventDefault` cannot cancel an edit.

## Ordering and errors

Delivery is synchronous. Nested events enter a FIFO queue: all listeners see the current event before the next one. Newly added listeners wait for the next event; listeners removed before their turn are skipped. Destroy stops ordinary queued delivery and clears subscriptions.

A throwing listener does not block the others: an `AggregateError` is thrown after delivery. A completed document/history edit **is not rolled back**. Handle your listener errors; controllers can catch notification errors from `emit` or editor commands. Async listeners are not awaited and do not join a transaction; handling their Promises is application-owned.

## Composable commands

```ts
editor.transact(() => {
  editor.format('header', 2);
  editor.format('align', 'center');
});
```

Nested `transact`, ordinary formatting and `insertHTML` join the outer operation: one history entry and one final `change`. Intermediate selection notifications are deferred. A nested mutation failure rolls back the entire operation even if an inner callback catches it.

`setHTML`, `setJSON`, undo/redo, destroy, `setLocale` and read-only changes are forbidden inside a transaction. A read-only outer transaction is a no-op. Callbacks are trusted and **synchronous**: await data first, then call transact. Async functions/returned thenables are rejected; the editor cannot cancel arbitrary application-scheduled work. Do not mutate DOM after the callback returns.

Transactions introduce no collaboration engine, command RPC bus or heavy background operations. See [structural slash commands](/suggestions#structural-slash-commands) for a concrete example.

Calling `editor.events.emit` inside a transaction is also forbidden and causes complete rollback even if caught. Emit notifications after a successful operation.
