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
| Enter | Split at the caret; a selection within one item is replaced first |
| Enter in an empty item | Lift one level; at the root level exit into a paragraph |
| Shift+Enter | Insert a line break within the item |
| Backspace at the start | Join the previous sibling; lift/unwrap the first item |
| Tab / Shift+Tab | Increase/decrease nesting outside tables |

Within table cells, Tab keeps cell navigation. Use toolbar buttons to change list nesting inside cells. Shift+Enter and normal typing retain content inside the item. A sublist after the Enter position moves into the new item with the trailing content.

During composition, tables leave Tab/Shift+Tab/Escape to IME candidate handling: the caret does not move to another cell and no row is added. Ordinary table navigation resumes after composition ends.

## Paragraphs, headings and IME input

In a plain paragraph, Enter splits text at the caret while preserving formatting. Inside a heading it creates another heading; at its end it creates a paragraph. Enter in an empty heading converts it to a paragraph. Shift+Enter inserts a line break within the block. Selected text within one block is replaced first.

Backspace at the start and Delete at the end join adjacent paragraphs/headings in the same container. The left block's formatting and a caret at the join are retained. Boundary deletion does not move text across a table, image, list or another cell. Lists follow the table above; selections spanning several blocks still use browser behavior. Every supported structural operation participates in undo/redo.

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

## Current boundaries

Arbitrary cross-item text replacement and ordinary deletion inside an item still rely on browser behavior. We do not promise identical normalization for arbitrary office-editor HTML. Real IME/mobile verification and a complete accessibility audit remain on the roadmap. Text color and link editing are described in the [separate guide](/en/styling).

Boolean inline styles (bold/italic/underline/strike/code/subscript/superscript) use a local validated transformation when selection stays in one plain paragraph or heading. Unrelated blocks and their DOM listeners remain connected. Unsupported/complex and cross-block selections keep the general path. Adding an already inherited mark is a no-op; undo/redo and public HTML/JSON validation retain their contracts. No application configuration is required.
