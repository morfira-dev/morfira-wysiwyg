# Contextual table toolbar

The [homepage](/#editor) and [playground](/playground) explicitly enable **Contextual table toolbar**. Open its laboratory, load the merged-grid sample and choose **Select 2 × 2 region**. Alpha spans two rows: the region includes three actual cells. Merge preserves their rich content; Split keeps the content in the origin cell. The surrounding cells remain intact. Use the ordinary Undo/Redo controls to inspect each atomic operation.

## Installation

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { tables, tableCommands, getTableSelection, tableSelectionChange } from '@morfira-dev/wysiwyg/plugins/tables';
import { createContextualTableUI } from '@morfira-dev/wysiwyg/ui/contextual-table';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/plugins/tables.css';
import '@morfira-dev/wysiwyg/ui/contextual-table.css';

const editor = createEditor(editorHost, { plugins: [tables()] });
const api = tableCommands(editor);
const tools = createContextualTableUI(overlayHost, editor, { gap: 8 });
const stop = editor.events.on(tableSelectionChange, () => {
  // Read current state after a notification; do not use events as commands.
  const state = getTableSelection(editor);
  console.log(state?.rectangle, state?.canMerge);
});
const dispose = () => {
  stop();
  tools.destroy();
  editor.destroy();
};
```

`tables()` is required before mounting. Presets and ready toolbars do not install this module. There are no runtime dependencies or implicit CSS imports. Core, tables and contextual-table CSS are sufficient for this panel; forms/editor CSS are not required solely for it. Imports are SSR-safe; mounting needs a browser.

`overlayHost` must be empty, connected, in the editor document and outside its surface. Choose an application-owned viewport layer without transformed, filtered, perspective, paint-contained or clipping ancestors. There is no global overlay service. The controller exposes readonly `element`, `refresh()` and idempotent `destroy()`; refresh after destruction throws. Options are optional `label`, `onError` and finite `gap` from 0 to 32 CSS px, default 8. Public exports include `ContextualTableUIOptions`, `ContextualTableUIController`, `ContextualTableUIMessageKey` and RU/EN `contextualTableUIMessages`. Action labels reuse the tables catalog and follow editor locale.

## Selection and capabilities

`getTableSelection(editor, range?)` returns `TableSelectionState | undefined`. It does not focus, move native Selection, change private cell selection, add attributes or create history. The optional native Range projects a valid cell selection while an application control owns focus. Malformed runtime arguments throw; foreign, detached or ambiguous selections return undefined. A saved Range is not authority to mutate a replaced document.

State contains actual `table`, a copied readonly array of actual unique `cells`, readonly `rectangle: CellRectangle`, logical `rows`/`columns`, `explicit`, `revision`, `canMerge` and `canSplit`. Rectangle coordinates `top`, `left`, `bottom`, `right` are inclusive and zero-based. Spans expand the rectangle to fully covered cells. Explicit plugin-owned selection takes precedence; a conflicting projected/native range in another cell/table is rejected. Without it, both Range endpoints must belong to the same ordinary cell. Cross-cell text ranges, multiple native Ranges and forged `data-mw-selected` attributes never become a logical rectangle.

The state reader is a separate selective export: command-only imports do not load its optional grid inspection.

Only complete bounded grids up to 100 × 100 qualify. Holes, overlaps, nested/foreign content and tables containing protected semantic `data-mw-node` descendants are unsupported in this first UI profile. Merge needs at least two fully covered actual cells; Split needs a spanning selected cell. Read-only and composition prevent actions. Capability flags describe a snapshot; commands still validate live state.

`tableSelectionChange` is a shared typed per-editor notification carrying a revision number. The plugin coalesces notifications in a microtask after transactions, and does not notify after disposal. Native/logical selection, API/history/document and read-only/composition changes invalidate the snapshot. Subscribe with `editor.events.on` and dispose your subscription. Events are observations, **not RPC or a mutation bus**.

External application controls can call `api.registerSelectionHost(host)` to preserve the plugin-owned logical selection during their pointer interaction; call the returned idempotent cleanup on unmount. Hosts must be connected same-document external HTML elements, outside the surface and not ancestors containing the editor element. Body/global roots are invalid. Registration is per-editor and reference-counted; it neither focuses, stops events nor changes content. The contextual module registers its own panel automatically.

## Commands, focus and history

Eight native buttons insert a row above/below, delete selected rows, insert a column left/right, delete selected columns, merge and split. Insertion disables at the corresponding 100-axis limit. Structural commands use the existing logical grid and transactions, preserving unaffected content and adjusting spans. Each successful action is one Undo step and dismisses the panel; deleting every selected row/column can remove the table, with Undo restoring it. Showing and positioning do not create history.

A focused collapsed cell caret or explicit multi-cell rectangle opens automatically. A noncollapsed text range inside one cell uses text formatting; **Alt+F10** explicitly enters table tools instead. Carets in links, exact IMG selection, captions and protected semantic nodes are excluded, allowing their separate modules to own those contexts. This is not a new structural selection model or global overlay coordinator.

**Alt+F10** from the eligible editable surface focuses the first enabled action. **Escape** closes visible or pending tools and restores a valid native cell Range once. Outside pointer/focus departure dismisses without taking focus. A new selection, intentional API `select` or Alt+F10 reopens; queued work for the dismissed session cannot immediately reopen it. Native table Tab navigation remains unchanged.

Before commands, the UI restores the saved Range and checks current revision, actual table/cell identities, rectangle and restrictions after focus callbacks. API replacement, Undo recreating nodes, another table, read-only, composition and disposal invalidate the old target. Stale or unsupported actions cannot silently edit a replacement. Destroy releases host registration, subscriptions, listeners, observers and pending layout work while leaving editor/history usable.

## Security, scope and weight

Labels/errors render as text. The UI does not clone cell contents or images and issues no table mutations itself: existing validated commands own edits. It reads only the active grid on selection/data changes or activation; geometry-only work does not repeat grid scans. Fixed viewport placement handles visible clipping, scrolling, resize and VisualViewport, with wrapping/scrolling narrow controls and no polling.

Cell colors/borders, resize, clipboard controls, header/caption UI and table properties are not added here; existing [table APIs](/plugins#tables) remain available. Application/plugin code is trusted, and frontend checks do not replace backend validation or CSP. Full touch, mobile IME and accessibility certification are not claimed.

This module uses a separate import and supports tree-shaking.
