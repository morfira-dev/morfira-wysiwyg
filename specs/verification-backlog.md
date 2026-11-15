# Verification record — editor, security and autolink input completion

Status: the bounded autolink Enter/plain-URL clipboard slice, typed core input receipts and inline-normalization/caret correction completed project, full editor, documentation and packed-consumer verification successfully. Earlier checklist/security baseline `ddc5aaf` and diagnostic runs remain historical evidence. No push, package publication or deployment is authorized by this record.

## Current autolink input-completion verification — completed

The working tree adds controlled collapsed-caret Enter completion, one plain-text URL from an actual clipboard event, and core-owned readonly `inputcommit` receipts. Shift+Enter, native-only paragraph edits, HTML/whitespace/multiline clipboard payloads, selected replacement and API insertion remain excluded. Conversion is a separate history operation with no preview/network requests or core import of autolink. Exact caret/history restoration includes the Redo regression described below. Contracts: `autolink.md`, `events.md`.

| Check | Actual current status |
| --- | --- |
| Full project build, declarations, package boundaries, tree-shaking, budgets and types | Passed in the final `pnpm run check`, exit 0 |
| Complete editor suite, Chromium / Firefox / WebKit | Passed: final `pnpm run check`, exit 0; **3507/3507 browser executions = 1169 cases × 3 engines**, 12.5 minutes; baseline 1154 cases plus 15 new receipt/autolink definitions. The first 3504-execution run was intentionally interrupted by the parent with exit 130 for the additional inline-normalization/caret correction; it was not a pass |
| RU/EN documentation build and Chromium suite | Passed after the inline-normalization/caret correction: final docs build and **159/159** Chromium scenarios, exit 0, 1.9 minutes |
| Packed consumers | Passed against final current tarballs: **18/18**, including 15 default-wrapper and 3 Angular 22 browser scenarios |
| Focused receipt/autolink verification | After the inline-normalization/caret fix, **237/237** executions across seven focused specs passed, 58.1 seconds. Earlier source separately passed 72/72; these are targeted historical results separate from the final full run |
| Bundle measurements | Fresh post-fix build-generated measurements are recorded below; preceding autolink and security-baseline measurements remain historical evidence |

An initial focused run recorded **69/72**: three pending-format expectations were corrected to compare the actual preceding state rather than assume it was empty. Subsequent diagnosis exposed a real Redo caret defect: restoring a post-paste point could leave subsequent typing inside the generated anchor. Caret normalization was corrected; the final focused 72/72 run passed. These diagnostic and targeted results are historical; the final complete run above establishes the current success. No large-document scans, preview fetches or new runtime dependencies are introduced; core receipt/typing-guard size overhead is measured in the current table below.

A subsequent isolated probe (`/tmp/morfira-autolink-undo-probe.ts`) demonstrated a generic core plain-text-paste Redo offset error even with autolink disabled, plus an enabled-autolink first-Undo offset error. This is an actual editing defect, not an incorrect pending-format expectation. The accepted fix normalizes local block inline text before fallback bookmark restoration; paste completion now restores the point in the actual text node following the anchor, including the terminal-punctuation offset. One additional terminal-punctuation regression brings the new total to 1169 cases. The corrected isolated probe now reports the expected offset **26** for disabled-autolink Redo, enabled-autolink first Undo and enabled-autolink Redo. The post-fix seven-spec run passed **237/237**, 58.1 seconds. Final full, documentation and packed-consumer reruns after these corrections passed as recorded above.

## Current generated measurements — after inline-normalization/caret correction

Read from fresh `size-report.json` after the correction. Minified JavaScript, gzip, Brotli and CSS are reported separately; shared profile chunks are counted once, excluding framework runtimes, maps and declarations. Autolink has no CSS. These are size measurements, separate from the full-suite results above and not performance evidence.

| Entry / selected profile | JS bytes | gzip bytes | Brotli bytes | Raw CSS bytes |
| --- | ---: | ---: | ---: | ---: |
| Core entry | 87218 | 26810 | 23498 | 3138 |
| Optional autolink entry | 6786 | 2992 | 2675 | 0 |
| Minimal headless | 83697 | 25305 | 22146 | 3138 |
| Minimal with ready UI | 101932 | 30696 | 26833 | 7187 |
| Standard headless | 136721 | 41666 | 36136 | 4951 |
| Standard with ready UI | 191942 | 55691 | 47651 | 10506 |
| Extended headless | 149245 | 45607 | 39249 | 4951 |
| Extended with ready UI | 213105 | 62202 | 52766 | 11702 |

