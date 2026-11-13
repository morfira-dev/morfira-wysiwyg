# Everyday editing: lists and formatting toolbar

Status: implemented local milestone. Existing document schema v1 and public imports stay compatible; core/plugins remain dependency-free. No automatic Git publication is part of this local feature request.

## List commands and input

- `format('list', 'bullet' | 'ordered' | false)` affects only selected editable blocks/items. Adjacent compatible lists coalesce; changing/removing a middle item splits its containing list and preserves unaffected siblings, nested lists, inline content, links and images. List items must remain under ul/ol; block formatting inside an item changes its inner block, never replaces li with a heading under ul.
- `format('indent', 1 | -1)` indents/outdents a contiguous sibling range of list items, preserving their subtrees. Indent moves under the preceding sibling; the first sibling cannot indent. Outdent lifts one level; trailing nested siblings move under the last lifted item to preserve order. Root outdent removes list formatting. Maximum depth is eight list levels. Invalid multi-container selections reject atomically; read-only blocks mutation.
- Enter splits an item at the caret, preserving inline markup and moving the following content/sublist into the new item. A selected range within one item's own content is replaced before splitting. Enter on an empty root item exits into a paragraph, preserving following items; on an empty nested item it outdents one level. Shift+Enter inserts a line break inside the item.
- Backspace at an item's start merges it into the previous sibling with the caret at the join and preserves nested content. At the first sibling it outdents/unwraps one level. Other deletion and cross-item text replacement remain native browser behavior; arbitrary cross-item replacement normalization and native IME/mobile certification are not claimed.
- Tab/Shift+Tab indent/outdent outside tables. Inside cells Tab remains table navigation; toolbar indentation still works. Composition and modifier shortcuts must not trigger structural input handlers.
- Every structural operation is one history revision with exact selection restoration on undo/redo. Empty-item caret positions must not be confused with identical text offsets in neighboring blocks.

## Formatting and toolbar

- `format('clear', true)` clears inline marks, links and spans on selected text while retaining unselected formatting, blocks, lists, images and alignment. It is a no-op without a text selection.
- `getFormats()` retains values at selection start, reports nearest list type and block alignment, and adds `mixed: string[]` for nonuniform selected formats plus `listDepth`, `canIndent`, `canOutdent`. A mixed boolean toggle applies the mark to the whole selection. Existing boolean/format keys are retained.
- `ToolbarAction` adds optional `enabled(editor): boolean`. Built-in undo/redo reflect history availability. Buttons reflect true/false/mixed states; actions preserve DOM selection bookmarks, including empty items and keyboard activation. External document replacement clears the saved selection and pending state.
- Optional fourth `createToolbar` argument `{ label?: string }` localizes the toolbar accessible label. The default toolbar includes ordered lists, indent/outdent and clear formatting. All controls retain visible focus; ArrowLeft/ArrowRight/Home/End move among enabled buttons with one tab stop; Escape returns to the editor. Detached controls are inert after disposal and subscriptions/listeners are cleaned up. Read-only disables edit controls.

## Demo and acceptance

RU/EN homepages and playground expose the same enhanced toolbar, list/block/alignment controls with mixed states, and a dedicated nested-list sample. Include short Enter/Backspace/Tab instructions and preserve selection across dropdowns. Do not claim full editor parity/accessibility.

Test Chromium, Firefox and WebKit: multi-paragraph list creation, subset conversion/removal, nested range indent/outdent with trailing siblings, depth boundary, empty root/nested Enter, rich split, Shift+Enter, Backspace joins and image/sublist preservation, selection/history, table-cell list isolation/navigation, malformed selection rollback, read-only/composition, mixed formatting/clear, undo state, toolbar keyboard navigation, empty-item bookmark, external replacement and cleanup. Browser docs tests exercise both homepages, list commands, live format state and mobile layout. Measure sizes and run check/docs build/docs tests.
