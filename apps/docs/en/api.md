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

This path requires cancelable `beforeinput`; already canceled events, read-only and active composition retain their existing guards. It does not introduce a general structural-selection model. Replacement across containers/cells, across table/figure/list/pre/hr or an independent SDK semantic block, drag/drop, word deletion and `insertReplacementText` receive no new normalization through this handler. Clipboard paste has a separate contract below. Noncancelable events retain the previous native path. Synthetic event tests do not certify real mobile keyboards, autocorrection, dictation or system IME.

Public `{ index, length }` values are UTF-16 text offsets. Empty blocks and line breaks may have distinct DOM positions with identical text offsets; this API does not replace a structural selection model. Internal history uses DOM bookmarks to restore those positions. A changed external value replaces the document and clears history; do not retain a DOM Range from the old document for a later edit.

A semantic paragraph/heading registered through the [SDK](/en/plugin-sdk) preserves its wrapper, `data-mw-node` and validated attributes when split inside its text. Enter at a semantic heading end adds an ordinary paragraph without semantic data; Enter in an empty semantic heading preserves the original empty node and adds an ordinary paragraph after it. Independent semantic blocks are barriers to generic Backspace/Delete joins and the multi-block replacement described above. Their identity is not copied onto an incompatible HTML tag or lost when exiting a heading. Replacement between ordinary child blocks inside one semantic blockquote is supported and preserves the ancestor's metadata.

## Pasting over a selection between blocks

`editor.insertHTML(html)` and clipboard paste share the replacement boundaries for the ordinary sibling blocks described above. Source leaves allow text, supported inline marks, links, `span`, `code` and `br`; a block containing an existing inline image is outside this path. The incoming fragment may still contain allowed images. The first block prefix, formatted last-block suffix, unrelated blocks and other cells are preserved. The entire incoming fragment passes the editor's schema before changing the live document.

| Incoming fragment | Result composition |
| --- | --- |
| Inline markup or one ordinary `p` | Inserted in the original inline context. The incoming `p` wrapper is removed, the left block attributes remain, and the right suffix joins it |
| Several ordinary `p`/`h1`–`h6` blocks | The first block's children continue the left block; its attributes take precedence over the first incoming wrapper. Middle and final incoming blocks retain their tags and attributes; the right suffix joins the final block |
| Structural or mixed HTML | Incoming blocks are spliced between the retained left prefix and the right suffix in its original wrapper. Loose inline runs are wrapped in `p`; formatting-only whitespace between root blocks is discarded |

In this path, a single incoming heading retains its own wrapper. Semantic `p`/heading wrappers with `data-mw-node` are not unwrapped or retagged here; this does not broaden the previous insertion contract within one block or across other structures. Incoming links do not nest in an existing link: when the selection starts there, the fragment is inserted after the retained starting `a`, preserving the incoming URL.

For the `Alpha`/`Beta` selection above:

```ts
editor.insertHTML('<p><strong>First</strong></p><h3>Second</h3>');
```

the result is:

```html
<p>Alpha <strong>First</strong></p><h3>Second<em>ta</em> tail</h3><p>Keep</p>
```

The caret is after `Second`, before the retained `em`. For an inline fragment it stays after the payload inside the left block; after structural insertion it is at the start of the right suffix. If no suffix remains, an ordinary editable paragraph is created after the inserted blocks. Subsequent input continues there; undo/redo restore the document and exact selection direction. A standalone insertion is one isolated history operation with one `change`; a nested insertion joins the outer `transact`.

The pasted fragment's formatting follows the rules above. Later native input uses the browser's formatting-boundary behavior: for example, after a trailing pasted `br` before a marked suffix, a new character may inherit that suffix's mark or remain outside it. The exact position before the suffix and separate history are preserved; identical later mark inheritance across engines is not promised.

A nonempty clipboard `text/html` takes precedence over `text/plain`. Plain text stays literal: CRLF, LF and lone CR become `br`, and HTML-looking text does not become elements. If sanitization empties the HTML, the selection is not deleted and plain text is not used as a fallback. Empty fragments add no history. An already canceled `paste`, read-only and active composition block this insertion.

