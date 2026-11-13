# Plugins and tables

## Tables

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { tables, tableCommands } from '@morfira-dev/wysiwyg/plugins/tables';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/plugins/tables.css';

const editor = createEditor(host, { plugins: [tables()] });
const table = tableCommands(editor);
table.insert(3, 4);
table.select({ row: 0, column: 0 }, { row: 0, column: 1 });
table.merge();
```

Dimensions are integers from 1 to 100. Nested table insertion is rejected. The plugin uses its own logical grid for spans; all commands are transactions in the editor's history. Imported sparse tables are normalized during structural edits; invalid overlapping or oversized grids are rejected.

## Commands

`insert`, `select`, `rowAbove`, `rowBelow`, `columnLeft`, `columnRight`, `deleteRow`, `deleteColumn`, `merge`, `split`, `remove`, `background(color)`, `border(color)`, `columnWidth(column, pixels)`.

Rows/columns and colors target selected cells, or the current cell. `select` uses zero-based logical addresses; selections expand across existing spans. Merge preserves content in document order; split leaves content in the origin cell. Column width is 40–4000 pixels. Read-only blocks changes.

Drag across cells or Shift-click to select a region. Right-click opens the Russian context menu. Tab/Shift+Tab navigates cells; Tab at the final cell adds a row. Hover a cell's right edge to resize its column; one completed drag is one history edit. Full touch and keyboard-only resize interaction is still pending.

## Write a plugin

```ts
import type { EditorPlugin } from '@morfira-dev/wysiwyg';

const counter = (): EditorPlugin => ({
  name: 'counter',
  setup: (editor) => {
    const stop = editor.subscribe(({ text }) => console.log(text.length));
    return stop;
  },
});
```

Plugin setup returns cleanup. `providePlugin` and `getPlugin<T>` expose instance-local APIs. `transact` groups trusted DOM edits into an atomic undoable change. Register plugins at creation and dispose every subscription/UI resource; no global format registry is used. The core does not import a plugin barrel.

## Table clipboard

`copy()` returns `{ html, text }` without accessing system clipboard permissions. `cut()` returns the same payload and clears selected contents in one transaction. `paste({ html?, text? })` accepts one sanitized table or TSV. HTML preserves spans/styles; TSV supports quoted tabs, newlines and doubled quotes. The grid grows right/down within 100 × 100. A partially intersected destination merge is rejected atomically. A scalar fills explicitly selected cells; larger sources must match a multi-cell selection.

Inside a table, native clipboard events recognize table HTML or tab-separated text. An explicit cell selection also accepts scalar rich/plain content. With no cell-range selection, ordinary text copying and rich-text paste remain native/core behavior. Newline-only text is not automatically treated as a spreadsheet; use the explicit paste API for a single-column matrix.

```ts
const commands = tableCommands(editor);
const payload = commands.copy();
commands.paste({ text: 'Name\tValue\nLanguage\tTypeScript' });
// tables({ onClipboardError: (error) => report(error.message) })
```

Malformed quoting, nested/multiple source tables, over-limit ranges and selection mismatches leave the document unchanged. Browser failures appear in an accessible status message; `onClipboardError` can also report them to the application. API calls throw validation errors. Browser fixtures cover these formats; arbitrary Word/Excel clipboard fidelity is not certified.
