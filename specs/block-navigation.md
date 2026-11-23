# Optional root block navigation

Status: accepted implementation contract, 2026-11-23. Public behavior entry
`/plugins/block-navigation`; no runtime dependency, CSS, schema change or automatic
preset inclusion. Runtime validation is recorded separately.

## Supported owners and positions

`blockNavigation()` adds native keyboard navigation for direct editor-root HR,
IMG, ordinary image FIGURE (one image plus optional ordinary figcaption) and
schema-registered text-only semantic FIGURE, including media placeholders.
Semantic figures are checked by the current instance's inert schema roundtrip.
Tables, nested containers, complex figures, unknown/foreign nodes, inline atoms
and registered editable paragraphs remain owned by existing editing modules.
An ordinary root paragraph/heading endpoint must contain only supported inline
content and no semantic/atomic owner. Root positions are exact child-index gaps;
objects use a native Range selecting exactly one actual root child. No persisted
cursor marker, contenteditable override or global registry is introduced.

## Keyboard and commands

At an ordinary leaf's exact start/end, unmodified horizontal arrows select an
adjacent supported object. From a selected object, Left/Up and Right/Down collapse
before/after it. At a root gap, arrows select the adjacent object or enter an
adjacent ordinary paragraph/heading. Shift/modifier shortcuts and unrelated
selections retain their existing owners. Arrows change selection only, not history.

Backspace/Delete at a leaf edge or root gap first select an adjacent supported
object without deleting it. A subsequent Backspace/Delete on its exact node
selection removes only that object in one transaction; neighbouring actual nodes
remain intact. Enter on a selected object inserts a new paragraph after it;
Shift+Enter inserts before it. Enter at a root gap inserts an ordinary paragraph.
Typing literal text at a supported gap creates a paragraph there; typing over an
exact object selection replaces that object with one paragraph. The resulting
caret is in the new paragraph, and each mutation is one undoable edit. Existing
unselected siblings, including the core-provided trailing editable paragraph after
a figure, are preserved rather than removed as part of replacement. An empty
root after removal receives one editable placeholder paragraph.

`blockNavigationCommands(editor)` provides observational `getSelected()`, guarded
`select(target)` and `insertParagraph(side?)` for application-owned controls.
Commands return false on stale/foreign targets, read-only, composition or disposal.
Paragraph insertion owns and releases a revision-bound selection handle, including
root child-index gaps, so same-markup DOM recreation during focus cannot redirect
a draft. Deletion rechecks the actual selected node and computes its current index
inside the transaction, after focus. Composition remains blocked until compositionend
or a confirmed core cancellation (changed external value or read-only activation).
Selection capture is not command authority. Commands and listeners re-read the
actual selection/target rather than retaining a previously selected node.

Only cancelable non-canceled owned events are handled. Composition blocks plugin
handling; read-only blocks all plugin user actions while external synchronization
remains possible. Native paste, drop, arbitrary structural ranges and real OS IME
are outside this profile. Cleanup removes every listener and the per-editor API.

## Acceptance

Representative Chromium/Firefox/WebKit cases cover two-step deletion, gap typing,
adjacent objects, first/last root edges, Enter and Shift+Enter, exact undo/redo and
subsequent typing, ordinary image captions, registered media, semantic rejection,
foreign/complex/table/list barriers, canceled events, read-only/composition,
instance isolation and disposal. Navigation must never create a history revision.
RU/EN documentation and a live example describe the explicit opt-in and limits.

Focus-time reentrancy regressions use an explicit synchronous application hook
around the native surface focus method, with the real native Selection kept valid.
They verify stale-intent guards in all engines; they do not claim identical native
blur/focus event or selection-retention behavior across browser platforms.
