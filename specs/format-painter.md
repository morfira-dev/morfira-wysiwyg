# Optional format painter

Status: accepted implementation contract, 2026-11-23. Independent
`/plugins/format-painter`; no automatic preset inclusion or runtime dependency.

`formatPainter()` and `formatPainterCommands(editor)` expose `capture(): boolean`,
`apply(): boolean`, `clear(): void` and `getState()`. Capture is observational and
stores a private immutable snapshot of uniform ordinary text formatting: bold,
italic, underline, strike, code, subscript, superscript, color, background,
fontFamily and fontSize. Missing values are explicit resets. Mixed formatting
refuses capture without replacing an existing snapshot. Links, mention IDs,
semantic attributes, headings/lists, layout and arbitrary CSS are never copied.

Source is a caret or selected text inside one ordinary P/H1–H6; target must be a
nonempty text selection inside one ordinary P/H1–H6. Reject semantic owners or
semantic descendants, foreign markup, IMG and structural content. P/H owners may
be inside ordinary lists, quotes or one table cell. Cross-block copying/applying
is deliberately unsupported. Capture does not mutate document/selection/history.

Apply reuses validated editor.format inside one registered atomic transaction.
It replaces the selected inline formatting, preserving links, document structure,
unselected text and current selection direction through existing format commands.
One apply is one Undo. Snapshot remains available until clear or destroy; same
editor external replacement clears it. No cross-editor/global clipboard and no
automatic pointer mutation. Read-only/composition block apply. Capture makes no focus call and refuses during composition. Apply uses the
existing formatting focus path but revalidates exact target points and revision
after focus before starting the transaction; a callback-selected new target refuses.

Separate `/ui/format-painter` provides Copy formatting / Apply formatting / Clear
controls with RU/EN labels, current status, revision-bound selection and per-editor
listener cleanup. Pointerdown targets cannot be overwritten by focus callbacks. A production
app may supply custom UI without loading another module. Focused tests exercise
capture/apply/reset, selected-only changes, HTML/JSON/history, mixed/unsupported
refusal, lifecycle/isolation, read-only and composition in all three engines.