Current core is **87218 raw minified bytes**, **7218 bytes above** the working 80000-byte target, with the enforced 200000-byte guard unchanged. Against security baseline `ddc5aaf`, core increased by **810 raw bytes**. Optional autolink is **6786 / 2992 / 2675** raw/gzip/Brotli bytes. CSS remains unchanged. Earlier measurements below are retained for provenance.

## Historical autolink measurements — before inline-normalization/caret correction

Read from the preceding autolink build-generated `size-report.json`, before the additional inline-normalization/caret correction; current weights await a fresh build. Raw JavaScript is minified; gzip/Brotli are separate. Selected profile closures count shared chunks once and exclude framework runtimes, declarations and source maps. CSS remains unchanged; the standalone autolink entry needs no CSS. These are bundle measurements, not performance benchmarks or a full-suite pass.

| Entry / selected profile | JS bytes | gzip bytes | Brotli bytes | Raw CSS bytes |
| --- | ---: | ---: | ---: | ---: |
| Core entry | 87182 | 26801 | 23494 | 3138 |
| Optional autolink entry | 6711 | 2944 | 2641 | 0 |
| Minimal headless | 83661 | 25294 | 22158 | 3138 |
| Minimal with ready UI | 101896 | 30686 | 26824 | 7187 |
| Standard headless | 136610 | 41628 | 36071 | 4951 |
| Standard with ready UI | 191831 | 55650 | 47600 | 10506 |
| Extended headless | 149134 | 45562 | 39223 | 4951 |
| Extended with ready UI | 212994 | 62147 | 52759 | 11702 |

This preceding core was **87182 raw minified bytes**, **7182 bytes above** the working 80000-byte target; the enforced 200000-byte guard remains unchanged. Relative to security baseline `ddc5aaf`, core increased by **774 raw bytes** (86408 → 87182). Optional autolink is **6711 / 2944 / 2641** raw/gzip/Brotli bytes; standard and extended ready profile totals must not be obtained by adding standalone entries. The historical baseline table below remains intact.

## Completed checklist and security baseline — `ddc5aaf`

Baseline `ddc5aaf` follows test consolidation `c97ff95` and adds optional checklists, generic non-owning schema attributes/split policy, exports, live documentation and security hardening. Security changes bound normalized serialized output, prevent resource fetches during string serialization, cancel image uploads on composition and reject image/search form hosts inside editable content. Static/build gates and final full-suite results passed; earlier diagnostic findings remain separately identified below.

| Check | Recorded `ddc5aaf` status |
| --- | --- |
| Project contracts, package/declaration builds, public-package boundaries, tree-shaking, size budgets and TypeScript/Vue/Svelte checks | Passed for baseline `ddc5aaf` |
| Complete editor suite, Chromium / Firefox / WebKit | Passed: final `pnpm run check`, exit 0; **3462/3462 browser executions = 1154 registered cases × 3 engines**, 12.2 minutes. The earlier checklist-only full run was interrupted by the parent with exit 130 to apply security corrections; it was not a pass |
| RU/EN documentation build and complete Chromium suite | Passed: final `pnpm run docs:build` and **157/157** Chromium scenarios, 2.0 minutes, exit 0. The prior 155-case run recorded **154 passes and one fixture timing failure**; the slash-history fixture was corrected to use single real keys H/C |
| Packed consumers against `ddc5aaf` security tarballs | **18/18 passed**: 15 default-wrapper browser scenarios plus 3 Angular 22 scenarios |
| Release automation | Earlier **10/10** passed for `0f2face`; release automation is unchanged, but this is not a new security-run claim |
| Focused security/image/form diagnostic | **201 executions: 200 passed, one WebKit text-chunk expectation failed**. The full text was intact across 77 chunks; only the test expectation was corrected. A subsequent security-codec rerun passed **15/15**, 9.4 seconds |

