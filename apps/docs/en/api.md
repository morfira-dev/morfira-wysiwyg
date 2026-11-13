# Core API

## Creation options

`createEditor(host, options)` mounts one independent instance into an empty `HTMLElement`.

| Option | Type | Behavior |
| --- | --- | --- |
| `value` | `string` | Initial validated HTML |
| `readOnly` | `boolean` | Defaults to false |
| `placeholder` | `string` | Empty-surface prompt |
| `label` | `string` | Accessible textbox name |
| `plugins` | `EditorPlugin[]` | Fixed at creation; duplicate names rejected |
| `historyLimit` | `number` | 1–10000 revisions, default 100 |
| `onChange` | `(change: EditorChange) => void` | Changes after initialization |

## Document API

| Method | Result |
| --- | --- |
| `getHTML()` | Validated semantic HTML |
| `getText()` | Browser-rendered plain text; line spacing follows block semantics |
| `getJSON()` | Version 1 `EditorDocument` tree |
| `setHTML(html)` | Replace validated content; changed external content clears history |
| `setJSON(document)` | Validate schema before replacing content |
| `getSelection()` | `{ index, length }` text offsets, or undefined outside the surface |
| `setSelection(index, length?)` | Select text; nonnegative integer offsets |
| `getFormats()` | Active formats at selection start |
| `format(name, value)` | Undoable user-format command |
| `insertHTML(html)` | Validated paste-like replacement of the current selection |
| `setReadOnly(value) / isReadOnly()` | Control and query user editing |
| `focus()` | Restore the last known selection when possible |
| `undo() / redo()` | Own document history with selection bookmarks |
| `canUndo() / canRedo()` | History availability |
| `transact(mutate)` | Atomic undoable trusted plugin edit; errors restore content |
| `subscribe(listener)` | Document subscription; returns disposer |
| `onSelectionChange(listener)` | Selection/read-only notification; returns disposer |
| `providePlugin(name, api) / getPlugin(name)` | Instance-local typed plugin API |
| `destroy()` | Dispose listeners, plugins and view; idempotent |

Document methods after destruction throw. Read-only blocks user commands but permits external document replacement. `surface` is the editable HTMLElement; `element` is its container. Direct DOM writes should happen only inside a trusted plugin transaction. Untrusted input must go through HTML/JSON import methods.

## Formatting

Inline: `bold`, `italic`, `underline`, `strike`, `code`, `subscript`, `superscript`. Blocks: `header` (1–6 or false), `blockquote`, `code-block`, `list` (`bullet`, `ordered`, false), `align` (`left`, `center`, `right`, `justify`). `link` uses a checked URL and a nonempty selection. Collapsed inline formatting establishes a typing position; complex cursor-boundary cases remain part of browser compatibility work.

## Events and toolbar

```ts
interface EditorChange {
  html: string;
  text: string;
  source: 'user' | 'api';
}
```

Initial content emits no change. Adapter feedback from external value updates is suppressed. Debounce application persistence as needed.

```ts
const dispose = createToolbar(host, editor, [
  { label: 'Bold', text: 'B', format: 'bold' },
  { label: 'Undo', text: '↶', run: (instance) => instance.undo() },
]);
```

The default toolbar has Russian labels; supply your own actions for localization. It preserves text selection and exposes disabled/pressed states. A complete dropdown/dialog system and accessibility audit are future work.
