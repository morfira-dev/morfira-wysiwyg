# Core API

## Creation options

`createEditor(host, options)` mounts one independent instance into an empty `HTMLElement`.

| Option | Type | Behavior |
| --- | --- | --- |
| `value` | `string` | Initial validated HTML |
| `readOnly` | `boolean` | Defaults to false |
| `placeholder` | `string` | Empty-surface prompt |
| `label` | `string` | Accessible textbox name |
| `locale` | `string` | Interface language; defaults to `ru`, with built-in RU/EN |
| `translations` | `EditorTranslations` | Instance-local keyed string overrides |
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
| `getLocale()` | Independent `EditorLocale` snapshot `{ locale, translations }` |
| `setLocale(locale, translations?)` | Replace language/overrides without document/history changes |
| `focus()` | Restore the last known selection when possible |
| `undo() / redo()` | Own document history with selection bookmarks |
| `canUndo() / canRedo()` | History availability |
| `transact(mutate)` | Atomic undoable trusted plugin edit; errors restore content |
| `subscribe(listener)` | Document subscription; returns disposer |
| `onSelectionChange(listener)` | Selection/read-only notification; returns disposer |
| `providePlugin(name, api) / getPlugin(name)` | Instance-local typed plugin API |
| `destroy()` | Dispose listeners, plugins and view; idempotent |

Document methods after destruction throw. Read-only blocks user commands but permits external document replacement. `surface` is the editable HTMLElement; `element` is its container. Direct DOM writes should happen only inside a trusted plugin transaction. Untrusted input must go through HTML/JSON import methods.

During active IME composition, `format`, `insertHTML`, `transact`, `undo` and `redo` make no changes, preserving native candidate input. External `setHTML`/`setJSON` with a different value remain authoritative and cancel composition; same-value acknowledgement preserves it. Switching to read-only rolls back unfinished input without adding history. Composition end synchronously commits the result; if the browser subsequently reports another changed composition-specific document, it amends the same undo operation and emits a separate `change`.

## Input and selection at block boundaries

Enter splits an ordinary paragraph or heading while preserving nested formatting. At a heading end it creates a paragraph; an empty ordinary heading becomes a paragraph. Shift+Enter inserts a line break. Backspace at a block start and Delete at its end join adjacent ordinary paragraphs/headings while preserving formatting, the exact caret and one undo operation. This handler does not merge tables, lists, images or other containers.

Text input, Backspace and Delete also replace a selection **across several ordinary `p`/`h1`–`h6` leaves that are direct siblings under one parent**: the editor root, one blockquote or one td/th cell. Both DOM endpoints must be inside those leaves; endpoints expressed as child-node indices on the editor root itself are outside this path. The left block and its attributes, unselected prefix and formatted right suffix are preserved. Covered middle blocks are removed; unrelated blocks and other cells remain untouched. Inserted data stays literal text.

For example, in this document:

```html
<p>Alpha <strong>one</strong></p><h2><em>Beta</em> tail</h2><p>Keep</p>
```

select from immediately after `Alpha ` to immediately after `Be`, then type `X`. The result is:

```html
<p>Alpha X<em>ta</em> tail</p><p>Keep</p>
```

The caret is immediately after `X`, outside the right-hand `em`. One undo restores the original blocks and selection, including backwards direction; redo restores the replacement caret. Subsequent input stays there and has a separate undo operation. Try the **Block boundaries** sample on the homepage or in the [playground](/en/playground).

The replacement payload inherits the starting inline context; it does not force formatting on later native input. If replacement starts inside a link and its resulting caret is at the link edge, `X` and the immediate caret remain inside the link, while the next ordinary character follows the existing native link-boundary policy: outside the link, before the retained right suffix. Logical caret position and separate history are preserved; no new forced link-typing state is introduced.

This path requires cancelable `beforeinput`; already canceled events, read-only and active composition retain their existing guards. It does not introduce a general structural-selection model. Replacement across containers/cells, across table/figure/list/pre/hr or an independent SDK semantic block, paste, drag/drop, word deletion and `insertReplacementText` receive no new normalization through this handler. Noncancelable events retain the previous native path. Synthetic event tests do not certify real mobile keyboards, autocorrection, dictation or system IME.

Public `{ index, length }` values are UTF-16 text offsets. Empty blocks and line breaks may have distinct DOM positions with identical text offsets; this API does not replace a structural selection model. Internal history uses DOM bookmarks to restore those positions. A changed external value replaces the document and clears history; do not retain a DOM Range from the old document for a later edit.

A semantic paragraph/heading registered through the [SDK](/en/plugin-sdk) preserves its wrapper, `data-mw-node` and validated attributes when split inside its text. Enter at a semantic heading end adds an ordinary paragraph without semantic data; Enter in an empty semantic heading preserves the original empty node and adds an ordinary paragraph after it. Independent semantic blocks are barriers to generic Backspace/Delete joins and the multi-block replacement described above. Their identity is not copied onto an incompatible HTML tag or lost when exiting a heading. Replacement between ordinary child blocks inside one semantic blockquote is supported and preserves the ancestor's metadata.

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

The default toolbar inherits editor language and reacts to `localechange`. Custom `ToolbarAction.label` values retain their supplied text; the fourth `{ label }` argument overrides the toolbar accessible name. It preserves DOM bookmarks including empty items, exposes disabled/pressed/mixed states and supports arrow/Home/End/Escape navigation. `ToolbarAction.enabled(instance)` controls command availability. A complete dropdown/dialog system and accessibility audit are future work.

`editor.events.on('localechange', listener)` receives an independent `EditorLocale`; language changes emit no document `change` and work in read-only/composition, but are rejected inside a document transaction. `localize(state, key, dictionaries)` lets optional UI/plugins own dictionaries without adding their strings to core. [Full contract and key catalog](/en/localization).

Lists support nesting through `format('indent', 1 | -1)`. `format('clear', true)` removes inline formatting from selected text. See [Lists and formatting](/en/lists) for keyboard contracts, mixed states and examples.

[Colors and links: parameters, caret behavior and limitations](/en/styling).

[Images and upload callbacks](/en/images) use the optional `/plugins/images` module.

[Find and replace](/en/search) uses the optional `/plugins/search` entry; core does not require it.

[Text statistics](/en/statistics) uses `/plugins/statistics` for document/selection grapheme and word counts.

[Markdown shortcuts](/en/markdown) uses the optional `/plugins/markdown` entry for typing conversions; imports and pasted text stay literal.

Undo/redo restores pending caret formatting along with its position. This is internal history metadata, not extra HTML/JSON data. External replacement and selection movement clear pending formatting.

[Mentions and slash snippets](/en/suggestions): `/plugins/mentions`, `/plugins/slash`, optional `/plugins/suggestions` and `/plugins/suggestions.css`. Phase 1 inserts ordinary text without persisted IDs.

See [events, plugin cooperation and composable transactions](/en/events). Structural slash actions are documented [here](/en/suggestions#structural-slash-commands).