The editor total is **1191 baseline cases − 58 consolidated cases + 14 checklist cases + 5 security cases + 2 image/form cases = 1154 cases**. Checklists added 42 browser executions; security and image/form cases add another 21. A browser execution is not a distinct user scenario. Documentation is **153 baseline + 2 checklist integration + 2 security-guide scenarios = 157**. The final full-run results above, rather than targeted diagnostics, establish completion for this source.

The slash fixture failure was timing-dependent: multi-character typing exceeded the 600 ms history grouping window, so two Undo clicks could leave an empty heading. Single-key H/C fixtures still verify command history and subsequent real input without relying on typing duration. This was not evidence of an ambiguous checklist selector or editor mutation defect.

The checklist read-only diagnostic also corrected a test expectation: core external `setHTML` synchronization emits an API-origin change (`source: 'api'`); adapters suppress controlled-value feedback separately. Read-only does not promise a silent core `setHTML`. These expectation corrections are distinct from the actual codec, resource-fetch and keyboard defects recorded in this document and `security.md`.

## Completed baseline — `0f2face`

These are historical successful results for the completed list/quote/editor slice before test consolidation and optional checklists. They must not be described as a full green result for the current checklist/security source or merely as a working tree “based on cabb619”.

| Check | Recorded baseline result |
| --- | --- |
| Project contracts, package/declaration build, archive boundaries, tree-shaking, budgets and TypeScript/Vue/Svelte checks | Passed |
| Complete editor suite, Chromium / Firefox / WebKit | Passed: `pnpm run check --workers=7`, exit 0; **3573 browser executions = 1191 cases × 3 engines**, 14.6 minutes. An earlier full run recorded 3516 passes and 15 WebKit failures; the bounded key-protocol fix and cancellation regressions passed in this final baseline run |
| RU/EN documentation build | Passed: `pnpm run docs:build` |
| Complete documentation suite, Chromium | Passed: **153/153**, `pnpm run test:docs --workers=1`; includes 390px RU and 1280px EN inner-quote scenarios |
| Release automation | Passed: **10/10**, `pnpm run test:release`; isolated local fixture remotes only |
| Packed consumers, Vue / React / Svelte / Angular 21 / Web Component | Passed: **15** production-browser scenarios across three engines, `pnpm run consumers:check` |
| Packed Angular 22 consumer | Passed: **3** production-browser scenarios across three engines, `pnpm run consumers:angular22` with Node 24.16.0 |

The baseline used Node 22.22.2 and pnpm 11.0.7 for ordinary workspace runs; Angular 22 used the isolated supported Node toolchain. Consumers installed the actual eight tarballs offline without workspace source aliases. No tests were removed during that baseline verification; the later consolidation is recorded separately. These results do not certify real OS/mobile IME, complete accessibility, arbitrary Office HTML fidelity or performance capacity. Documentation browser tests use Chromium only.

## Test consolidation — `c97ff95`

The separately committed cleanup reduced repeated Cartesian core-paste combinations by **58 registered editor cases**, or **174 browser executions** across the three engines: **1191 → 1133 cases**, **3573 → 3399 executions** before the new checklist cases. The focused affected-contract run passed **435 browser executions**. This is targeted consolidation evidence, not a replacement for the subsequent complete checklist run. Unique boundary, node-identity, rollback, history and browser regressions remain the priority over raw test count.

## Historical diagnostic findings and fixes

Diagnostic runs exposed a real codec defect: valid `ol.start` was removed on import. The additive, bounded attribute contract and regression tests are now in `document-attributes.md` and `tests/list-attributes.spec.ts`. Other fixes corrected test contracts: literal text checks use `textContent` rather than browser-dependent `innerText` block separators; expected styles use canonical serialized spacing; an expanded-range Undo does not revive an override from an earlier caret; ordinary key-input scenarios use real key events. In the measured Firefox automation diagnostic, `keyboard.insertText` produced noncancelable composition input, while `keyboard.type` produced ordinary cancelable `insertText`. Composition-specific and explicit synthetic-input scenarios retain their own protocols. Assertions about content, selection, formatting, history and node identity remain in place.

A complete run then exposed two WebKit key-protocol differences: first-body Backspace could omit `beforeinput`, and Shift+Enter could report `insertParagraph`. Owned list keys now dispatch one normalized, cancelable `beforeinput` through the existing mutation pipeline; capture cancellation, composition/read-only/modifier guards, selection and one-operation history have dedicated regressions in `tests/list-keyboard-protocol.spec.ts`. The synthetic event has `isTrusted === false`, as documented in `lists-toolbar.md`. A focused cancellation/boundary rerun passed 120 scenarios across all three engines. The final baseline run passed and is the authority for the `0f2face` baseline status, not for the later checklist source.

