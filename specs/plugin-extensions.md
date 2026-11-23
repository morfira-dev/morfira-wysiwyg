# Optional plugin SDK: semantic nodes, external node views, atoms and decorations

Status: accepted bounded implementation contract, 2026-11-23. Runtime evidence is
recorded separately. Public entry: `@morfira-dev/wysiwyg/sdk`; no runtime dependency,
core UI import, schema-version change or automatic preset inclusion.

## Safe application-owned semantic nodes

`nodeExtension(spec, { atomic? })` returns an EditorPlugin whose declarative schema
uses existing safe schema-v1 wrappers. `nodeCommands(editor, name)` exposes insert,
update and remove for that registered type. Commands accept literal text and
validated attributes, reconstruct through the instance codec before mutation and
use existing transaction/read-only/composition/history guards. No arbitrary HTML
tag, foreign namespace, executable attribute, content callback or unchecked style
is accepted. Plugin configuration and executable callbacks are trusted app code.

Atomic definitions are inline span nodes with bounded, nonempty, single-line,
text-only content. Runtime contenteditable=false is derived presentation, excluded
from HTML/JSON. Owned false/removal annotations use the narrow schema-validated
editor.positions.setPresentation projection so mapped text coordinates survive
reconstructed atoms after mapped undo/redo. Unaccounted DOM attribute changes
still invalidate observations. Pointer/native partial selection expands to whole tokens; horizontal
navigation and Backspace/Delete treat a token as a unit in one ordinary text flow.
Copy/cut serialize expanded safe HTML plus plain text; paste of a same-flow slice
retains registered attributes. Cross-flow/structural atom-touching edits refuse
before mutation; table rectangular and file clipboard owners retain priority.
Mixed-bidi visual movement and arbitrary structural atom composition are not
claimed. Undo/redo and external synchronization rederive presentation.

## External node views

`createNodeViews(host, editor, { name, create })` owns view elements outside the
persisted surface. create receives a semantic target context; its returned
`element`, optional `update` and `destroy` form one lifecycle. Actual target identity
keys views. Editor change notifications and explicit refresh update contexts; removed targets destroy
only their owned views. Every listener/observer/view is per editor and disposed
on destroy. Hosts inside the surface reject. Callback errors clean up partial
setup and propagate, without inserting callback DOM into the document.

This is an external node-view host/inspector contract. There is no editable
contentDOM, arbitrary in-document renderer, persisted callback output, widget
selection engine or schema bypass. Context geometry is observational and may
be absent for disconnected targets; app layout remains application-owned.

## Nonpersisted decorations

`createDecorations(editor, { name })` owns one explicitly named native CSS
Highlight registry entry. set replaces bounded text ranges; tracked UTF-16 endpoints
use editor.positions mappings through supported explicitly declared transactions.
Unknown edits/replacement expire targets, which are removed rather than retargeted.
The selected name must be safe, non-reserved and unused; collisions refuse, cleanup
removes only the still-owned entry, never clears a shared registry. Feature detection
reports unsupported without injecting document wrappers. Styles are application
CSS `::highlight(name)`; importing SDK loads no CSS or UI. Decorations cannot
change exported HTML/JSON, selection or history. No layout-overlay fallback or
universal structural mapping claim is made.

## Acceptance

Focused Chromium/Firefox/WebKit cases exercise safe metadata roundtrip and malformed
commands, per-editor isolation, atom navigation/deletion/clipboard and undo,
read-only/composition, view create/update/destroy and unmount, callback errors,
native highlight ownership, supported transaction mapping and expiry after unknown
edits. Add public type/real-archive smoke and measure selected import closures.


## Additive in-editor overlay views — 2026-11-23

The independent createInlineNodeViews contract follows inline-node-views.md. It
places nonpersisted visual output inside the editor box and outside the persisted
surface, preserving the existing external createNodeViews API. Neither API is
editable contentDOM. Path-aware explicit structural plans are separately scoped
by structural-mapping.md; do not infer automatic mapping for native edits.


## Terminal atom typing — 2026-11-23

A collapsed native caret after an owned atomic span at the exact end of an
ordinary inline flow accepts one printable key through the shared core
`editor.insertTextAtCaret` command. This handles the observed WebKit case where
keydown occurs but the browser produces no beforeinput/input at a terminal
contenteditable=false boundary. The command retains pending formatting and
ordinary insertText history; the atom's semantic identity, text and metadata survive.
Formatting may reconstruct actual DOM spans under the existing formatter contract;
node views keyed by actual node identity then dispose/recreate normally. Plain
controlled-value acknowledgement retains existing actual nodes when no formatting
operation rebuilds them.

The SDK claims only that concrete terminal gap, including ordinary inline
formatting ancestors ending at the same flow edge. Existing following text, BR,
semantic/structural branches, noncollapsed ranges, modifier shortcuts, Dead/Process
keys and composition remain with their previous owners. A printable key contains
one Unicode codepoint and no control/line-separator character. This is not IME
normalization, a keyboard layout engine, a sentinel/filler or a synthetic input
commit. Cancel the owned native key once to prevent duplicate insertion in other
browsers. The shared core command revalidates selection, pending formats,
read-only/composition and synchronous focus callbacks. Failed revalidation leaves
the edit unapplied rather than typing into a new application-selected target.

Local atom composition state is cleared only on compositionend or confirmed core
cancellation: changed external API content or readonly activation. An unrelated
readonly=false transition cannot end an active composition. Focused regressions
cover native terminal typing, pending marks/styles, semantic atom identity, grouped Undo
and cancellation followed by restored keyboard behavior in three engines.