Invalid data for a known semantic node and structure unsupported by this path are rejected before editing: `insertHTML` throws, while clipboard paste leaves the document unchanged without an uncaught event error. A nested `insertHTML` failure inside `transact` poisons the whole outer transaction even if the application catches it. A table payload inside `td/th`, nested tables and orphan root `li`, `figcaption` or table parts are not inserted through this path.

Try **Paste between blocks** on the homepage or in the [playground](/en/playground): **Select sample**, then **Insert text** or **Insert HTML**. The example uses the public API; native clipboard is tested separately. Source selections across containers/cells or independent lists, tables and figures remain outside the new normalization. This insertion does not promise exact Word/Excel/Google Docs compatibility; synthetic ClipboardEvent cases do not establish OS clipboard permissions or real mobile IME support.

## List item selections and boundaries

**New local slice — verification deferred.** The following rules describe the written implementation and its intended contract, not certified browser behavior. At the user's request, this slice's tests, builds, type checks and bundle measurements have not been run. The future verification list is in `specs/verification-backlog.md`.

Text input, Backspace and Delete handle a noncollapsed selection between ordinary bodies of one item or across direct sibling `li` elements under one `ul`/`ol`. An original item's own content may be direct inline content or **one or more ordinary `p`/`h1`–`h6` bodies**. Each body accepts text, supported inline marks, links, `span`, `code` and `br`; optional trailing nested lists follow all bodies. Mixed direct text and block bodies, whitespace alongside block bodies, original inline images, tables and other structural blocks remain outside this path. A semantic `data-mw-node` on the list, item or body is a barrier; inline semantic nodes are retained. Operating within a nested list or a list in one cell leaves its outer parent intact.

The first `li`, starting body, their attributes and untouched prefix remain. Bodies before the selection stay in place. The discarded ending wrapper does not transfer its tag or alignment; only its inline suffix moves. Unselected bodies after the ending body move as actual nodes after the joined body. Direct and wrapped bodies may be mixed; if a direct starting body must retain following right bodies, its content is wrapped in an ordinary `p` to avoid mixing direct text and blocks. Nested branches remain children of `li`, **outside** paragraphs/headings. Covered bodies and middle items are removed; other items and neighboring blocks are not rebuilt. Formatting-only whitespace between covered items may be removed with that selected gap. Non-whitespace gaps and unrelated nodes between items are not silently normalized.

Trailing nested `ul`/`ol` branches of the last item, lying entirely **after the selection end**, move as whole branches into the retained first item. The range must not enter them. When selecting different items, nested lists in the first or middle covered item reject this bounded path rather than becoming incidental subtree deletion. Ranges between different lists, an item and a paragraph, or different list levels are blocked before mutation when an endpoint belongs to an item. Within one nearest `li`, the new path owns ranges between distinct ordinary bodies; a selection inside one body keeps its existing handler. General structural selection of an entire list remains separate work.

For this document:

```html
<ul><li>Alpha <strong>one</strong></li><li><em>Beta</em> tail<ul><li>Nested keep</li></ul></li><li>Keep item</li></ul>
```

a selection from after `Alpha ` to after `Be`, followed by `editor.insertHTML('<u>X</u>')`, has this intended result:

```html
<ul><li>Alpha <u>X</u><em>ta</em> tail<ul><li>Nested keep</li></ul></li><li>Keep item</li></ul>
```

The incoming fragment passes the schema before live editing. Inline markup, including an allowed incoming image, and one ordinary `p` retain their existing insertion: the incoming `p` wrapper is removed, while the left body and first `li` attributes remain. This does not permit images in the original source selection.

HTML containing **two or more ordinary `p`/`h1`–`h6` bodies** inserts multiple bodies inside the retained item. The first incoming body's inline children join the untouched prefix in its original inline context; its tag and attributes yield to the retained left body. Middle and final incoming bodies retain their tags and attributes. The original ending body's inline suffix joins the final incoming body, with the caret between the payload and that suffix. Unselected following bodies and nested branches remain after the inserted bodies. A direct inline left `li` body is wrapped in an ordinary `p`; incoming paragraphs do not create new `li` items.