Initial diagnostic runs were stopped after identifying these shared causes; they are not counted as successful complete runs. The completed `0f2face` baseline editor and documentation results were recorded from exit status 0.

## Recorded bundle measurements — security baseline `ddc5aaf`

Read from the security-baseline build-generated `size-report.json`; these measurements predate the current autolink extension. JavaScript is minified; raw, gzip and Brotli are separate. CSS is measured separately. Selected profiles count their shared closure once and exclude framework runtimes, declarations and source maps. This is bundle evidence, not an input-latency or memory benchmark. Do not add standalone entries to profile totals and assume shared code is counted correctly.

| Entry / selected profile | JS bytes | gzip bytes | Brotli bytes | Raw CSS bytes |
| --- | ---: | ---: | ---: | ---: |
| Core entry | 86408 | 26551 | 23275 | 3138 |
| Optional checklists entry | 2709 | 1159 | 995 | 436 |
| Minimal headless | 82885 | 25029 | 21922 | 3138 |
| Minimal with ready UI | 101118 | 30427 | 26589 | 7187 |
| Standard headless | 132476 | 40391 | 35066 | 4951 |
| Standard with ready UI | 187681 | 54399 | 46611 | 10506 |
| Extended headless | 144996 | 44303 | 38215 | 4951 |
| Extended with ready UI | 208838 | 60856 | 51734 | 11702 |

| CSS entry | Raw bytes | gzip bytes | Brotli bytes |
| --- | ---: | ---: | ---: |
| Core | 3138 | 1123 | 923 |
| Optional checklists | 436 | 240 | 187 |
| Standard with ready UI | 10506 | 3565 | 2883 |
| Extended with ready UI | 11702 | 4057 | 3259 |

All enforced bundle budgets passed for this baseline. Its full core entry is **86408 raw minified bytes**, **6408 bytes above** the working 80000-byte target; the enforced 200000-byte guard remains unchanged. The earlier `0f2face` core was 83983 / 25779 / 22577 raw/gzip/Brotli bytes, so schema-attribute support and subsequent security bounds have a measurable core cost. Standalone checklist behavior is 2709 / 1159 / 995 JS bytes, with 436 / 240 / 187 CSS bytes.

Standard/extended preset defaults do **not** include the new checklist plugin or its stylesheet. Their measured profiles above retain those defaults; the full documentation demo explicitly adds checklists. No dedicated combined ready-UI-plus-checklists profile is implied by adding standalone totals. The older `cbfb30d` table below remains a historical paste baseline, not a current measurement.

## Current bounded work

- Selection replacement across ordinary direct-inline or p/h1–h6-body-sequence sibling list items under one ul/ol, and between distinct supported bodies of one item: typing, selected Backspace/Delete, and inline/single-ordinary-p API or clipboard insertion.
- Forward Delete at an ordinary item's own-content end: join the next sibling within the same list, preserving branches and metadata; stop at unsupported/container boundaries.
- Selection direction, exact caret/history, read-only/composition/cancellation, external synchronization and React StrictMode acceptance scenarios.
- Pending caret-formatting state across native/API replacements, failed operations and undo/redo. At the initial deferral checkpoint, the regression definitions were source-review candidates rather than executed reproductions.
- Wrapped/direct body combinations, first-wrapper tag/alignment and inline semantic metadata, unselected branch identity outside the wrapper, item-level endpoint normalization and exact undo boundaries.
- Wrapped Enter/Shift+Enter and the explicit empty/semantic/complex-body limits described in `lists-toolbar.md`.
- Multiple ordinary paragraph/heading bodies per item: same-item cross-body replacement, preserved outside bodies, splitting with subsequent bodies, and bounded internal Delete/Backspace joins. Semantic bodies, mixed direct text/block shapes and arbitrary structural payloads remain unsupported.
- First-body Backspace in a supported multi-body item: merge into the previous sibling, unwrap a first root item into actual bodies/branches, or lift a first nested item with trailing siblings. Includes lifting from nonfinal owner branches with unchanged earlier branches, actual later branch moves in content order, guarded semantic/malformed/container cases, exact caret/history and controlled feedback.
- RU/EN API, list guide, roadmap and local homepage/playground examples, including single-body and multiple-body paragraph/heading modes and backward same-item selection controls.

