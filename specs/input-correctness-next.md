# Next input-correctness slices

The optional single-flow rich text drag/drop implementation now follows
[text-drop.md](text-drop.md), with actual focused verification recorded separately.
It supports bounded own-editor move/copy and external inline/plain copy, not
general structural dragging. Core retains its blocked-default drop policy; the
historical audit below describes the baseline before this explicit plugin.

Status: read-only code/test audit and proposed follow-up scope. No runtime behavior is implemented or newly certified by this document. The current ready UI/preset release is separate. Existing contracts remain `block-boundaries.md`, `composition.md`, `lists-toolbar.md`, `plugin-sdk.md` and `transactions.md`.

The subsequent accepted sibling-leaf implementation contract is `input-replacement.md`; semantic heading behavior is specified in `block-boundaries.md`, and clipboard/API insertion over these leaf boundaries follows `paste-replacement.md`. The next bounded list-selection contract is `list-selection.md`, with forward Delete in `lists-toolbar.md`; this newer list code is not yet verified (`verification-backlog.md`). Those contracts supersede the corresponding proposals below. This audit retains the original evidence and unimplemented follow-up scenarios; it is not a current validation report.

This audit read source and test definitions; it did not execute repros, browser tests, real keyboards, benchmarks or network tools. A code path that delegates to the browser is a coverage/normalization gap, not proof that a specific browser produces wrong content. Candidate failures below must first become reproducible behavior tests.

## Current evidence

| Area | Source evidence | Existing test evidence | Remaining boundary |
| --- | --- | --- | --- |
| Ordinary block Enter/Shift+Enter | `core/src/input/block-boundaries.ts` requires both range ends in one eligible p/h1–h6 leaf. Eligible parents are root, blockquote and td/th; list/figure/pre descendants are excluded. | `tests/block-boundaries.spec.ts` covers rich splits, selected text within one heading, heading exit, line breaks, exact next typing/history and beforeinput-only dispatch. | Selection spanning multiple leaves falls through to native input; cross-parent/container replacement is outside this contract. |
| Collapsed Backspace/Delete at ordinary boundaries | The handler joins eligible immediate sibling leaves or consumes deletion against structural/container barriers. Noncollapsed deletion is not claimed by this handler. | Same suite covers Unicode joins, table/figure/list barriers, merged-cell isolation, placeholders and selection through history. | General deletion of a selection spanning multiple blocks or structural nodes lacks an explicit shared normalization contract. |
| List input | `core/src/lists/index.ts` handles Enter/Shift+Enter only within one li; start-of-item Backspace joins/lifts. | List/native suites exercise splits, exits, nesting, joins and inline formatting around list content. | Multi-item replacement, forward boundary deletion and list/non-list selections need separate fixtures and a contract before extending the handler. |
| Plain/rich paste and insertion | `create-editor.ts` sanitizes through the instance schema, then `insertFragment` calls `Range.deleteContents`, handles one block insertion shape and restores a caret. | Existing clipboard/image/formatting suites cover their bounded same-block and table-grid flows. | There is no one documented, normalized cross-container replacement algorithm shared with native typing; arbitrary Word/Docs fidelity is not established. |
| Semantic schema wrappers | Schema v1 markers/attributes round-trip, and inline formatting preserves registered metadata. Input handlers still use native HTML tags and attributes rather than node-specific structural rules. | SDK schema tests cover native typing, inline formats, clipboard and history. | Splitting/exiting a registered heading or other semantic root needs explicit policy; merely copying its marker to a different HTML tag can conflict with schema validation. |
| Composition | `create-editor.ts` tracks one active baseline and a bounded trailing-input window; external replacement/read-only cancellation are explicit. | `tests/composition.spec.ts` uses controlled event/DOM sequences for final ordering, amended text, cancellation, 229, feedback, selection/history and disposal. | These sequences do not certify real candidate windows, dictation, autocorrection or phone keyboards. |
| Autocorrect/dictation/word deletion | Unhandled beforeinput types retain the existing native snapshot/commit fallback. No dedicated `getTargetRanges` policy is used. | Native typing/history coverage exists, but dedicated replacement-target/device behavior is not established by the inspected tests. | Characterize real events/targets first; do not infer actual OS behavior from event-constructor fixtures. |
| Text drag/drop | Core installs a drop listener that always prevents default. | No supported text-move contract was established in this audit. | Text dropping is deliberately unsupported at this boundary; adding it needs ownership, destination and atomicity rules. |
| Selection model | `selection/index.ts` uses DOM paths for bookmarks and UTF-16 text offsets for the public API; line breaks/empty blocks have DOM positions not represented by plain character counts alone. | Formatting, block-boundary and history suites cover backwards/Unicode ranges, empty blocks and line-break joins. | Future structural replacement/drop must preserve real boundaries and direction; text offsets alone cannot distinguish every empty-block position. |

