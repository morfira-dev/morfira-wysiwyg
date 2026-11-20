# Optional document outline UI

Public `/ui/outline` exports createOutlineUI(host, editor, options?),
outlineUIMessages and OutlineUIOptions/OutlineUIController/OutlineUIMessageKey.
Explicit `/ui/outline.css`; no core/preset dependency or persisted IDs/metadata.
Controller: readonly element, refresh():void, idempotent destroy(); refresh after
disposal throws. Options copied/validated: label?: literal <=160 without controls,
maxHeadings?: integer 1..500 (default100), onError?: (error:unknown)=>void.
Require an empty connected external HTML host in the editor's document.

Render ordinary HTML h1..h6 in actual document order, including supported nested
list/quote/cell headings. Exclude protected semantic ancestors and semantic
headings, pre/code/figure/figcaption. This is an observational view over existing
DOM, not a mapped-position/node-view SDK or arbitrary document normalization.
Use literal text labels bounded to 300 code units with an ellipsis when needed;
empty headings use localized Untitled heading. Never copy markup/IDs or inject
heading anchors into persisted content. Native labeled navigation/list/buttons
show level and support Tab/Enter/Space; no pretend ARIA tree widget. Show localized
empty/truncated status when the bounded entry limit is reached.

Initial/explicit refresh and committed changes rebuild the bounded view; coalesce
changes in one animation frame, including API replacement and history. Do not
capture full document JSON on every keystroke. Locale updates refresh labels.
Selection events may update aria-current only for a retained eligible actual
heading containing the caret (no document mutation); whole-document and range
selection outside one heading do not claim an active heading.

Navigation owns a concrete heading node and current view generation, not an index
or string match. Before and after editor.focus() revalidate lifetime, same-document
connected ownership, generation, eligibility and unchanged heading containment.
Focus/application callbacks may replace/edit the document or destroy modules;
stale buttons must never redirect selection to new content. Set an actual native
collapsed Range at that heading's start only after validation. Scroll that actual
heading into view with no smooth animation, revalidating around trusted calls.
Readonly allows navigation. Preserve document/history/pending formatting; navigation
changes focus/Selection and viewport intentionally. No transactions/change events.

Per-instance listeners, queued frames, actual-node references and ownership
observers are released on destroy/editor destruction; detached/adopted hosts do
not navigate. Observer scope is removal paths only, not the document subtree.
Application error callbacks cannot resurrect destroyed UI; report generic localized
status without arbitrary error text. Retained disposed controls stay inert.

Acceptance: representative levels/nested/empty/literal labels, max/truncation,
API/history/live coalescing, exact navigation/readonly/no mutations, focus-time
replacement and stale controls, locale/instance/disposal/SSR. Three-browser focused
regressions plus RU/EN guides/demo. Standalone public closure <=10000 gzip JS;
CSS <=3000 raw bytes. Standard-outline-ready and combined standard-reading-ready
(print+outline) keep 80000 gzip JS/20000 raw CSS. No new dependencies, full local
suites, GitHub monitoring or implicit Git writes.
