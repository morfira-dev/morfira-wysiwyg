# Table cell text alignment and direction

Extend existing optional table-properties and its reusable form, with no core
format change, new dependency, stylesheet or default preset installation.

`TablePropertiesPatch` adds `cellTextAlign?: TableCellTextAlign | false` where
`TableCellTextAlign` is left|center|right|justify, and
`cellDirection?: TableCellDirection | false` where `TableCellDirection` is ltr|rtl.
Export both types through existing plugin/facade type boundaries. State adds the
same fields with false for absent own values and 'mixed' for differing actual
selected cells. Read only inline TD/TH text-align and canonical dir, not computed
style. Reject unknown/undefined/non-enum/injected values before target lookup.

Compatibility: getState()/getValues() now return two additional keys. Consumers
comparing complete object shapes must account for them. Code constructing a full
TablePropertiesFormValues object adds the two string fields (empty for reset);
setValues remains partial, so ordinary field-specific callers do not change.
Persisted schema and existing field meanings stay unchanged.

Apply to every unique actual TD/TH in the authoritative logical rectangle,
including whole merged cells, through one existing validated atomic command.
Preserve cell identity, contents, spans, headers, caption, table placement, inner
paragraph styles and direction, selection and unrelated properties. Reset removes
only the owned cell property/attribute and resumes inherited browser layout.
Explicit formatting/direction on descendants can override cell inheritance; no
recursive restyling, bidi reordering, automatic direction detection or numeric
counter changes. Physical left/right alignment is independent from direction.
Readonly/IME, stale/focus-time target, semantic-schema and disposal guards remain
authoritative. A combined patch has one Undo; no-op/reset-absent preserves history.

Both properties already persist through schema-v1 HTML/JSON and supported cell
rectangle clipboard. Test those existing boundaries without broadening codecs.
Structural operations retain styling on surviving cells; merge keeps origin,
new split/insert cells retain existing default policy. Native CSS inheritance and
collapsed borders remain browser behavior, not exact rendering guarantees.

The external reusable form adds two native labeled selects, reset/default option
and mixed presentation; only dirty fields participate in Apply. Add RU/EN labels,
main/playground example using a merged table with explicit child overrides and
honest inheritance hints. Test representative mixed/merged update/reset, one-step
history, strict rejection/atomicity, no-op/readonly/composition/stale target,
plugin-free round-trip/clipboard and form dirty-only behavior in three engines.
Run focused cases only, static/build/size and affected docs/archive smoke. Keep
existing size guards; no CI observation, commit or push without user request.