The accepted source/payload boundaries are specified in `list-selection.md` and the forward-Delete addendum in `lists-toolbar.md`. Existing ordinary-block insertion remains under `paste-replacement.md`. Validation claims follow the recorded executed results; accepting a behavior contract alone does not establish a passing run.

## Historical deferred acceptance checklist

The following acceptance groups were collected while execution was deferred. Their historical status is retained separately from the current verification results; they are not a claim that the latest checks remain unexecuted.

The inside-quote block-paste extension additionally requires `tests/list-inside-quote-paste.spec.ts`, `tests/list-inside-quote-paste-react.spec.ts` and `tests/docs/list-inside-quote-paste.spec.ts`. Exercise API/clipboard carets and same-quote child-body ranges, inline-quote promotion, actual quote identity/attributes, untouched inner/outer bodies and branches, real child-node offsets with whitespace, placeholders, pending-format history, guarded cross-level quote endpoints/nested payloads/semantic or unsupported sources, merged-cell isolation and controlled feedback. Exercise the RU/EN inside-quote sample, caret/range buttons, multi-block/heading controls and read-only state. At the earlier deferral checkpoint these definitions had not been executed; use the current verification record for actual results.

The repeated-quote block-paste extension additionally requires `tests/list-quote-repeat-paste.spec.ts`, `tests/list-quote-repeat-paste-react.spec.ts` and `tests/docs/list-quote-repeat-paste.spec.ts`. Exercise actual quote identity before/after insertion, multiple quotes, quote→heading→multi-block sequences without reload, surrounding bodies/branches, exact caret and isolated undo/redo, guarded cross-level crossings and semantic/malformed source quotes, native/inline path isolation and controlled feedback. Same-quote endpoint acceptance follows the inside-quote extension above. Exercise RU/EN repeated-insertion sample, before/after caret controls and read-only behavior. At the earlier deferral checkpoint these definitions had not been executed; use the current verification record for actual results.

The single-quote list extension additionally requires `tests/list-quote-paste.spec.ts`, `tests/list-quote-paste-react.spec.ts` and `tests/docs/list-quote-paste.spec.ts`. Cover inline and ordinary-body quotes, wrapper/child attributes, placeholders, collapsed and selected-range insertion, prefix/quote/suffix order, suffix-start caret, surrounding body/branch identity, guarded semantic/mixed/nested quote candidates, pending formatting and exact history. Exercise RU/EN Quote HTML controls and ordinary suffix typing/Undo, alongside the repeated-insertion extension above. Execution was deferred when these acceptance definitions were collected; actual results belong to the current verification record.

The single-heading list extension additionally requires `tests/list-single-heading-paste.spec.ts`, `tests/list-single-heading-paste-react.spec.ts` and `tests/docs/list-single-heading-paste.spec.ts`. Cover the incoming heading's own tag/attributes, separate retained prefix and suffix bodies, editable empty edges, suffix-start caret, same-body/cross-body/sibling-item API and clipboard routes, collapsed positions, pending-format history, guarded semantic or malformed candidates, actual neighboring body/branch identity and React StrictMode. Exercise the RU/EN Single heading HTML controls with both caret and selected-range examples. Execution was deferred when these acceptance definitions were collected; actual results belong to the current verification record.

The multi-block list-paste extension also requires `tests/list-block-paste.spec.ts`, `tests/list-block-paste-react.spec.ts` and `tests/docs/list-block-paste.spec.ts`. Cover same-body, same-item and sibling-item API/clipboard replacement; retained first-body formatting, incoming middle/final tags, suffix caret, direct-inline promotion, unselected body/branch identity, empty payload bodies, guards and unsupported payload refusals. No execution or bundle result was recorded at the earlier deferral checkpoint; use the current verification record.

