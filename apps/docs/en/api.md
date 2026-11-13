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
| `getFormats()` | Formats at selection start, `mixed`, list depth and indentation availability |
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

Inline: `bold`, `italic`, `underline`, `strike`, `code`, `subscript`, `superscript`. Blocks: `header` (1–6 or false), `blockquote`, `code-block`, `list` (`bullet`, `ordered`, false), `align` (`left`, `center`, `right`, `justify`). `color` and `background` accept a CSS color or false. `link` accepts a URL, `LinkFormat` or false: a selection changes only that fragment; a caret inside a link edits the whole anchor. Unsafe API options throw before document mutation. Collapsed inline formatting establishes a typing position; complex cursor-boundary cases remain part of browser compatibility work.

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
  { label: 'Undo', text: '↶', run: (instance) => instance.undo(), enabled: (instance) => instance.canUndo() },
]);
```

The default toolbar has Russian labels; supply your own actions for localization. The fourth `{ label }` argument localizes the toolbar accessible name. It preserves DOM bookmarks including empty items, exposes disabled/pressed/mixed states and supports arrow/Home/End/Escape navigation. `ToolbarAction.enabled(instance)` controls command availability. A complete dropdown/dialog system and accessibility audit are future work.

Lists support nesting through `format('indent', 1 | -1)`. `format('clear', true)` removes inline formatting from selected text. See [Lists and formatting](/en/lists) for keyboard contracts, mixed states and examples.

[Colors and links: parameters, caret behavior and limitations](/en/styling).

[Images and upload callbacks](/en/images) use the optional `/plugins/images` module.
