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

Arbitrary cross-item text replacement and ordinary deletion inside an item still rely on browser behavior. We do not promise identical normalization for arbitrary office-editor HTML. Real IME/mobile verification and a complete accessibility audit remain on the roadmap. Text color and further link-editing flows are a separate step.