Source paths above are under `packages/`; test names describe existing assertions, not a fresh passing run from this audit.

## Prioritized scenario matrix

P0 means the next bounded input work; P1 follows that contract; P2 needs device evidence or a separate feature decision. Each implemented case needs content, selection, history and unaffected-neighbor assertions in Chromium, Firefox and WebKit.

| Priority | Scenario | Required result or explicit decision |
| --- | --- | --- |
| P0 | Type over a forward/backward range spanning adjacent ordinary p/heading siblings under one parent. | Preserve the left leaf identity/attributes, untouched prefix, right suffix/marks and unrelated siblings; insert literal text at the replacement boundary; one isolated undo restores original document and range. |
| P0 | Backspace/Delete over the same noncollapsed multi-leaf range. | One normalized deletion; prefix/suffix join at an exact caret; an empty result gets one editable placeholder; no browser-specific extra native deletion. |
| P0 | Replace from the first/last text edge, including empty leaves, br, surrogate pairs and combining marks. | Use real DOM boundaries; do not split text units by guessed offsets or lose empty-block identity on undo. Character movement/grapheme segmentation itself is not a new feature in this slice. |
| P0 | Same-parent replacement inside one blockquote or one td/th of a merged table. | Preserve ancestor/cell/table attributes, rowspan/colspan and all other cells; never cross into another container. |
| P0 | Unsupported range crosses a table, image/figure, list, pre, hr, another parent or an independently registered semantic root. | Decide and test the bounded handler's eligibility before mutation. The first slice does not introduce partial structural deletion or claim a general structural-selection model. Existing specialized table/list paths keep ownership. |
| P0 | Enter at the end of, or inside an empty, registered semantic heading. | First reproduce the source-derived marker/tag conflict described below; choose an explicit safe semantic-node policy, then verify no silent metadata loss, half edit or uncaught event error. |
| P0 | Read-only/composition, canceled beforeinput, failed schema validation and external replacement during the new operation path. | Preserve existing guards/rollback. Do not consume already canceled events; do not expose intermediate selection/change notifications or create history for a rejected operation. |
| P1 | Plain-text/rich paste replaces several supported sibling leaves. | Reuse the accepted replacement boundary algorithm where possible; define line-break/multi-block insertion separately; sanitize before live mutation and retain one paste undo. |
| P1 | Multi-item list replacement; list↔paragraph and nested-list boundary deletion. | Specify lift/join/remaining-nested-list behavior first. Preserve unaffected items and reject unsupported partial shapes atomically. |
| P1 | Range begins/ends inside distinct table cells or covers a whole table/figure. | Separate explicit node/range deletion from table-cell clearing. Merged-grid tests must define which cells/structure remain; no implicit conversion through text-only offsets. |
| P1 | Native `insertReplacementText`, word deletion and spelling correction with static target ranges. | Compare actual event target ranges to DOM selection on each engine. Add a narrow supported-target adapter only after evidence; preserve markup and isolated correction history. |
| P2 | Same-editor text move by drag/drop. | Validate source ownership/revision and destination before one atomic move; destination inside the original selection is a no-op; failed insertion must never delete the origin. |
| P2 | External text/HTML drop and cross-editor drop. | External insertion must use the same import boundary. Cross-editor move needs an explicit two-history policy; default browser moves must not silently delete data in another instance. File/image dropping belongs to the image feature contract. |
| P2 | Actual iOS/Android autocorrect, dictation and Japanese/Chinese/Korean IME. | Capture deterministic event order, selection/content outcomes and device/browser versions; validate candidate selection, cancel/confirm, feedback, read-only, undo and next ordinary typing. Keep manual evidence separate from synthetic fixtures. |

## Source-derived semantic-heading candidate

This is a candidate for a repro, not a confirmed executed bug:

1. Register a schema node whose block wrapper is h2 and whose required `data-*` metadata is present.
2. Place the caret at the end of that h2 (and separately in an empty registered h2), then press Enter.
3. The current block handler creates a p for heading exit and copies the heading attributes. The compiled schema requires a known marker's declared tag to match the actual tag.
4. Add a real browser test to establish the resulting event/error/rollback behavior before changing code. An acceptable first policy may classify semantic roots as structural barriers to generic conversion, or preserve the registered wrapper and expose a separate exit command. That decision must be specified; dropping its identity silently is not acceptable.

