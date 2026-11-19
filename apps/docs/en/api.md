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
| `getFormats(range?)` | Formats at selection start, `mixed`, list depth and indentation availability |
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

An ordinary `ol` persists optional `start` as a decimal integer string in the range `-2147483648…2147483647`. Valid values are canonicalized: `" +0004 "` → `"4"`, `"-0"` → `"0"`; omission does not add a default. HTML import retains valid `ol.start` and strips invalid values or `start` on other tags. JSON import rejects a wrong type, range, format or tag before changing the document, selection or history. The attribute survives insertion, export and Undo/Redo. An older reader may drop `start` and change displayed numbering; equivalent-numbering compatibility is not promised. The start contract itself does not add `li.value` or automatic renumbering; native reversed and bounded container commands are now documented separately under [list properties](/en/list-properties).

For list Enter/Shift+Enter/Backspace/Delete keys already owned by core, a cancelable `keydown` suppresses the browser action and dispatches one normalized cancelable `beforeinput`; the existing validated input handler remains the only mutation path. This constructed event has `isTrusted === false`: raw DOM-event consumers must not require a trusted native `beforeinput` for these commands. Cancel through capture-phase `keydown` or `beforeinput`; observe the result through typed `editor.events.on('change', ...)` in [editor events](/en/events). Already canceled events, read-only, composition and Ctrl/Meta/Alt retain their guards. The mechanism adds no browser detection, timers or alternative DOM mutation path.

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

