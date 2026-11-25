<script setup>
import TableWorkflowsExample from './.vitepress/theme/TableWorkflowsExample.vue';
</script>

# Everyday table workflows

Create and edit a table with the existing [tables plugin](/plugins), then use the
optional [contextual actions](/contextual-tables) for structure and region selection.
All editing uses the same logical grid for merged cells and participates in Undo.

<TableWorkflowsExample />

## Select rows, columns or the table

```ts
import { tableCommands, getTableSelection } from '@morfira-dev/wysiwyg/plugins/tables';

const table = tableCommands(editor);
table.selectRow();
// Alternatively: table.selectColumn(); or table.selectTable();
const selection = getTableSelection(editor);
```

Put the caret in a cell or select a cell rectangle first. `selectRow()` expands
all rows touched by that region to full width; `selectColumn()` expands its columns
to full height. `selectTable()` selects the entire ordinary table. These commands
preserve the actual cells, native text range, exported document and Undo history.
They can be used in read-only to prepare copying. Composition leaves selection
unchanged. Invalid/protected/nested/sparse grids and stale native caret contexts
are refused before replacing the old selection.

**Merged cells are selected whole.** The rectangle expands until no rowspan or
colspan crosses its boundary. Selecting one row may therefore select additional
rows, and selecting one column may include neighboring columns. The live summary
shows logical rows × columns and the number of actual selected cells.

In an editable table, press **Alt+F10** to reach contextual controls, Tab to
**Select rows**, **Select columns** or **Select table**, then Enter. This does not
replace native Shift+Arrow text selection. A read-only transition dismisses the
old toolbar session; a fresh table interaction permits observational selection
while structure/merge/split actions remain disabled. Keyboard focus in read-only
also depends on the application's focusable host and browser behavior.

## Fill, copy, format and undo

1. Load the simple table, then choose **Select table**.
2. Choose **Paste sample TSV**. It fills the selected 2 × 2 region using existing
   clipboard rules; the table is not replaced by plain text.
3. Select the table again and choose **Copy HTML and TSV**. The preview is local:
   it does not access the system clipboard or transmit content.
4. Choose **Color selected cells**, then Undo/Redo. Each mutation has its normal
   single-command history. Use the contextual row/column actions for structure.
5. Load the merged table and select a row/column to inspect span closure. Loading
   replaces the document and establishes a new history baseline.

The TSV sample is independently authored demonstration data. Actual
[Office paste](/office-paste) has a separate documented source corpus and supported
format contract. These examples do not claim complete Excel interoperability.

## Optional imports and lifecycle

The commands are part of `tables()`. Contextual controls remain a separate factory
and CSS entry:

```ts
import { createContextualTableUI } from '@morfira-dev/wysiwyg/ui/contextual-table';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/plugins/tables.css';
import '@morfira-dev/wysiwyg/ui/contextual-table.css';

const controls = createContextualTableUI(externalHost, editor);
// On unmount: controls.destroy(); editor.destroy();
```

The toolbar belongs to one editor and an empty external host. Selection observations
are not mutation authority; actions recheck their target after focus callbacks.
For table-wide metadata and cell styles use the separate [properties form](/table-properties).
