# Table size picker

On the [homepage](/en/#editor) and [playground](/en/playground), open the Table toolbar button. Hover or focus changes only the preview; activation inserts a table with one Undo step. The quick matrix is bounded to **8 × 8**. The numeric fields still support **1–100** rows and columns.

## Ready toolbar integration

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { createStandardPreset } from '@morfira-dev/wysiwyg/presets/standard';
import { createStandardEditorUI } from '@morfira-dev/wysiwyg/ui/standard';
import { createTablePicker } from '@morfira-dev/wysiwyg/ui/table-picker';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/plugins/tables.css';
import '@morfira-dev/wysiwyg/ui/forms.css';
import '@morfira-dev/wysiwyg/ui/editor.css';
import '@morfira-dev/wysiwyg/ui/table-picker.css';

const editor = createEditor(editorHost, createStandardPreset());
const ui = createStandardEditorUI(toolbarHost, editor, {
  table: { picker: createTablePicker },
});
// On unmount, call ui.destroy() before editor.destroy().
```

The preset installs table behavior; the separately imported factory adds only the size widget. Without `table.picker`, the toolbar retains its existing fields and button without importing the matrix implementation. A runtime switch cannot remove code already imported into the bundle.

## Standalone widget

```ts
import { createLocale } from '@morfira-dev/wysiwyg';

const picker = createTablePicker(emptyHost, {
  locale: createLocale('en'), disabled: false, rows: 3, columns: 3,
  onSelect: (rows, columns) => console.log(rows, columns),
});
picker.refresh({ locale: createLocale('ru'), disabled: true });
picker.destroy();
```

The controller returns `element`, `refresh(state)` and idempotent `destroy()`. It never edits an editor or invokes table commands itself. Initial dimensions are integers from 1–100; values above eight clamp only the preview. Refresh changes locale and disabled state while preserving that preview. The host must be empty. Standalone application code owns selection restoration and command validation; the ready toolbar handles both.

Arrow keys move without wrapping. Home/End select a row edge; Ctrl/Meta+Home/End select a matrix edge. Enter/Space confirm. Tab leaves its single tab stop; Escape closes the containing panel. This is a group of native buttons without a focus trap, not an ARIA grid. IME keys do not confirm. Read-only, external document replacement and panel destruction prevent a stale callback from inserting a table.

Button names and status use `EditorLocale` and the exported `tablePickerMessages` catalog. Overrides for `ui.tablePicker.label` and `ui.tablePicker.insert` render as text. Separate CSS uses `.mw-table-picker*` selectors and `--mw-*` variables. Importing the module does not access the DOM; table styling and behavior remain separate. Merged cells and nested-table rejection retain the [table command contract](/en/plugins).