This multi-block API/clipboard path supports a noncollapsed selection between bodies of one item, across sibling items and **within one supported body**, and also **a collapsed caret inside an item**. At a caret the source body splits at that position: its prefix stays with the first incoming content and its suffix moves into the final incoming body. Preceding and following source bodies and nested branches retain their positions relative to the insertion. The extension applies only to multi-root block candidates; native input, inline insertion and a single structural root retain their existing paths. Formatting whitespace around and between incoming blocks is ignored; spaces inside bodies remain. A lone placeholder `br` in an empty first/final incoming body does not add an extra joined line; empty middle bodies remain separate editable blocks.

At an item-level boundary the caret before a following body means that body's start; after the last body it means its end before nested lists. Positions inside trailing branches do not become the parent body's end. Mixed or semantic multi-root fragments are also validated at a caret: the API rejects them before document mutation and clipboard insertion leaves content unchanged. Successful insertion is one history operation, with the caret before the original suffix in the final incoming body. Undo restores the original DOM point and saved caret formatting state. These scenarios have not been verified by execution yet.

For the bounded path between bodies/items, a single heading, incoming semantic blocks with `data-mw-node`, mixed inline/block fragments, lists, tables, `figure` and other structural payloads remain atomic refusals: the API throws and clipboard insertion leaves the document unchanged. Empty sanitized HTML is a no-op, without deleting the range or falling back to plain text. This slice adds neither new list properties nor new SDK semantic tags. These new scenarios have not been executed yet.

In the demo choose **Multiple blocks → Load block-body sample**, then **Select items**, **Select item blocks** or **Select text in one body**, followed by **Replace with multiple blocks**. The **Multi-block HTML** field lets you change incoming paragraphs/headings; this uses the same `editor.insertHTML` API without requesting system clipboard access.

For insertion without a selection choose **Block insertion position → Body start, Inside a word or Body end**, click **Caret for block insertion**, then **Replace with multiple blocks**. The middle position follows the first letter of the bold word. Compare direct inline, paragraph and multiple-body modes; loading a sample replaces the document.

Within one body the new path validates multi-root block and mixed candidates: an unsupported candidate is rejected before mutation. A single structural root, such as a heading or table, retains its earlier generic handler; this slice introduces neither a new guarantee nor a new prohibition for it.

```ts
editor.insertHTML('<p><strong>First</strong></p><h3>Middle</h3><p><u>Last</u></p>');
```

Collapsed Delete at a body's end joins the next body **inside the same item**. At the last body's end it joins the first body of the next suitable item **in the same list**, preserving following right bodies after the result. If a direct inline left body must coexist with surviving right blocks, it is wrapped in an ordinary `p`, as with selection replacement. Backspace at a non-first body's start joins it into the previous body of the same item. The left body's tag and attributes remain; the right wrapper is removed. Nested branches stay whole and in their original order; they are not coalesced or stripped of attributes. The final item, unsupported neighbors and container boundaries stop the inter-item join without history. Backspace at the first body's start in a multi-block item now has the dedicated behavior below; existing simple-item paths are not rewritten. The new handling uses cancelable `beforeinput`, preserving cancellation rather than bypassing it on `keydown`.

At the first body's start in a multi-block item, Backspace joins that body into the previous sibling item's final body in the same list. The left body's tag and attributes, subsequent right bodies and both sets of trailing branches remain; a direct inline left body receives a `p` wrapper when required. Without a previous item, the first root item exits the list: its actual paragraphs/headings followed by its branches move before the remaining list. Removed `li` attributes are not copied to bodies; their own attributes remain. A first nested item lifts after its owner item; its following nested siblings move into a separate list under the lifted item after its existing branches. The source list may precede other owner branches: earlier branches stay with the owner, while later branches move as actual whole nodes under the lifted item after its own branches and the list of following source siblings. Content traversal order remains; list kinds and attributes are unchanged and branches are not coalesced. Each moved later branch must be an ordinary list with supported direct items; a semantic or unsupported branch blocks the entire operation before DOM mutation. Root lists inside the surface, `blockquote`, `td` and `th` are supported; the operation never crosses a cell boundary. Semantic lists/items/bodies, unsupported neighbors, foreign nodes between items and more complex shapes remain atomic barriers. Each successful operation is one transaction with Undo restoring the original DOM caret. Validation is deferred.

