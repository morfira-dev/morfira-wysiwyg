# Lists and formatting

[Try it on the homepage](/#editor): select **“Lists and nesting”** and click “Load sample”. Loading a sample replaces the document and resets history.

Task items use the separate [checklist plugin](/checklists). It is explicitly installed and supports ordinary/task items mixed within `ul`/`ol`; task metadata is not retained without the plugin.

## Working with lists

Multiple selected paragraphs become one list. Changing or removing the list type affects selected items, preserving unselected siblings and nested lists.

An ordinary `ol` persists optional `start` as a decimal integer string in the range `-2147483648…2147483647`. Valid values are canonicalized: `" +0004 "` → `"4"`, `"-0"` → `"0"`; omission does not add a default. HTML import retains valid `ol.start` and strips invalid values or `start` on other tags. JSON import rejects a wrong type, range, format or tag before changing the document, selection or history. The attribute survives insertion, export and Undo/Redo. An older reader may drop `start` and change displayed numbering; equivalent-numbering compatibility is not promised. The start contract itself does not add `li.value` or automatic renumbering; native reversed and bounded container commands are now documented separately under [list properties](/list-properties).

```ts
editor.format('list', 'bullet'); // Bullets
editor.format('list', 'ordered'); // Numbering
editor.format('list', false); // Remove list formatting from selected items
editor.format('indent', 1); // Nest under the previous sibling
editor.format('indent', -1); // Lift one level
```

Indent one item or a consecutive sibling range at the same level. The first item cannot indent without a previous sibling. Nesting is bounded at eight levels. When lifting an item, following nested siblings stay under it to preserve document order. Invalid commands roll back atomically. Each operation participates in undo/redo. Removing list formatting from a nested item lifts it one level.

| Key | Inside a list |
| --- | --- |
| Enter | Split at the caret; replace a selection within one body first and move subsequent bodies into the new item |
| Enter in a simple empty item | Lift one level; at the root level exit into a paragraph. An empty body among other bodies splits within the list structure |
| Shift+Enter | Insert a line break within the item |
| Backspace at the start | Inside a multi-block item join the preceding body; at its first body join the previous item. The first root item exits the list and the first nested item lifts one level, retaining bodies and branches |
| Delete at a body end | Join the next body; after the last body, join the first body of the next suitable item |
| Tab / Shift+Tab | Increase/decrease nesting outside tables |

For list Enter/Shift+Enter/Backspace/Delete keys already owned by core, a cancelable `keydown` suppresses the browser action and dispatches one normalized cancelable `beforeinput`; the existing validated input handler remains the only mutation path. This constructed event has `isTrusted === false`: raw DOM-event consumers must not require a trusted native `beforeinput` for these commands. Cancel through capture-phase `keydown` or `beforeinput`; observe the result through typed `editor.events.on('change', ...)` in [editor events](/events). Already canceled events, read-only, composition and Ctrl/Meta/Alt retain their guards. The mechanism adds no browser detection, timers or alternative DOM mutation path.

Within table cells, Tab keeps cell navigation. Use toolbar buttons to change list nesting inside cells. Shift+Enter and normal typing retain content inside the item. A sublist after the Enter position moves into the new item with the trailing content.

During composition, tables leave Tab/Shift+Tab/Escape to IME candidate handling: the caret does not move to another cell and no row is added. Ordinary table navigation resumes after composition ends.

## Paragraphs, headings and IME input

In a plain paragraph, Enter splits text at the caret while preserving formatting. Inside a heading it creates another heading; at its end it creates a paragraph. Enter in an empty heading converts it to a paragraph. Shift+Enter inserts a line break within the block. Selected text within one block is replaced first.

Backspace at the start and Delete at the end join adjacent paragraphs/headings in the same container. The left block's formatting and a caret at the join are retained. Boundary deletion does not move text across a table, image, list or another cell. Lists follow the table above and the bounded [cross-body and cross-item selection contract](/api#list-item-selections-and-boundaries). Every supported structural operation participates in undo/redo.

During active IME input, the browser owns provisional text. Core does not run structural commands or record every candidate in history. Markdown shortcuts and suggestion menus do not intercept candidate confirmation. After composition ends, one undo restores the previous document. Switching to read-only cancels unfinished input; external document replacement remains authoritative. These scenarios use controlled browser events in tests; real candidate windows and mobile keyboards still require separate manual validation.

Try the keys in the homepage editor or the [playground](/playground); no additional module is required.

## Toolbar and state

The default toolbar includes both list types, indentation and clear inline formatting. Undo/redo are available only when history permits. Mixed selections show `aria-pressed="mixed"`; activation applies a uniform format to the entire selection.

```ts
const dispose = createToolbar(toolbarHost, editor, [
  { label: 'Bold', text: 'B', format: 'bold' },
  {
    label: 'Indent list', text: '⇥', format: 'indent', value: 1,
    enabled: (instance) => Boolean(instance.getFormats().canIndent),
  },
  {
    label: 'Undo', text: '↶', run: (instance) => instance.undo(),
    enabled: (instance) => instance.canUndo(),
  },
], { label: 'Document formatting' });
```

Tab enters the toolbar through a single enabled button; Left/Right and Home/End move between enabled buttons, Enter/Space activate, and Escape restores the editor selection. DOM bookmarks preserve the caret in empty items. Call `dispose()` before destroying the editor; detached toolbar buttons stop executing commands.

`getFormats()` returns formats at the start of selected text, `mixed` lists nonuniform formats, `listDepth` reports nesting, and `canIndent`/`canOutdent` describe range availability. Alignment reflects the current block. Heading formatting inside an item retains its `li` and neighboring inner paragraphs.

`editor.format('clear', true)` removes inline marks, links and span styling only from selected text. List structure, blocks, images and alignment remain. An empty selection is a no-op.

## Pasting multiple bodies into an item

In the new local path, `editor.insertHTML` and HTML clipboard insertion replace a selection with two or more ordinary paragraphs/headings. They become bodies of the retained item rather than new list items. The first body joins the untouched prefix while retaining the original left tag and attributes; the final body receives the inline suffix. Middle and final incoming bodies retain their own tags and attributes. Unselected bodies and trailing nested lists remain after the result.

Try **Item body: Multiple blocks → Load block-body sample → Select items → Replace with multiple blocks**. Use **Select item blocks** for a selection within one item, or **Select text in one body** for a selection within one paragraph. **Multi-block HTML** edits the incoming fragment. Undo restores the original selection.

The same multi-block fragment can be inserted at a collapsed caret inside a supported item. In the demo choose **Block insertion position → Body start, Inside a word or Body end → Caret for block insertion → Replace with multiple blocks**. The middle position is inside the first body's bold word. The source prefix joins the first incoming content and its suffix joins the last; neighboring bodies and nested branches remain. A direct inline body receives a `p` when the incoming sequence requires block siblings. No new `li` is created. Undo restores the original caret position.

A single ordinary heading and quote have the separate paths described below. Incoming semantic blocks, mixed inline/block fragments, lists and tables remain outside the new multi-block path. Native input, inline insertion and other single structural roots retain their previous handlers. Full rules and pre-mutation refusal are described in the [API](/api#list-item-selections-and-boundaries).

Another single structural root, such as a table, within one original body retains its earlier generic handler; the new path does not redefine that behavior.

## A single heading inside an item

An ordinary `h1`–`h6` is inserted as a separate item body with its own tag and allowed attributes. The source prefix stays in a separate body before it; the original end body's suffix stays in a separate body after it with its original tag/attributes. Direct inline content becomes `p`. The caret starts before the right suffix; empty edges retain placeholder `br`. No new `li` is created, and neighboring bodies and branches remain. Unlike multi-block insertion, the incoming heading wrapper is not removed.

Load a list sample, choose a position and click **Caret for block insertion**, or use the selection buttons, then **Single heading HTML → Insert heading**. For example, `Al|pha` becomes `<p>Al</p><h2>Title</h2><p>pha</p>`. A single semantic heading is refused before editing.

## A quote inside an item

A single ordinary `blockquote` is inserted as a separate block: the source prefix stays before it and a separate body after it receives the original suffix and its tag/attributes. Direct inline items receive `p` edges. The caret starts before the right suffix. The quote's tag/attributes, neighboring bodies and nested branches remain; no new list items are created. Empty edges, an empty inline quote and empty paragraph/heading children receive editable placeholders.

An incoming quote may contain either inline content with allowed marks/links/images, or ordinary paragraphs and headings. A semantic quote wrapper or semantic body children, mixed inline/block content, nested quotes, lists, tables and other structures are refused before document mutation. Inline semantic nodes retain their metadata after schema validation.

Load the source list sample, choose a caret position or select text/items, then **Quote HTML → Insert quote**. The default field contains a paragraph and heading inside the quote. Ordinary input in the right suffix and Undo remain available.

### Repeated insertion beside a quote

Click **Load repeated insertion sample → Caret after existing quote**, then **Insert quote → Insert heading → Replace with multiple blocks** consecutively. The original quote, following bodies and nested branch remain without reloading; every step has its own Undo. **Caret before existing quote** places insertion on the other side. Loading replaces the document.

Only the new block API/clipboard path treats ordinary source quotes as whole preserved nodes. For insertion outside a quote, selection endpoints must be in ordinary text bodies; a separate profile now supports crossing or fully covering one or several ordinary quotes inside the same item. An item-level position resolving to the whole quote is also a barrier. Unsupported or semantic quotes reject the operation even outside the selection. Native boundary operations, inline insertion and single-paragraph insertion are not extended. This slice does not claim complete quote editing or verified browser compatibility; see the [API](/api#list-item-selections-and-boundaries) for the bounded contract.

### Block insertion inside one quote

Click **Load insertion-inside-quote sample**, then **Caret inside quote** or **Select blocks inside quote**. **Replace with multiple blocks** and **Insert heading** insert ordinary `p`/`h1`–`h6` bodies inside that same actual `blockquote`. Its wrapper/attributes, untouched child bodies, outer item bodies and nested list remain. Loading the sample replaces the document.

For several incoming blocks, the prefix joins the first body and the suffix joins the last; a single heading remains separate between the prefix and suffix. Direct inline quote content receives a `p` wrapper around its text body. The caret precedes the suffix, empty bodies remain editable and Undo restores the exact original caret or selection direction.

A caret or range across ordinary bodies of **one** quote is supported. Crossing between different quotes uses the separate path below. Inserting a new nested quote, semantic block roots, original images and unsupported structures are atomic refusals. Inline/single-paragraph insertion and native boundary operations retain their previous rules. This is a bounded insertion path.

### Block replacement across one quote

Click **Load quote-crossing sample**, choose **Select outside into quote**, **Select quote into outside** or **Select across whole quote**, then **Replace with multiple blocks**, **Insert heading** or **Insert quote**. Reload the sample to compare directions; loading replaces the document.

This sample shows one quote; the same bounded profile supports several ordinary quotes in one item. Every incoming wrapper keeps its tag and allowed attributes at item level, including the first paragraph of a multi-block payload. The unselected source quote edge retains its actual quote wrapper and stays quoted; a fully selected quote is removed. Entering a quote creates an editable empty paragraph before its quoted remainder and places the caret there. Leaving a quote keeps the outside suffix in its own body, with the caret at its start. Other bodies and the nested branch remain in order. Different-quote endpoints and multiple covered quotes are allowed within one item or eligible consecutive items under the profile below; cross-level and into-branch ranges remain blocked. Native/inline paths are unchanged.

### Block replacement across several quotes

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

## Current boundaries

See [verification and remaining limits](/roadmap#verification-and-limits) for current results. One item may contain multiple ordinary `p`/`h1`–`h6` bodies followed by nested lists. Replacement between bodies in one item or sibling items preserves unselected bodies; Enter moves subsequent bodies into the next item, while Delete/Backspace join adjacent bodies. Detailed limits, including semantic bodies and structural payloads, are in the [API](/api#list-item-selections-and-boundaries). In the demo open **List item selection → Item body: Multiple blocks → Load block-body sample**. Try **Select item blocks** or **Select items** and replacement; **Caret before Delete** prepares an internal boundary. For the first body choose **Backspace scenario → Load Backspace sample → Caret before Backspace** and press Backspace: try joining, exiting a root item and lifting a nested item. Loading replaces the document. The previous item must have supported bodies. Nested branch before others demonstrates lifting from a nonfinal branch: earlier branches stay with the owner; the lifted item retains its own branches, then following source items, then later owner branches. List kinds, attributes and content order remain without coalescing. Moved later branches pass ordinary-list and supported-direct-item preflight before editing. Semantic and complex shapes remain atomic barriers. We do not promise identical normalization for arbitrary office-editor HTML. Real IME/mobile verification and a complete accessibility audit remain on the roadmap. Text color and link editing are described in the [separate guide](/styling).

Boolean inline styles (bold/italic/underline/strike/code/subscript/superscript) use a local validated transformation when selection stays in one plain paragraph or heading. Unrelated blocks and their DOM listeners remain connected. Unsupported/complex and cross-block selections keep the general path. Adding an already inherited mark is a no-op; undo/redo and public HTML/JSON validation retain their contracts. No application configuration is required.

Optional [list properties](/list-properties), through `/plugins/list-properties`, change start/reversed/marker on one whole current container with Undo. They are explicitly installed, excluded from preset defaults and do not recalculate continued numbering.

Optional [LTR/RTL text direction](/text-direction), through `/plugins/text-direction`, changes explicit dir on the closest ordinary block or siblings sharing a parent/cell. Reset inherits surrounding direction rather than forcing LTR; presets and ready toolbar do not install it automatically.
