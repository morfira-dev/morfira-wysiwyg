# Table headers and caption

Extend the existing opt-in table-properties plugin and form; no new plugin,
dependency or default installation. TablePropertiesPatch adds headerRow?: boolean,
headerColumn?: boolean, caption?: string | false. Caption is literal text <=5000
UTF-16 units; empty/false removes it. Validate all fields atomically, including
explicit undefined and unknown fields. Omitted fields preserve their data.
TablePropertiesState adds headerRow/headerColumn boolean and caption string|false.

Header commands describe the first logical row/column of the current whole
ordinary table, regardless of selected cell rectangle. A header row uses TH
scope=col; a header column uses TH scope=row; their intersection uses col.
Enabling headerRow requires at least one following body row, enabling
headerColumn at least one following body column. Infer existing complete axes
from TH tags and compatible scopes (missing scope is accepted); the column
inference ignores the corner when a complete header row exists. Partial imported
axes report false; they are normalized only on an explicit corresponding write.
When disabling one complete axis retain the other complete axis at the corner.
Do not move rows between THEAD/TBODY/TFOOT or change their order.

Reject the entire patch before mutation if a requested header-row write includes
a first-row rowspan >1 or a requested header-column write includes a first-column
colspan >1: those cells cross the header/body boundary. Spans wholly within an
axis remain valid; no automatic splitting or data loss. Reject enabling both
axes if either bound is unsupported. Reject duplicate direct CAPTIONs and
unsupported/protected/semantic/foreign/nested targets using existing strict
tablePropertyTarget rules. Missing/stale targets remain inert.

Conversion replaces only TD/TH wrappers whose tag must change; move actual child
nodes, preserving rich content, validated attributes/styles, rowspan/colspan,
row/table identity and unaffected cell identity. Remove scope when making TD.
Keep native range endpoints/direction and remap the private logical rectangle to
actual replacement cells; one combined patch is one transaction and one Undo.
Retagged wrapper identity necessarily changes. Revalidate target after SDK focus.
Identical/no-op patches preserve history/redo. Axis-only writes do not rewrite
caption or arbitrary imported headers elsewhere in the grid.

Caption uses an actual direct native CAPTION before other table children. A
caption-only change retains table/rows/cells. If existing caption text equals
the requested text, preserve its rich child nodes; explicit different text
replaces only caption contents via textContent. Existing absent+empty is a no-op.
Caption caret alone is not a cell selection in this slice; use a selected cell
or retained form target to edit it. No arbitrary markup or remote content.

Schema v1 already supports TH scope and CAPTION through HTML/JSON; preserve that
plugin-independent codec. Full-document roundtrip retains them. Existing cell
rectangle clipboard does not copy the table caption; do not widen this scope.
This is basic native semantics, not full complex-header association or Office
conversion. App CSS may customize --mw-table-caption-* scoped caption styles.

The existing properties form adds localized Header row/Header column selects
(default/off and on), plus native caption textarea <=5000. Preserve multiline
drafts; Enter in the caption inserts a newline rather than applying. Keep string drafts and
dirty-only patching, mixed cell properties and stale/focus/lifecycle safeguards.
Public TablePropertiesFormValues gains headerRow/headerColumn/caption string
fields; new fields are additive and getValues includes them. Existing source
type fixtures/exact expected shapes must be updated accordingly. Main demo and
RU/EN docs use public API and controls; provide a representative merged sample.

Author focused regressions for both axes/corner, disabling, partial imports,
merged crossing atomic refusal, captions rich/safe/reset, selection/history,
readonly/IME/focus replacement/disposal and localized controls. No local tests
run at the user's request; record only actual build/type/tree/package/site checks
and minified/gzip/Brotli/CSS measurements. Keep all existing budgets unchanged.
