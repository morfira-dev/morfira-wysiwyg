# Lists and formatting

[Try it on the homepage](/en/#editor): select **“Lists and nesting”** and click “Load sample”. Loading a sample replaces the document and resets history.

## Working with lists

Multiple selected paragraphs become one list. Changing or removing the list type affects selected items, preserving unselected siblings and nested lists.

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

Within table cells, Tab keeps cell navigation. Use toolbar buttons to change list nesting inside cells. Shift+Enter and normal typing retain content inside the item. A sublist after the Enter position moves into the new item with the trailing content.

During composition, tables leave Tab/Shift+Tab/Escape to IME candidate handling: the caret does not move to another cell and no row is added. Ordinary table navigation resumes after composition ends.

## Paragraphs, headings and IME input

In a plain paragraph, Enter splits text at the caret while preserving formatting. Inside a heading it creates another heading; at its end it creates a paragraph. Enter in an empty heading converts it to a paragraph. Shift+Enter inserts a line break within the block. Selected text within one block is replaced first.

Backspace at the start and Delete at the end join adjacent paragraphs/headings in the same container. The left block's formatting and a caret at the join are retained. Boundary deletion does not move text across a table, image, list or another cell. Lists follow the table above and the bounded [cross-body and cross-item selection contract](/en/api#list-item-selections-and-boundaries). Every supported structural operation participates in undo/redo.

During active IME input, the browser owns provisional text. Core does not run structural commands or record every candidate in history. Markdown shortcuts and suggestion menus do not intercept candidate confirmation. After composition ends, one undo restores the previous document. Switching to read-only cancels unfinished input; external document replacement remains authoritative. These scenarios use controlled browser events in tests; real candidate windows and mobile keyboards still require separate manual validation.

Try the keys in the homepage editor or the [playground](/en/playground); no additional module is required.

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

Try **Item body: Multiple blocks → Load block-body sample → Select items → Replace with multiple blocks**. Use **Select item blocks** for a selection within one item, or **Select text in one body** for a selection within one paragraph. **Multi-block HTML** edits the incoming fragment. Undo is intended to restore the original selection; these scenarios have not been executed yet.

The same multi-block fragment can be inserted at a collapsed caret inside a supported item. In the demo choose **Block insertion position → Body start, Inside a word or Body end → Caret for block insertion → Replace with multiple blocks**. The middle position is inside the first body's bold word. The source prefix joins the first incoming content and its suffix joins the last; neighboring bodies and nested branches remain. A direct inline body receives a `p` when the incoming sequence requires block siblings. No new `li` is created. Undo restores the original caret position; these scenarios have not been executed yet.

A single ordinary heading and quote have the separate paths described below. Incoming semantic blocks, mixed inline/block fragments, lists and tables remain outside the new multi-block path. Native input, inline insertion and other single structural roots retain their previous handlers. Full rules and pre-mutation refusal are described in the [API](/en/api#list-item-selections-and-boundaries).

Another single structural root, such as a table, within one original body retains its earlier generic handler; the new path does not redefine that behavior.

## A single heading inside an item

An ordinary `h1`–`h6` is inserted as a separate item body with its own tag and allowed attributes. The source prefix stays in a separate body before it; the original end body's suffix stays in a separate body after it with its original tag/attributes. Direct inline content becomes `p`. The caret starts before the right suffix; empty edges retain placeholder `br`. No new `li` is created, and neighboring bodies and branches remain. Unlike multi-block insertion, the incoming heading wrapper is not removed.

Load a list sample, choose a position and click **Caret for block insertion**, or use the selection buttons, then **Single heading HTML → Insert heading**. For example, `Al|pha` becomes `<p>Al</p><h2>Title</h2><p>pha</p>`. A single semantic heading is refused before editing. This local scenario, history and exact caret have not been verified by execution yet.

## A quote inside an item

A single ordinary `blockquote` is inserted as a separate block: the source prefix stays before it and a separate body after it receives the original suffix and its tag/attributes. Direct inline items receive `p` edges. The caret starts before the right suffix. The quote's tag/attributes, neighboring bodies and nested branches remain; no new list items are created. Empty edges, an empty inline quote and empty paragraph/heading children receive editable placeholders.

An incoming quote may contain either inline content with allowed marks/links/images, or ordinary paragraphs and headings. A semantic quote wrapper or semantic body children, mixed inline/block content, nested quotes, lists, tables and other structures are refused before document mutation. Inline semantic nodes retain their metadata after schema validation.

Load the source list sample, choose a caret position or select text/items, then **Quote HTML → Insert quote**. The default field contains a paragraph and heading inside the quote. Ordinary input in the right suffix and Undo remain available. Tests, builds and fresh measurements are deferred.

### Repeated insertion beside a quote

Click **Load repeated insertion sample → Caret after existing quote**, then **Insert quote → Insert heading → Replace with multiple blocks** consecutively. The original quote, following bodies and nested branch remain without reloading; every step has its own Undo. **Caret before existing quote** places insertion on the other side. Loading replaces the document.

Only the new block API/clipboard path treats ordinary source quotes as whole preserved nodes. Selection endpoints must be in ordinary text bodies; ranges inside a quote or crossing it, including complete coverage, remain blocked. An item-level position resolving into a quote is also a barrier. Unsupported or semantic quotes reject the operation even outside the selection. Native boundary operations, inline insertion and single-paragraph insertion are not extended. This slice does not claim complete quote editing or verified browser compatibility; see the [API](/en/api#list-item-selections-and-boundaries) for the bounded contract.

## Current boundaries

**The new local slice has not been executed or verified yet.** One item may contain multiple ordinary `p`/`h1`–`h6` bodies followed by nested lists. Replacement between bodies in one item or sibling items preserves unselected bodies; Enter moves subsequent bodies into the next item, while Delete/Backspace join adjacent bodies. Detailed limits, including semantic bodies and structural payloads, are in the [API](/en/api#list-item-selections-and-boundaries). In the demo open **List item selection → Item body: Multiple blocks → Load block-body sample**. Try **Select item blocks** or **Select items** and replacement; **Caret before Delete** prepares an internal boundary. For the first body choose **Backspace scenario → Load Backspace sample → Caret before Backspace** and press Backspace: try joining, exiting a root item and lifting a nested item. Loading replaces the document. The previous item must have supported bodies. Nested branch before others demonstrates lifting from a nonfinal branch: earlier branches stay with the owner; the lifted item retains its own branches, then following source items, then later owner branches. List kinds, attributes and content order remain without coalescing. Moved later branches pass ordinary-list and supported-direct-item preflight before editing. Semantic and complex shapes remain atomic barriers. Tests, builds and fresh size measurements are deferred. We do not promise identical normalization for arbitrary office-editor HTML. Real IME/mobile verification and a complete accessibility audit remain on the roadmap. Text color and link editing are described in the [separate guide](/en/styling).

Boolean inline styles (bold/italic/underline/strike/code/subscript/superscript) use a local validated transformation when selection stays in one plain paragraph or heading. Unrelated blocks and their DOM listeners remain connected. Unsupported/complex and cross-block selections keep the general path. Adding an already inherited mark is a no-op; undo/redo and public HTML/JSON validation retain their contracts. No application configuration is required.
