# Cell padding and border width/style

Extend opt-in table-properties, not core commands or preset installation.
TablePropertiesPatch adds cellPadding?: string|false (canonical integer 0–48px),
cellBorderWidth?: string|false (canonical integer 0–12px), and
cellBorderStyle?: TableCellBorderStyle|false. Export TableCellBorderStyle as
solid|dashed|dotted|double|none. All three state fields are inline values or false,
with mixed when selected actual cells differ. Existing string form drafts add
these fields. No computed-style state, inherited-property override or implicit
style selection: border-width/color/style remain independently editable.

Apply uniform physical padding/border-width/border-style to every unique actual
TD/TH in the authoritative logical rectangle, including complete merged cells.
Padding is one value for all four sides. A false/empty reset removes the owned
shorthand (all its inline sides), restoring stylesheet defaults; it does not
reset the other border properties or cell contents. None/0px may hide borders;
collapsed-border conflict resolution, theme CSS and content affect rendering.
This is not per-edge formatting, table-wide border style or exact geometry.

Validate/snapshot the entire patch before target lookup/transaction. Reject
explicit undefined, non-string numeric values, negative/fractional/leading-zero
or out-of-range lengths, extra units/values, CSS-wide keywords, !important,
var/calc/url, declaration injection and unsupported enum values. Missing/stale
targets remain inert. Existing readonly/IME, per-editor lifecycle and expected
target revalidation after SDK focus remain authoritative. One combined patch
is one Undo; identical/reset-absent changes preserve history/redo. Preserve
actual cells, children, spans, rows, captions and native/logical selection.

Schema v1 gets only additive bounded CSS support: TD/TH padding accepts one
integer 0–48px, border-width one integer 0–12px and border-style exactly the enum.
Other tags/longhands/shorthands/values are discarded by HTML and JSON codecs.
The sole shorthand exception is canonical `border: <bounded px> <style> <safe
color>` on TD/TH, retained as one atomic shorthand declaration. This preserves
browser CSSOM serialization of combined width/style/color writes. Validate the
entire triple against the existing safe color grammar and never split it into
partially applied width/style declarations. An unrecognized CSS color name is
ignored by the browser for the entire shorthand, matching native CSS semantics;
the existing named-color grammar is not a CSS color certification. CSS-wide
keywords, functions outside the numeric color grammar and extra tokens reject.
Enforce the existing 20000-code-unit retained attribute limit after style
normalization too, before rendering; overflow rejects with RangeError atomically.
Existing independent cell color/vertical-align styles and width/height codecs
are unchanged. Plugin-free HTML/JSON and allowed cell-rectangle clipboard retain
the new styles; structural operations retain surviving cell styles, inserted or
split cells keep existing defaults, and merge retains the origin's styling.
Older readers may discard the new declarations; no schema version bump or
general CSS passthrough is implied. Codec processing stays inert.

The independent properties form adds native labeled text inputs (px hint) and
border-style select with default/reset plus the enum, localized RU/EN. Mixed
state uses existing presentation. Dirty-only Apply preserves unrelated/mixed
properties. No new CSS, runtime dependencies or implicit contextual/preset UI.
Main/playground demo reuses public forms with merged cells and an honest hint.

Author representative API/codec/form/demo definitions for mixed/merged targets,
combined patch/history/identity/no-op/reset, strict unsafe payload rejection,
readonly/IME/focus/disposal, plugin-free persistence and clipboard limits. Local
tests remain disabled by user instruction. Run only build/type/project/tree/
package/site checks, report raw/gzip/Brotli/CSS from actual builds and retain all
existing budgets. Local commit only, no push or pipeline observation.