The following rules describe bounded list and quote operations. See [verification and remaining limits](/en/roadmap#verification-and-limits) for current execution results.

Text input, Backspace and Delete handle a noncollapsed selection between ordinary bodies of one item or across direct sibling `li` elements under one `ul`/`ol`. An original item's own content may be direct inline content or **one or more ordinary `p`/`h1`–`h6` bodies**. Each body accepts text, supported inline marks, links, `span`, `code` and `br`; optional trailing nested lists follow all bodies. Mixed direct text and block bodies, whitespace alongside block bodies, original inline images, tables and other structural blocks remain outside this path. A semantic `data-mw-node` on the list, item or body is a barrier; inline semantic nodes are retained. Operating within a nested list or a list in one cell leaves its outer parent intact.

The first `li`, starting body, their attributes and untouched prefix remain. Bodies before the selection stay in place. The discarded ending wrapper does not transfer its tag or alignment; only its inline suffix moves. Unselected bodies after the ending body move as actual nodes after the joined body. Direct and wrapped bodies may be mixed; if a direct starting body must retain following right bodies, its content is wrapped in an ordinary `p` to avoid mixing direct text and blocks. Nested branches remain children of `li`, **outside** paragraphs/headings. Covered bodies and middle items are removed; other items and neighboring blocks are not rebuilt. Formatting-only whitespace between covered items may be removed with that selected gap. Non-whitespace gaps and unrelated nodes between items are not silently normalized.

Trailing nested `ul`/`ol` branches of the last item, lying entirely **after the selection end**, move as whole branches into the retained first item. The range must not enter them. For ordinary replacement spanning different items without an affected quote, nested lists in the first or middle covered item reject this bounded path. The quote-specific structural branch preservation profile is described below. Ranges between different lists, an item and a paragraph, or different list levels are blocked before mutation when an endpoint belongs to an item. Within one nearest `li`, the new path owns ranges between distinct ordinary bodies; a selection inside one body keeps its existing handler. General structural selection of an entire list remains separate work.

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

This multi-block API/clipboard path supports a noncollapsed selection between bodies of one item, across sibling items and **within one supported body**, and also **a collapsed caret inside an item**. At a caret the source body splits at that position: its prefix stays with the first incoming content and its suffix moves into the final incoming body. Preceding and following source bodies and nested branches retain their positions relative to the insertion. This composition applies to multi-root block candidates; the separate single-heading and quote paths are described below. Native input, inline insertion and other single structural roots retain their existing paths. Formatting whitespace around and between incoming blocks is ignored; spaces inside bodies remain. A lone placeholder `br` in an empty first/final incoming body does not add an extra joined line; empty middle bodies remain separate editable blocks.

At an item-level boundary the caret before a following body means that body's start; after the last body it means its end before nested lists. Positions inside trailing branches do not become the parent body's end. Mixed or semantic multi-root fragments are also validated at a caret: the API rejects them before document mutation and clipboard insertion leaves content unchanged. Successful insertion is one history operation, with the caret before the original suffix in the final incoming body. Undo restores the original DOM point and saved caret formatting state.

A single ordinary `h1`–`h6` is inserted as **a separate item body**, retaining its own tag, alignment and other allowed attributes. Unlike the multi-block profile, the heading does not yield its wrapper to the source left body. The source prefix stays before the heading; a separate body after it receives the original end body's inline suffix and tag/attributes. Direct inline `li` edges become `p` elements. The caret starts in the right body before the suffix. Empty edges retain placeholder `br`; unselected following bodies and branches stay after the right body, and no new `li` is created. This works at a caret and over a selection within a body, across bodies or sibling items. For example, `Al|pha` plus `<h2>Title</h2>` produces `<p>Al</p><h2>Title</h2><p>pha</p>`.

For the bounded path between bodies/items, incoming semantic blocks with `data-mw-node`, mixed inline/block fragments, lists, tables, `figure` and other structural payloads remain atomic refusals: the API throws and clipboard insertion leaves the document unchanged. A single semantic heading is also validated and refused before DOM mutation within one body and at a caret. Formatting whitespace around an ordinary heading is ignored only after payload validation. Empty sanitized HTML is a no-op, without deleting the range or falling back to plain text. This slice adds neither new list properties nor new SDK semantic tags.

In the demo choose **Multiple blocks → Load block-body sample**, then **Select items**, **Select item blocks** or **Select text in one body**, followed by **Replace with multiple blocks**. The **Multi-block HTML** field lets you change incoming paragraphs/headings; this uses the same `editor.insertHTML` API without requesting system clipboard access.

For insertion without a selection choose **Block insertion position → Body start, Inside a word or Body end**, click **Caret for block insertion**, then **Replace with multiple blocks**. The middle position follows the first letter of the bold word. Compare direct inline, paragraph and multiple-body modes; loading a sample replaces the document.

For a separate heading use the same selection or caret buttons, then **Single heading HTML → Insert heading**. The default sample retains `h2`, `title`, alignment and italic text. Undo restores the original selection or exact caret.

A single ordinary `blockquote` uses the same separate splice: source prefix → quote → separate body with the original suffix. Its wrapper and allowed attributes remain, with the caret at the right body's start. It supports a caret and selections within a body, across bodies or sibling items. The incoming quote may contain either entirely inline content or a sequence of ordinary `p`/`h1`–`h6` bodies; mixed inline/block children, nested quotes, lists, tables, `figure` and `pre` remain outside this path. Semantic quote roots and semantic body children with `data-mw-node` are refused before DOM mutation, including within one body and at a caret. Inline semantic nodes and allowed incoming images pass the shared schema. Formatting whitespace around the quote and between its body children is removed only after validation; inline quote text spaces remain. An empty inline quote and empty child bodies receive an editable `br`.

Repeated **block API/clipboard insertion** accepts ordinary quotes as opaque neighboring bodies in the source item. In an ordinary text body before or after a quote, insert multiple paragraphs/headings, a single heading or another quote without reloading the document. Quotes before and after the selected interval retain their actual DOM nodes, content, tags and attributes; they are neither coalesced nor placed inside the new payload. Multiple source quotes are supported. An unsupported or semantic source quote blocks the operation before mutation even when it is unselected.

For insertion beside a quote, range endpoints must stay in ordinary text bodies on one side of it. The dedicated crossing profile below also supports a selection that crosses or fully covers one or several quotes within the same item. An item-level position resolving to the whole quote is blocked too; use the preceding paragraph's end to insert before it or the next body's start to insert after it. Native quote-boundary structural operations, inline insertion and single-paragraph insertion retain their earlier paths. This is a dedicated block-insertion extension, not complete quote editing.

**Block insertion inside one quote in a list item** accepts two or more ordinary `p`/`h1`–`h6` blocks or a single ordinary heading. It supports a collapsed caret, a selection within one body and a range across ordinary child bodies of that same quote. The actual `blockquote` and its allowed attributes remain; inserted bodies stay inside it, while outer item bodies, neighboring quotes and nested lists remain untouched. Direct inline quote content is promoted into an ordinary `p` inside that same quote.

Composition follows the existing profiles: for multiple incoming blocks, the prefix stays in the original left body with the first incoming body's children and the suffix joins the final incoming body; a single heading remains separate between the prefix and a separate suffix body. The caret precedes the suffix, in the last incoming body or at the suffix body's start after a single heading. Unselected child bodies retain actual node identity and empty edges stay editable. DOM offsets on `blockquote` account for actual child nodes, including formatting gaps: a start resolves to the next body, a selection end to the previous body, and a collapsed quote-end position to the last body's end. Undo restores original DOM coordinates and pending caret formatting.

This inner-quote profile keeps both endpoints **inside one supported quote**; the separate crossing profile below handles an outside endpoint or endpoints in different quotes. Nested quote insertion, semantic quote/body wrappers, original images and unsupported structures are refused before document mutation. Allowed incoming images and inline semantic data still pass schema validation. Source validation is stricter within the changed quote than when preserving a whole opaque quote beside insertion. Native input, boundary operations, inline insertion and single-paragraph insertion are not extended by this slice.

**Block replacement across quote boundaries** supports a range in a single `li`: outside → inside an ordinary quote, inside → outside, between different quotes, or outside → outside across one or several whole quotes. Use multiple ordinary paragraphs/headings, one ordinary heading or one supported quote as the payload. Every incoming root wrapper keeps its tag and allowed attributes as a separate body at item level; unlike ordinary multi-block insertion, the first wrapper is not stripped or joined to the source prefix. New content is never placed inside the remaining source quote.

An unselected quoted prefix or suffix stays quoted in the same actual `blockquote`, preserving its attributes and untouched child bodies; fully covered quotes and intervening bodies are removed. With a right endpoint inside the quote, a **new editable `p` with `br`** is inserted between the payload and quoted remainder, and the caret starts there. With a right endpoint outside, the source suffix keeps its own body and the caret starts before that suffix. Other item bodies, formatting gaps and trailing list branches retain their order and identity. Every affected quote is validated completely, even when fully covered: original images, semantic block roots and nested structures block the entire operation. Distinct quote endpoints are allowed within one item or eligible consecutive items under the sibling-item profile below. Different lists/levels, selected branches, semantic/malformed source shapes and unsupported payloads remain atomic refusals. Same-quote insertion, native boundary editing and inline/single-paragraph paths are unchanged.

In the demo click **Load quote-crossing sample**, choose **Select outside into quote**, **Select quote into outside** or **Select across whole quote**, then reuse **Replace with multiple blocks**, **Insert heading** or **Insert quote**. Reload before comparing directions; loading replaces the document. Undo restores the exact original backward selection.

The new **Load multiple-quote sample** contains three quotes, an intervening body and a nested branch. Choose **Select between quotes**, **Select outside into last quote**, **Select first quote into outside** or **Select across all quotes**, then reuse the insertion buttons. Between two partially selected quotes, the first prefix and last suffix stay in their actual wrappers; the fully covered middle quote is removed. A quoted right remainder gets an ordinary caret paragraph before it. **Every** affected quote is validated, including fully removed quotes: original images, semantic block roots and nested structures reject the whole operation before document mutation. Reload before comparing directions.

### Quotes across sibling items

Click **Load sibling-item quote sample**, choose **Select quotes across sibling items**, **Select into last item quote**, **Select from quote into outside suffix** or **Select across all item quotes**, then use **Replace with multiple blocks**, **Insert heading** or **Insert quote**. Loading replaces the document; reload before comparing directions.

Block API/clipboard insertion through ordinary quotes accepts consecutive items under **one parent `ul`/`ol`**. The actual first item and its unselected prefix remain. The last item's partial suffix, following bodies/unselected quotes and trailing nested lists move into the first as actual nodes in their original order; other selected items, fully covered quotes and intervening bodies are removed. Incoming wrappers remain separate blocks at the first-item level. A quoted right remainder gets a new ordinary `p` with `br` before it, with the caret at its start; otherwise the caret starts in the outside suffix body. A direct-inline item edge receives a `p` wrapper containing the actual original descendants.

Every affected quote is fully validated, including quotes in removed middle items: original images, semantic block roots and nested structures reject the whole operation before document mutation. Trailing branches of all selected items are preserved by the quote-specific branch profile below. Different parent lists, levels, endpoints inside branches and `li` positions resolving to a whole quote remain barriers. Native input, inline/single-paragraph insertion and ordinary replacement without affected quotes retain their earlier paths.

### Preserving branches from all selected items

Click **Load quote-branch preservation sample**, choose **Select quotes with branches**, **Select into quote with branches**, **Select from quote with branches** or **Select all bodies with branches**, then use the existing insertion buttons. The sample contains trailing `ul`/`ol` from the first, middle and last items, a deeper branch, `start` attributes and an empty item.

In the trailing-only profile, structural API/clipboard insertion with at least one affected quote preserves these branches as actual subtrees. After the complete resulting body sequence in the first item come branches from the first, intermediate and last source items; order within each item remains. **This relocates branches after bodies; it does not preserve the former global body–branch–body traversal order.** Branches are neither coalesced, cloned nor flattened; kinds, attributes, nesting, descendants and empty items remain. Branches detach intact before trimming direct-inline bodies or removing covered items.

Newly accepted first/middle branches must be ordinary direct trailing `ul`/`ol` without a semantic root wrapper; imported validated content moves as an opaque subtree. Endpoints inside branches, different parents/levels and unsupported quotes reject atomically; bodies after a branch use the separate profile below. Ordinary replacement **without** an affected quote, native input and inline/single-paragraph insertion keep their previous barriers. Incoming wrappers, quoted edges and caret placement follow the rules above.

### Blocks after nested lists

Click **Load blocks-after-branches sample**, choose **Select quotes between branches**, **Select into quote after branch**, **Select from quote across branches** or **Select all bodies between branches**, then use the existing insertion buttons. The sample has a branch before the selection, protected branches between selected bodies and a suffix → list → heading → list sequence afterward. Loading replaces the document.

This separate structural path applies when at least one selected item contains an ordinary `p`, heading or quote **after** a direct nested `ul`/`ol`. Distinct endpoint bodies and at least one affected quote are required; one item or consecutive siblings of one list are supported. An interleaved item starts with a wrapped body; mixed direct inline text after a list is unsupported. A neighboring item without interleaving may have direct inline content, receiving an ordinary `p` wrapper under the earlier rules.

The first item's sequence before the left edge, including branches, stays in place. Then come the retained left edge, **every incoming wrapper**, protected branches from the selected interval in source order and the right remainder. Fully selected own bodies and quotes are removed; branches retain their actual subtrees. For a quoted right edge, a new editable `p` with `br` goes **after protected branches**, immediately before the quoted remainder, with the caret there. For an outside edge, the caret starts in the suffix body. Following children from the last item move into the first in their original body/list sequence. Relative order among retained nodes remains; the incoming fragment precedes the protected branches.

If nested lists occur only at item tails, the earlier profile above remains: branches follow the complete resulting body sequence. For the new interleaved source, endpoints inside branches, different parents/levels, unsupported or semantic roots, inline/single-paragraph payloads, a range within an ordinary body outside the quote and operations without an affected quote remain outside this crossing profile; insertion inside one quote follows the separate inner profile below. Every affected quote and branch root is validated before document mutation. Native editing is not extended.

### Inside one quote between bodies and branches

Click **Load quote inside interleaved item**, then **Caret in quote between branches** or **Select quote bodies between branches**. Reuse **Replace with multiple blocks** or **Insert heading**; loading replaces the document. The sample includes a list before the quote, a neighboring quote, another list after it and a heading after that list.

Inner block insertion accepts a caret, a selection within one child body or a range across ordinary child bodies of that same quote. The actual quote, attributes and untouched children remain. Outer bodies, neighboring quotes and nested lists retain their actual nodes and original order: this path moves branches neither behind the payload nor to the item tail. Multiple incoming `p`/`h1`–`h6` roots compose their first content with the source prefix and their last with the suffix inside the quote; a single heading keeps a separate wrapper between prefix and a separate suffix body. The caret stays before the original suffix, and empty edges retain an editable placeholder.

All branch roots in that item must be ordinary direct `ul`/`ol` without semantic ownership; validated branch content remains an opaque subtree. The source quote still rejects images, semantic block roots and nested structures; an incoming nested quote is refused atomically. Native input, inline/single-paragraph insertion and ordinary bodies outside the quote are not extended.

In the demo use the same caret or selection buttons, then **Quote HTML → Insert quote**. The sample contains a paragraph and heading inside `blockquote`, retaining `title`, alignment and italic text. Neighboring source bodies and trailing branches stay outside the quote; no new `li` is created.

For repeated insertion click **Load repeated insertion sample**, then **Caret after existing quote**. Click **Insert quote → Insert heading → Replace with multiple blocks** consecutively without reloading. Each step retains the original quote and has its own Undo; **Caret before existing quote** demonstrates insertion on the other side. Loading the sample replaces the document.

For the new area click **Load insertion-inside-quote sample**, then **Caret inside quote** or **Select blocks inside quote**. Reuse **Multi-block HTML → Replace with multiple blocks** or **Single heading HTML → Insert heading**. **Insert quote** refuses a nested `blockquote` in this area. Loading replaces the document.

Within one body the new path validates multi-root block and mixed candidates, a single heading and a single quote: an unsupported candidate is rejected before mutation. Another single structural root, such as a table, retains its earlier generic handler; this slice introduces neither a new guarantee nor a new prohibition for it.

```ts
editor.insertHTML('<p><strong>First</strong></p><h3>Middle</h3><p><u>Last</u></p>');
```

Collapsed Delete at a body's end joins the next body **inside the same item**. At the last body's end it joins the first body of the next suitable item **in the same list**, preserving following right bodies after the result. If a direct inline left body must coexist with surviving right blocks, it is wrapped in an ordinary `p`, as with selection replacement. Backspace at a non-first body's start joins it into the previous body of the same item. The left body's tag and attributes remain; the right wrapper is removed. Nested branches stay whole and in their original order; they are not coalesced or stripped of attributes. The final item, unsupported neighbors and container boundaries stop the inter-item join without history. Backspace at the first body's start in a multi-block item now has the dedicated behavior below; existing simple-item paths are not rewritten. The new handling uses cancelable `beforeinput`, preserving cancellation rather than bypassing it on `keydown`.

At the first body's start in a multi-block item, Backspace joins that body into the previous sibling item's final body in the same list. The left body's tag and attributes, subsequent right bodies and both sets of trailing branches remain; a direct inline left body receives a `p` wrapper when required. Without a previous item, the first root item exits the list: its actual paragraphs/headings followed by its branches move before the remaining list. Removed `li` attributes are not copied to bodies; their own attributes remain. A first nested item lifts after its owner item; its following nested siblings move into a separate list under the lifted item after its existing branches. The source list may precede other owner branches: earlier branches stay with the owner, while later branches move as actual whole nodes under the lifted item after its own branches and the list of following source siblings. Content traversal order remains; list kinds and attributes are unchanged and branches are not coalesced. Each moved later branch must be an ordinary list with supported direct items; a semantic or unsupported branch blocks the entire operation before DOM mutation. Root lists inside the surface, `blockquote`, `td` and `th` are supported; the operation never crosses a cell boundary. Semantic lists/items/bodies, unsupported neighbors, foreign nodes between items and more complex shapes remain atomic barriers. Each successful operation is one transaction with Undo restoring the original DOM caret.

Enter inside one ordinary `p`/`h1`–`h6` creates the next `li` with the same split-body tag and attributes; a heading at its end continues as a heading. Following text, all subsequent bodies and nested branches move into the new item, with branches outside body wrappers. Shift+Enter inserts `br` inside one body in the starting inline context. An empty body gets an internal placeholder. An empty body with other bodies present splits as part of its item; existing empty-item exit/outdent remains only for an entirely empty ordinary simple item. For Enter/Shift+Enter, a selection across bodies of one item is first replaced with empty content in the same transaction, then split or given a line break. Cross-item ranges and semantic bodies remain barriers for these keys. Indent commands are not extended by this slice.

The operation has an isolated undo restoring the original document and forward/backward DOM range. The caret follows inserted text/HTML and precedes the retained inline suffix and nested branches. Subsequent input stays there with existing native formatting affinity. Already canceled events, read-only and composition retain their guards; noncancelable `beforeinput` receives no new manual edit. A nested import failure still poisons its whole outer transaction even when the plugin catches it.

A detached-preflight refusal before opening the transaction or a blocked native edit preserves unrelated DOM identity. If a trusted focus listener changes the context after preflight, a late rejection uses ordinary transaction rollback: its initial HTML, selection and history are preserved, but DOM nodes may be rebuilt. DOM identity is not guaranteed for that late rollback path.

Local demo: **Document → List item selection**; choose an **Item body** mode, click **Load block-body sample**, then **Select items**, **Replace with text** or **Replace with HTML**. In **Multiple blocks** mode, **Select item blocks** sets a backward selection between the paragraph and heading inside the first item. **Caret before Delete** prepares the first body's end: in this mode Delete joins two bodies inside the item. For first-body Backspace choose a **Backspace scenario**, click **Load Backspace sample → Caret before Backspace**, then press Backspace. Try joining the previous item, exiting the first root item, lifting the first nested item and Nested branch before others. The last sample retains the earlier branch with the owner and preserves two later branches in order under the lifted item. Loading replaces the document. Word deletion, `insertReplacementText` and native replacement target ranges are not extended by this handler. Arbitrary structural HTML across items, list↔paragraph transformations, partially selected nested trees, and actual mobile IME remain separate work.

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

Optional [checklists](/en/checklists) use a separate plugin: state belongs to one `li`, and commands/external controls do not extend the core toolbar. Presets do not install the plugin automatically.

## Formatting

Inline: `bold`, `italic`, `underline`, `strike`, `code`, `subscript`, `superscript`. Blocks: `header` (1–6 or false), `blockquote`, `code-block`, `list` (`bullet`, `ordered`, false), `align` (`left`, `center`, `right`, `justify`). `color` and `background` accept a CSS color or false. Core `fontFamily` and `fontSize` formats use the safe CSS codec; configured commands and boundaries are documented under [fonts](/en/fonts). `link` accepts a URL, `LinkFormat` or false: a selection changes only that fragment; a caret inside a link edits the whole anchor. Unsafe API options throw before document mutation. Collapsed inline formatting establishes a typing position; complex cursor-boundary cases remain part of browser compatibility work.

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

[Mentions and slash snippets](/en/suggestions): `/plugins/mentions`, `/plugins/slash`, optional `/plugins/suggestions` and `/plugins/suggestions.css`. Plain text remains the default; `mentions({ persistent: true })` enables [persistent editable ID references](/en/persistent-mentions).

Enable `atomic: true` alongside `persistent: true` for whole-mention navigation and deletion. ID representation stays unchanged; see [atomic mentions](/en/atomic-mentions) for text-label bounds and migration.

`mentionClipboardCommands(editor)` → `copy(): MentionClipboardData | undefined`, `cut(): MentionClipboardData | undefined`, `paste(input: MentionClipboardInput): boolean`. HTML retains IDs, eligible paragraphs/headings, consecutive items of one list and fully selected supported trailing branches; plain text keeps labels with LF between blocks/items. The API uses application-owned memory. [Atomic mention clipboard](/en/atomic-mention-clipboard) documents same-flow, ordinary sibling-block and sibling-list-item boundaries, prefix/suffix composition, invalid HTML and container-crossing refusal.

See [events, plugin cooperation and composable transactions](/en/events). Structural slash actions are documented [here](/en/suggestions#structural-slash-commands).

For post-input extension observers, see [controlled input commit receipts](/en/events#controlled-input-commit-receipts): `EditorInputCommit` covers only validated controlled Enter/clipboard paths, not arbitrary input or a cancellable transform. Follow-up commands remain separate history operations.


The optional [horizontal-rule command](/en/horizontal-rule) is available through `/plugins/horizontal-rule`: one root paragraph/heading, an editable suffix and one Undo step. Standard/extended install it and its ready toolbar button by default; `horizontalRule: false` omits the instance.

The optional [font plugin](/en/fonts), through `/plugins/fonts`, provides configured family/px-size commands, independent resets and actual/mixed CSS state. It is explicitly installed, excluded from preset defaults and loads no font files.

Optional [list properties](/en/list-properties), through `/plugins/list-properties`, change start/reversed/marker on one whole current container with Undo. They are explicitly installed, excluded from preset defaults and do not recalculate continued numbering.

Optional [LTR/RTL text direction](/en/text-direction), through `/plugins/text-direction`, changes explicit dir on the closest ordinary block or siblings sharing a parent/cell. Reset inherits surrounding direction rather than forcing LTR; presets and ready toolbar do not install it automatically.

The optional [contextual selection toolbar](/en/contextual-toolbar) uses the independent `/ui/contextual` entry. `getFormats(range?)` projects a remembered current Range without moving Selection/focus; omission retains existing behavior. Shell custom readers receive a cloned range as their second argument, while commands still validate the actual target.

A caret or text range wholly inside one ordinary link can use separate [contextual link actions](/en/contextual-links): `/ui/contextual-link`, explicit core/forms/contextual-link CSS, validated Open and whole-link editing/unlinking with Undo. When both are mounted, this module takes priority over the contextual text toolbar for an eligible range; plain text, mixed ranges and multiple anchors retain the text toolbar's previous behavior. Presets do not install this UI.


Explicit [contextual image properties](/en/contextual-images) use `/ui/contextual-image` with the images plugin, an exact IMG node Range and existing update/remove history. The reused image form adds `mode?: ImageFormMode` (`all` by default, `edit` excludes Insert/upload and makes Enter update). Caption carets and whole-figure ranges are outside this first contextual slice.

## Contextual table actions

The explicit [contextual table toolbar](/en/contextual-tables) adds row/column insertion and deletion, merge/split over the existing logical grid, native Range restoration and one-command Undo. Install `/ui/contextual-table` and its CSS alongside `tables()` and table CSS; presets are unchanged. `getTableSelection(editor, range?)` returns observational `TableSelectionState`, `registerSelectionHost(host)` owns external controls, and `tableSelectionChange` is a typed per-editor notification, not RPC. The guide documents spans, disabled states, keyboard/lifecycle restrictions and independent gzip budgets.


Optional [table size picker](/en/table-picker) uses an explicit factory and CSS import; [image clipboard/drop input](/en/image-input) delegates to the application-owned images upload callback. Neither changes preset defaults.


[Table and cell properties](/en/table-properties) use independent `/plugins/table-properties` and `/ui/table-properties` entries: table width/placement and selected-cell background/border color/vertical alignment. The form applies only dirty fields in one Undo, uses existing `/ui/forms.css`, and is outside preset defaults.

## Observing search ranges

`getSearchRanges(editor)` from `/plugins/search` returns `{ ranges, current }`: fresh native ranges built from the current search index. It changes no focus/selection/history; modifying a returned range cannot modify the private index and confers no command authority. Snapshots can become stale after edits. An [independent optional UI](/en/search-highlights) paints every match.
