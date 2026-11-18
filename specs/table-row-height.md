# Minimum table row height

Extend opt-in table-properties with `rowMinHeight?: string | false` in the patch
and `rowMinHeight: string | false | 'mixed'` in state. Use canonical integer
1–1000px strings (no whitespace, decimals, leading zero, other units or CSS
keywords) and false to remove the owned row height. Validate the complete patch
before eligibility/transaction as with other properties; explicit undefined and
unknown fields remain invalid. Empty/idempotent patches retain history/redo.

Use native TR inline `height`, which participates as a minimum in CSS table
layout. Do not use unreliable TR min-height, fixed/clipped height, spacer content
or per-cell heights. Larger content, padding, spanning cells, table/host layout
can require a larger rendered height; this is not an exact pixel-height promise.
Setting/resetting this property leaves cell heights/styles and table height alone.

Target every actual logical row intersecting the authoritative selected cell
rectangle, regardless of its selected columns. A cell with rowspan expands the
rectangle through its full span, so a caret in it affects all covered rows.
Apply once per actual TR, keeping actual rows/cells/children, captions, sections,
headers and grid geometry. Existing strict projection rejects malformed, nested,
foreign, protected and semantic targets. SDK read-only/IME/transaction gates and
post-focus expected-target revalidation remain authoritative. A combined row,
cell, header and table patch is one Undo; no resize handles in this slice.

Read inline row.style.height (not computed layout): missing values are false,
different row values yield mixed. Existing safely imported height values outside
the command's narrower px envelope are reported as stored strings and preserved
by unrelated property edits. Schema v1 already admits bounded height styles on
TR; no codec allowlist, persisted format or core dependency graph change needed.
HTML/JSON full-document roundtrip retains row height without this plugin.
Structural operations still rebuild row wrappers, but carry the existing inline
height by logical row: column edits, merge/split and target-table paste/cut keep
the original row-height sequence. Row insertion shifts surviving heights around
a new unset row; deletion removes only the deleted row's height. This includes
insertion/deletion through rowspans and keyboard-appended rows. Expanded paste
keeps target-row heights and adds unset rows; source clipboard TR heights never
overwrite target rows. Selected-cell rectangle clipboard still omits TR height.
Retain safely imported height units too, without clamping or inheriting a
neighbor's height. No new row-style property, row-wrapper identity guarantee or
row-section-preservation contract is introduced. Invalid grid edits remain atomic
under the existing transaction/history boundary.

The existing form adds a localized text input for rowMinHeight with a 1–1000px
hint; empty resets, mixed uses existing mixed placeholder, string drafts and
dirty-only Apply preserve unrelated values. getValues includes the new field.
Existing locale, IME/readonly, native/logical selection, focus races and disposal
rules apply unchanged. RU/EN docs and main/playground demo show merged-row scope
and minimum-versus-rendered-height behavior honestly.

Author representative API/form/browser definitions for selected rows through
spans, mixed/import/reset/no-op/one Undo, invalid/injected whole patches, readonly/
IME/focus/disposal and plugin-free roundtrip; add localized demo definitions.
Do not run local tests at user's request. Run only build/type/project/tree/package/
site checks; report minified/gzip/Brotli and CSS separately, unchanged budgets.
