# Daily table selection and authoring workflows

Status: accepted bounded table workflow contract, 2026-11-25.

The existing table grid, Tab/Shift+Tab, TSV/HTML clipboard, merge/split,
structural commands and optional property/context forms remain unchanged.
Add explicit whole-region selection to avoid coordinate calculations or dragging.

## Observational commands

`tableCommands(editor).selectRow()`, `.selectColumn()` and `.selectTable()` return
void and operate on the current authoritative rectangle, or a native caret/text
range wholly inside one ordinary cell. Row/column select every full logical row/
column touched by that initial region. The result is span-closed: a merged cell
crossing its boundary may expand the result to additional rows/columns until the
rectangle contains complete cells. Whole-table selection includes every grid cell.

These actions change only plugin-owned logical selection/notification markers.
They preserve actual cells and content, native Range/direction, pending formats,
document HTML/JSON and history. Read-only permits observation/copy; active
composition refuses without touching selection. Disposed plugins throw. A missing,
ambiguous, detached, foreign, nested/protected or malformed/sparse table target
throws before clearing the existing selection or changing markers. No coordinate
parameter or new persisted schema is introduced.

## Contextual controls

The separately imported contextual table toolbar adds localized Select rows,
Select columns and Select table buttons. Existing Alt+F10/Tab/button activation
provides keyboard access without overriding native text selection or IME shortcuts.
Selection actions use the same exact target and focus-time revalidation as edits;
they do not grant authority to a stale application control.

Enabling read-only still invalidates/dismisses a retained session. A fresh ordinary
table interaction can reopen observational controls in read-only; every mutation
action remains disabled and guarded. Read-only browser blur to body may retain
the exact native table range for this new observational session. Composition/API
replacement/disposal still dismiss and invalidate. Native keyboard access remains
subject to application focusability and browser read-only behavior.

## Complete local example

The bilingual example combines selection controls and selected-region statistics,
native cell editing/Tab, one intentional TSV matrix similar to spreadsheet
clipboard data, merged-cell structure actions, copied HTML/TSV, cell formatting
and Undo/Redo. TSV sample is project-authored synthetic data, not a new native
Excel capture or fidelity certification. Actual Office corpus provenance remains
under `office-paste.md`.

## Acceptance

Focused Chromium/Firefox/WebKit cases cover merged-row/column expansion, readonly
observational selection and mutation refusal, malformed/protected source atomic
refusal, unchanged native range/history/HTML, stale focus and scoped cleanup.
One representative edit/copy/paste/undo workflow uses existing grid behavior
rather than duplicating its full test matrix. Docs exercise public controls and
RU/EN labels. Measure selected table/context closures with shared chunks once.
