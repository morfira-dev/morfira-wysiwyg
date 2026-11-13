# Table plugin contract — 0.2

Status: implemented preview contract. Regression scenarios live in `tests/editor.spec.ts` and `tests/native.spec.ts`.

- Public entry: `@morfira-dev/wysiwyg/plugins/tables`; separate CSS. No runtime dependency or shared global registry. `tables()` installs instance-local UI and commands.
- Semantic HTML table/caption/column/row/cell structures persist through version 1 document JSON. Cell content may contain supported blocks and inline formatting.
- Use a logical grid resolving rowspan and colspan. Cap dimensions and occupancy to avoid unbounded allocation from imported attributes.
- Commands: insert, select a rectangular cell region, insert/delete rows/columns, merge/split, remove table, cell background/border color, column width. All edits are one atomic undoable transaction and obey read-only.
- Insert/delete through a merged region adjusts spans without losing unaffected content. Removing the origin row/column of a spanning cell moves its origin into a surviving slot. Merge accepts only a full rectangular region; expand selection across already-merged cells or reject it. Split restores rectangular cells and retains content in the origin.
- Pointer/shift selection is scoped to one table; context menu preserves selection. Tab/Shift+Tab navigates cells, Tab at the final cell adds a row. Escape closes UI. Resize handles record one transaction rather than a history item per pointer move.
- Dispose document listeners, menus, subscriptions, resize state and selection styling. Do not persist editor-only selection/resize attributes in exported content.

Acceptance: rectangular editing; merge/split; row and column insertion/deletion through spans; content-preserving HTML/JSON round trips; undo/redo; invalid selection rollback; readonly; keyboard navigation; per-instance isolation and cleanup. Test in Chromium/Firefox/WebKit.

Resize regression: when the caret is in one table and a handle is dragged on another table in the same editor, only the dragged table changes; one undo restores its widths.
