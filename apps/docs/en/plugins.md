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

[Images and upload callbacks](/en/images) use the optional `/plugins/images` module.

[Find and replace](/en/search) uses the optional `/plugins/search` entry; core does not require it.

[Text statistics](/en/statistics) uses `/plugins/statistics` for document/selection grapheme and word counts.

[Markdown shortcuts](/en/markdown) uses the optional `/plugins/markdown` entry for typing conversions; imports and pasted text stay literal.

[Mentions and slash snippets](/en/suggestions): `/plugins/mentions`, `/plugins/slash`, optional `/plugins/suggestions` and `/plugins/suggestions.css`. Phase 1 inserts ordinary text without persisted IDs.

See [events, plugin cooperation and composable transactions](/en/events). Structural slash actions are documented [here](/en/suggestions#structural-slash-commands).

## Checklists

Install the separate [checklist plugin](/en/checklists) and its CSS through explicit imports. The guide documents single-item commands, checked state and first-slice limits; core-only editors do not load the plugin.


The optional [horizontal-rule command](/en/horizontal-rule) is available through `/plugins/horizontal-rule`: one root paragraph/heading, an editable suffix and one Undo step. Standard/extended install it and its ready toolbar button by default; `horizontalRule: false` omits the instance.

The optional [font plugin](/en/fonts), through `/plugins/fonts`, provides configured family/px-size commands, independent resets and actual/mixed CSS state. It is explicitly installed, excluded from preset defaults and loads no font files.

The explicit [list-properties plugin](/en/list-properties) provides start, reversed and bounded container list-style-type, without extra CSS, a counter engine or preset changes.