Enter inside one ordinary `p`/`h1`–`h6` creates the next `li` with the same split-body tag and attributes; a heading at its end continues as a heading. Following text, all subsequent bodies and nested branches move into the new item, with branches outside body wrappers. Shift+Enter inserts `br` inside one body in the starting inline context. An empty body gets an internal placeholder. An empty body with other bodies present splits as part of its item; existing empty-item exit/outdent remains only for an entirely empty ordinary simple item. For Enter/Shift+Enter, a selection across bodies of one item is first replaced with empty content in the same transaction, then split or given a line break. Cross-item ranges and semantic bodies remain barriers for these keys. Indent commands are not extended by this slice.

The operation has an isolated undo restoring the original document and forward/backward DOM range. The caret follows inserted text/HTML and precedes the retained inline suffix and nested branches. Subsequent input stays there with existing native formatting affinity. Already canceled events, read-only and composition retain their guards; noncancelable `beforeinput` receives no new manual edit. A nested import failure still poisons its whole outer transaction even when the plugin catches it.

A detached-preflight refusal before opening the transaction or a blocked native edit preserves unrelated DOM identity. If a trusted focus listener changes the context after preflight, a late rejection uses ordinary transaction rollback: its initial HTML, selection and history are preserved, but DOM nodes may be rebuilt. DOM identity is not guaranteed for that late rollback path.

Local demo: **Document → List item selection**; choose an **Item body** mode, click **Load block-body sample**, then **Select items**, **Replace with text** or **Replace with HTML**. In **Multiple blocks** mode, **Select item blocks** sets a backward selection between the paragraph and heading inside the first item. **Caret before Delete** prepares the first body's end: in this mode Delete joins two bodies inside the item. For first-body Backspace choose a **Backspace scenario**, click **Load Backspace sample → Caret before Backspace**, then press Backspace. Try joining the previous item, exiting the first root item, lifting the first nested item and Nested branch before others. The last sample retains the earlier branch with the owner and preserves two later branches in order under the lifted item. Loading replaces the document. This new demo and these scenarios have not been executed yet. Word deletion, `insertReplacementText` and native replacement target ranges are not extended by this handler. Arbitrary structural HTML across items, list↔paragraph transformations, partially selected nested trees, actual mobile IME and new bundle sizes remain unverified or subsequent work.

The same selection from after `Alpha ` to after `Be` works with a paragraph and heading:

```html
<!-- Before -->
<ul><li><p style="text-align:center">Alpha <strong>one</strong></p></li><li><h3 style="text-align:right"><em>Beta</em> tail</h3><ul><li>Nested keep</li></ul></li></ul>
<!-- After editor.insertHTML('<u>X</u>') -->
<ul><li><p style="text-align:center">Alpha <u>X</u><em>ta</em> tail</p><ul><li>Nested keep</li></ul></li></ul>
```

Endpoints on `li` between block bodies normalize to an adjacent body: range starts prefer the next body, range ends prefer the previous body. Before the first and after the last body they use outer body boundaries; the range must not enter a nested branch. This is a working-range normalization; undo restores the original DOM coordinates and selection direction.

Inside one item, selecting from after `Alpha ` to after `Mid` removes covered bodies but keeps the following paragraph:

```html
<!-- Before -->
<ul><li><p>Alpha <strong>one</strong></p><h2>Middle</h2><p>After body</p></li></ul>
<!-- After editor.insertHTML('<u>X</u>') -->
<ul><li><p>Alpha <u>X</u>dle</p><p>After body</p></li></ul>
```

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
