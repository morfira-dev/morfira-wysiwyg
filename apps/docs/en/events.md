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

`localechange` supplies an independent `EditorLocale` snapshot `{ locale, translations }` only when language configuration changes. It is not a document `change` and changes no content, selection or history. Its subscription has the same cleanup rules as other core events. See [localization](/en/localization) for keys, fallback and localizing custom UI.

Existing `subscribe` and `onSelectionChange` remain compatible facades. Subscriptions are not immediate. Every returned disposer is idempotent, including after destroy. Subscriptions belong to the instance and are automatically cleared on teardown.

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

Transactions introduce no collaboration engine, command RPC bus or heavy background operations. See [structural slash commands](/en/suggestions#structural-slash-commands) for a concrete example.

Calling `editor.events.emit` inside a transaction is also forbidden and causes complete rollback even if caught. Emit notifications after a successful operation.
