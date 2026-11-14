# Everyday editing: lists and formatting toolbar

Status: implemented local milestone. Existing document schema v1 and public imports stay compatible; core/plugins remain dependency-free. No automatic Git publication is part of this local feature request.

## List commands and input

- `format('list', 'bullet' | 'ordered' | false)` affects only selected editable blocks/items. Adjacent compatible lists coalesce; changing/removing a middle item splits its containing list and preserves unaffected siblings, nested lists, inline content, links and images. List items must remain under ul/ol; block formatting inside an item changes its inner block, never replaces li with a heading under ul.
- `format('indent', 1 | -1)` indents/outdents a contiguous sibling range of list items, preserving their subtrees. Indent moves under the preceding sibling; the first sibling cannot indent. Outdent lifts one level; trailing nested siblings move under the last lifted item to preserve order. Root outdent removes list formatting. Maximum depth is eight list levels. Invalid multi-container selections reject atomically; read-only blocks mutation.
- Enter splits an item at the caret, preserving inline markup and moving the following content/sublist into the new item. A selected range within one item's own content is replaced before splitting. Enter on an empty root item exits into a paragraph, preserving following items; on an empty nested item it outdents one level. Shift+Enter inserts a line break inside the item.
- Backspace at an item's start merges it into the previous sibling with the caret at the join and preserves nested content. At the first sibling it outdents/unwraps one level. The bounded forward-Delete contract below and the separate `list-selection.md` contract extend specific deletion/replacement shapes; other shapes keep their explicitly documented owner. Arbitrary cross-container replacement normalization and native IME/mobile certification are not claimed.
- Tab/Shift+Tab indent/outdent outside tables. Inside cells Tab remains table navigation; toolbar indentation still works. Composition and modifier shortcuts must not trigger structural input handlers.
- Every structural operation is one history revision with exact selection restoration on undo/redo. Empty-item caret positions must not be confused with identical text offsets in neighboring blocks.

## Bounded forward Delete — implemented locally, validation deferred

The new path owns a collapsed `deleteContentForward` at the end of an item's own direct inline body, immediately before any trailing direct `ul`/`ol` branches. Text, supported marks/links/spans/code and br are supported. A single br in an otherwise text-empty body is an editable placeholder, not an extra line to join. This path receives only cancelable, not already-canceled beforeinput; composition/read-only and modifiers retain the core input guards. It adds no keydown interception and leaves existing Backspace/lift behavior unchanged.

When the current and next sibling `li` belong to the same ordinary list and both have supported direct inline bodies, retain the left item and its attributes, append the right item's own body, and put the exact DOM caret at that join. Preserve both items' trailing nested branches as whole subtrees, in left-then-right order after the joined body. Do not coalesce those branches, rewrite their attributes, scan/join unrelated lists, or normalize their descendant DOM. Empty inline wrappers and their semantic metadata remain; remove only own-body placeholder br. Existing public schema support is unchanged: this does not add ordered-list start/value properties or new SDK tags.

At a recognized own-body end, a final item, semantic item/list marker, unsupported body or unsupported next sibling is an atomic barrier: consume Delete without content, selection or history change. Do not merge out of a list, lift to its parent item or move across cells. Deletion inside a body remains native. The new handler uses the existing transaction/history; one undo restores the original list, exact caret and branches, redo restores the join, and subsequent native typing remains at that position with existing native mark-boundary affinity.

Acceptance fixtures cover ordinary and nested lists, merged-cell isolation, rich and Unicode joins, real br positions, empty placeholders, preserved branch attributes/DOM identity, unrelated siblings, barriers, one-step history and canceled/read-only/composition input. These fixtures have been written but not executed: the user requested deferred test runs, builds, type checks and size measurements for this local batch. No verification or byte delta is claimed here.

## Formatting and toolbar

- `format('clear', true)` clears inline marks, links and spans on selected text while retaining unselected formatting, blocks, lists, images and alignment. It is a no-op without a text selection.
- `getFormats()` retains values at selection start, reports nearest list type and block alignment, and adds `mixed: string[]` for nonuniform selected formats plus `listDepth`, `canIndent`, `canOutdent`. A mixed boolean toggle applies the mark to the whole selection. Existing boolean/format keys are retained.
- `ToolbarAction` adds optional `enabled(editor): boolean`. Built-in undo/redo reflect history availability. Buttons reflect true/false/mixed states; actions preserve DOM selection bookmarks, including empty items and keyboard activation. External document replacement clears the saved selection and pending state.
- Optional fourth `createToolbar` argument `{ label?: string }` localizes the toolbar accessible label. The default toolbar includes ordered lists, indent/outdent and clear formatting. All controls retain visible focus; ArrowLeft/ArrowRight/Home/End move among enabled buttons with one tab stop; Escape returns to the editor. Detached controls are inert after disposal and subscriptions/listeners are cleaned up. Read-only disables edit controls.

## Demo and acceptance

RU/EN homepages and playground expose the same enhanced toolbar, list/block/alignment controls with mixed states, and a dedicated nested-list sample. Include short Enter/Backspace/Tab instructions and preserve selection across dropdowns. Do not claim full editor parity/accessibility.

Test Chromium, Firefox and WebKit: multi-paragraph list creation, subset conversion/removal, nested range indent/outdent with trailing siblings, depth boundary, empty root/nested Enter, rich split, Shift+Enter, Backspace joins and image/sublist preservation, selection/history, table-cell list isolation/navigation, malformed selection rollback, read-only/composition, mixed formatting/clear, undo state, toolbar keyboard navigation, empty-item bookmark, external replacement and cleanup. Browser docs tests exercise both homepages, list commands, live format state and mobile layout. Measure sizes and run check/docs build/docs tests.