The collapsed-caret extension additionally requires `tests/list-caret-block-paste.spec.ts`, `tests/list-caret-block-paste-react.spec.ts` and `tests/docs/list-caret-block-paste.spec.ts`. Cover start/middle/end positions in direct and wrapped bodies, item-level boundary normalization, source placeholders, preserved surrounding bodies/branches, prefix/suffix affinity, invalid multi-root preflight, caret-formatting reset inside the transaction and exact undo restoration. The RU/EN demo's position selector and caret button must be exercised alongside existing selected-range examples and read-only controls. Execution was deferred when these scenarios were collected; actual results belong to the current verification record.

1. Read the final source diff and specifications before selecting the checks; preserve unrelated work.
2. Build packages and run focused list behavior tests in Chromium, Firefox and WebKit: `tests/list-selection.spec.ts`, `tests/list-selection-guards.spec.ts`, `tests/list-selection-react.spec.ts`, `tests/list-forward-delete.spec.ts` and `tests/caret-replacement-state.spec.ts`, plus `tests/list-wrapped-selection.spec.ts`, `tests/list-wrapped-input.spec.ts`, `tests/list-wrapped-guards.spec.ts`, `tests/list-wrapped-react.spec.ts`, `tests/list-multiblock-selection.spec.ts`, `tests/list-multiblock-input.spec.ts`, `tests/list-first-body-backspace.spec.ts`, `tests/list-first-body-backspace-react.spec.ts`, `tests/list-nonfinal-branch-backspace.spec.ts` and `tests/list-nonfinal-branch-backspace-react.spec.ts`, together with the existing list, native input, composition, transaction and paste suites relevant to shared helpers.
3. Run `pnpm run check --workers=2` for project contracts, declarations, package boundaries, selective-import/tree-shaking checks, type checks, budgets and the complete browser suite. Avoid concurrent package builds while browser tests consume their output.
4. Run `pnpm run docs:build` and `pnpm run test:docs --workers=2` for both language versions and the new examples, including `tests/docs/list-selection.spec.ts`, `tests/docs/list-wrapped.spec.ts`, `tests/docs/list-multiblock.spec.ts` and `tests/docs/list-first-body-backspace.spec.ts` and `tests/docs/list-nonfinal-branch-backspace.spec.ts`. Inspect the actual new demo controls and a narrow viewport; a successful build alone is not browser proof.
5. Run `pnpm run consumers:check` on actual tarball packages. Run `pnpm run consumers:angular22` with a supported Node version and the isolated Angular 22 toolchain. Keep heavy browser/consumer jobs separate if the host is under load.
6. Compare raw minified JS, gzip, Brotli and CSS with the baseline below; update `size-report.json` only through the build tooling. Count shared code once for selected profiles and exclude framework runtimes, declarations and source maps.
7. Record actual failures, retries, remaining limitations and the source revision tested. Remove the new list slice's unverified status only after the required results exist.

## Last measured baseline, not current list sizes

The committed `size-report.json` at `cbfb30d` belongs to the preceding paste implementation. It is retained as a historical baseline and does **not** measure the new list code.

| Selected JS profile | Raw minified bytes | gzip bytes | Brotli bytes |
| --- | ---: | ---: | ---: |
| Core | 58949 | 18888 | 16887 |
| Minimal with ready toolbar | 73412 | 22802 | 20090 |
| Standard with ready UI/forms | 159478 | 46669 | 40035 |
| Extended with suggestion UI | 180637 | 52803 | 45155 |

The current generated measurements are recorded above. No new input-performance result, mobile/OS IME certification or accessibility certification is established by these bundle measurements. Existing budget thresholds and zero-runtime-dependency requirements remain in force.

## Single-quote crossing block-paste follow-up

Run the new `tests/list-cross-quote-paste.spec.ts`, `tests/list-cross-quote-paste-react.spec.ts` and `tests/docs/list-cross-quote-paste.spec.ts` definitions alongside the migrated inside/repeated-quote guards. Exercise both outside→inside and inside→outside directions plus whole-quote coverage in one LI. Verify actual partial-quote identity/attributes, retained quoted edges and untouched child bodies, every incoming wrapper/attribute at LI level (including the first multi-block paragraph), a fresh editable pBR before a quoted right remainder, outside suffix caret start, exact backward-selection undo/redo, pending formatting, source gaps/other bodies/branches, clipboard/API parity and controlled feedback. Guard unsupported cross-item ranges and unsupported/semantic source/payload shapes; different-quote endpoints and multiple covered quotes follow the extension below; retain same-quote and native/inline path behavior. Exercise RU/EN sample directions, existing payload controls, structure, quote identity, exact undo and read-only disabling. These definitions were collected before execution; actual browser, build, type and size results belong to the current verification record.