The ordinary same-parent replacement slice must not accidentally convert semantic wrapper tags while addressing this separate case. Descendant ordinary leaves inside a semantic callout may remain eligible when the ancestor wrapper itself stays untouched.

## Smallest next implementation slice: same-parent leaf replacement

Implement one small input helper, for example `packages/core/src/input/replace-selection.ts`, with any named contracts in feature-owned type files. Do not add a framework, plugin package, global input service, virtual DOM or document-engine rewrite.

### Eligibility

- Active, noncollapsed range entirely inside the editor.
- Endpoints belong to eligible ordinary p/h1–h6 leaves that are distinct direct siblings under the same editor-root, blockquote or td/th parent.
- Every intervening sibling is an eligible ordinary leaf. No structural node or parent boundary is crossed.
- Registered semantic root leaves are excluded until their structural policy is specified; supported inline markers retain their existing non-atomic child-editing contract.
- Initial supported beforeinput types: `insertText` with a string payload and noncollapsed `deleteContentBackward` / `deleteContentForward`. Composition-specific input, paste/drop, word deletion, replacement-target-only events and unknown types are not silently broadened into this path.

### Operation

1. Determine eligibility and retain the real range/direction without changing live DOM. Native keyboard and beforeinput-only entry must call the same decision/operation.
2. Prevent the native event only after the supported path is selected. Execute within the existing synchronous transaction boundary.
3. Preserve the left leaf wrapper and attributes, untouched prefix, right suffix and its inline marks. Remove only covered middle leaves; never serialize/rebuild the full editor merely to replace a local range.
4. Insert payload as text, never as HTML. For deletion, place the caret at the retained prefix/suffix boundary. For insertion, place it immediately after the inserted text with an explicit affinity rule.
5. Leave one placeholder br only when the resulting eligible leaf is empty. Reuse existing validation/history/selection restoration; do not create a second competing undo stack.
6. Treat replacement as an isolated semantic operation rather than merging it into an earlier native typing burst solely because inputType is `insertText`. One undo must restore the selected original content and selection; redo must restore the final caret; following typing must stay at that caret.
7. Preserve existing composition/read-only/canceled-event behavior. Unsupported shapes keep their previously documented path in this slice; broader structural rejection/normalization requires a separate explicit contract.

### Concrete starting fixture

Input HTML:

```html
<p>Alpha <strong>one</strong></p><h2><em>Beta</em> tail</h2><p>Keep</p>
```

Use a DOM Range beginning in the first p's plain text immediately after `Alpha ` and ending after `Be` inside the h2's em text. Replace with `X`. Proposed result:

```html
<p>Alpha X<em>ta</em> tail</p><p>Keep</p>
```

The inserted X inherits the starting plain-text position, not the removed strong or the right-hand em. Assert a collapsed caret directly after X, unchanged Keep node/content, exactly one change/undo revision, backwards-range restoration, exact undo/redo and actual next typing. Repeat with deletion, br endpoints, empty siblings, block attributes and the same leaves inside a merged td and blockquote. Use node-level boundaries rather than constructing the selection only from concatenated text offsets.

### Proposed acceptance files and evidence

- `tests/input-replacement.spec.ts`: forward/backward real keyboard replacement/deletion, beforeinput-only dispatch, exact caret/history, Unicode/empty/br edges and unaffected neighbors.
- Extend block-boundary/SDK regression tests for registered-heading policy once reproduced and specified.
- Keep existing list/table/image/composition suites passing; do not replace behavior checks with source-text assertions.
- Verify the operation using plain core and a ready preset; exercise controlled feedback in at least React StrictMode plus the existing adapter-consumer matrix.
- Update RU/EN input/API limitations and actual supported cases. Device/IME claims require device evidence, not this test file.

## Weight and performance expectations

No new runtime dependency, CSS or eagerly loaded optional subsystem is expected. A few local DOM helpers should have a small core delta; an initial engineering expectation is no more than roughly 3000–5000 additional minified JS bytes, not an enforced guard or a measured result. Publish actual raw/gzip/Brotli deltas for core, minimal/standard selected closures and any affected chunk after implementation. Existing enforced limits and the 80000-byte working core target remain unchanged.

The helper should visit the affected sibling range rather than all blocks for its own work. Existing normalization/snapshot costs may still scale with the full document, so this local algorithm does not establish end-to-end constant-time input. Use the explicit observational benchmark contract only if the change is presented as a performance optimization; do not time browsers while builds/tests run concurrently.