## Multiple-quote crossing block-paste follow-up

Run `tests/list-multi-quote-paste.spec.ts`, `tests/list-multi-quote-paste-react.spec.ts` and `tests/docs/list-multi-quote-paste.spec.ts` alongside the migrated crossing guards. Exercise different-quote endpoints with a wholly covered middle quote, outside-to-last-quote, first-quote-to-outside and full sequence coverage in one LI. Verify both actual partial quote/body wrappers, unselected children/gaps and attributes, removal of fully covered quotes/intervening bodies, standalone incoming wrappers, fresh pBR caret before a quoted suffix or outside suffix-start caret, empty edges, exact forward/backward history and pending state. Every affected source quote must pass strict validation even when fully removed; malformed/semantic/image/nested middle quotes reject atomically. Retain unsupported cross-item/branch and LI-edge quote barriers, merged-cell isolation, controlled React feedback and existing native/inline paths. Exercise all four RU/EN sample controls, retained identity/order, Undo/Redo and read-only disabling. These scenarios describe the earlier acceptance checklist; actual results belong to the current verification record.

## Sibling-item quote crossing block-paste follow-up

Run `tests/list-sibling-quote-paste.spec.ts`, `tests/list-sibling-quote-paste-react.spec.ts` and `tests/docs/list-sibling-quote-paste.spec.ts` with the migrated quote-crossing guards. Exercise consecutive sibling items under one ordinary UL/OL: quote-to-quote, outside-to-quote, quote-to-outside and whole-quote coverage, including fully covered middle items. Verify actual first-item/list identity and attributes; retained partial quote/body wrappers, children/gaps and placeholders; movement of the last suffix, following bodies/opaque quotes and wholly unselected trailing branches into the first item in order; removal of other selected items/quotes and inter-item formatting gaps; direct-inline edge promotion, standalone payload wrappers, quoted-right pBR or outside-suffix caret, exact forward/backward history, pending state and API/clipboard parity. Validate every affected quote including fully covered middle quotes; cross-parent/level/branch endpoints and quote-resolving LI edges remain atomic barriers; first/intermediate trailing branches follow the preservation extension below. Include malformed/semantic/image middle sources, guards, merged-cell isolation, React controlled feedback and retained native/inline ownership. Exercise all four RU/EN sibling sample selections, actual moved-node identity/order, Undo/Redo and read-only controls. These scenarios describe the earlier acceptance checklist; actual results belong to the current verification record.

## Quote-crossing preservation of all selected item branches

Run `tests/list-quote-branches-paste.spec.ts`, its React companion and `tests/docs/list-quote-branches-paste.spec.ts` with the migrated sibling quote guards. Exercise structural quote-crossing replacement while first, middle and last items own multiple mixed UL/OL trailing branches. Verify actual subtree identity, attributes/start values, deeper nesting and empty-item placeholders; detach before direct-inline clipping and removal; append after the entire resulting body sequence in source-item order and original branch order within each item. Do not assert the former global body/branch traversal order. Verify all four directions, payload wrappers, quoted-right pBR/outside suffix caret, exact backward/forward history, pending state, strict affected quote refusal and malformed/semantic branch root barriers; interleaved own bodies follow the new profile below. Native/inline and no-affected-quote paths retain prior barriers. Exercise the eight RU/EN branch sample definitions, moved branch order/identity/HTML, caret, Undo/Redo and read-only. These definitions were collected while execution was deferred; actual results belong to the current verification record.

## Interleaved own bodies and nested branches in quote-crossing paste

Run `tests/list-interleaved-quote-paste.spec.ts`, its React companion and `tests/docs/list-interleaved-quote-paste.spec.ts` with migrated unsupported-source guards. Exercise one item and consecutive siblings where a wrapped own body follows a nested list. Preserve actual prefix sequence/branches, insert all payload roots before protected interval branches, retain those branch subtrees in source order before the right suffix, and keep right-following body/list children in their exact original sequence. For a quoted right edge, assert a pBR caret after protected branches immediately before the actual quote; outside suffix caret stays at its body start. Verify prefix/following nodes, branch HTML/metadata/placeholders, consumed items/gaps, strict affected quote and ordinary branch root preflight, direct-inline noninterleaved neighbor promotion, real child offsets and branch-edge barriers, guards, exact history, merged cells and React controlled feedback. Native/inline, ordinary same-body outside-quote and no-affected-quote interleaved paths remain blocked; inner quote insertion follows the extension below; the trailing-only profile keeps earlier relocation rules. Exercise all eight RU/EN demo directions, node identity/order, caret, Undo/Redo and read-only. These scenarios were collected while execution was deferred; actual results belong to the current verification record.

## Inner quote insertion in an interleaved item

Run `tests/list-interleaved-inside-quote-paste.spec.ts`, its React companion and `tests/docs/list-interleaved-inside-quote-paste.spec.ts` alongside the existing inner/crossing/trailing/ordered list suites. Exercise caret, same-child-body and forward/backward child-body selections inside an ordinary direct quote whose owning item also has bodies after lists. Validate target quote and every interleaved branch root before mutation. Preserve the exact actual outer sequence, neighboring quotes, prefix/following branch subtrees and untouched quote children; compose multi-p/h or one heading only inside the original quote. Cover placeholders, inline promotion, childNodes/gaps, pending formatting, exact history/caret, nested-quote and source-image/semantic refusals, read-only/composition, merged cells and React controlled feedback. The RU/EN sample defines caret/range × multi-block/heading cases with actual outer identity/order/HTML, nested quote refusal, Undo/Redo and read-only controls. Keep acceptance definitions separate from recorded executed results rather than treating static review as passing browser evidence.

## Static coverage audit of the deferred list work

The following files exist and their scenario groups were reviewed against the deferred contracts. This maps definitions, not executed passes. Editor files live under `tests/`; live examples live under `tests/docs/`. The parent verification report must record the actual browser/project results independently.

| Contract group | Editor definitions | Adapter definitions | Live example definitions |
| --- | --- | --- | --- |
| Base item selection/deletion and forward Delete | `list-selection.spec.ts`, `list-selection-guards.spec.ts`, `list-forward-delete.spec.ts` | `list-selection-react.spec.ts` | `list-selection.spec.ts` |
| Wrapped/multiple bodies, Enter and boundaries | `list-wrapped-selection.spec.ts`, `list-wrapped-input.spec.ts`, `list-wrapped-guards.spec.ts`, `list-multiblock-selection.spec.ts`, `list-multiblock-input.spec.ts` | `list-wrapped-react.spec.ts` | `list-wrapped.spec.ts`, `list-multiblock.spec.ts` |
| First-body Backspace and nonfinal branch lifting | `list-first-body-backspace.spec.ts`, `list-nonfinal-branch-backspace.spec.ts` | Their `-react.spec.ts` companions | Same basenames |
| Block replacement and caret insertion | `list-block-paste.spec.ts`, `list-caret-block-paste.spec.ts` | Their `-react.spec.ts` companions | Same basenames |
| Single heading, quote, repeated quote and inner quote | `list-single-heading-paste.spec.ts`, `list-quote-paste.spec.ts`, `list-quote-repeat-paste.spec.ts`, `list-inside-quote-paste.spec.ts` | Their `-react.spec.ts` companions | Same basenames |
| One/multiple/sibling quote crossings | `list-cross-quote-paste.spec.ts`, `list-multi-quote-paste.spec.ts`, `list-sibling-quote-paste.spec.ts` | Their `-react.spec.ts` companions | Same basenames |
| All branch retention and interleaved body/list order | `list-quote-branches-paste.spec.ts`, `list-interleaved-quote-paste.spec.ts` | Their `-react.spec.ts` companions | Same basenames |
| Inner quote in an interleaved item | `list-interleaved-inside-quote-paste.spec.ts` | `list-interleaved-inside-quote-paste-react.spec.ts` | `list-interleaved-inside-quote-paste.spec.ts` |

The new inner-interleaved demo definitions exercise Russian at a 390px viewport and English at a desktop viewport, including page overflow and usable control widths. They do not establish responsiveness of every preceding sample. Documentation browser coverage is configured for Chromium; editor browser projects cover their configured engines when actually run. Real OS/mobile IME, a full accessibility audit and arbitrary office-document fidelity remain separate evidence gaps.
