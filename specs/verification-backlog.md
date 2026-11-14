# Deferred verification — list editing slice

Status: verification explicitly deferred by the user for the current list-editing work. New code, tests and examples may be written, but no test, package/documentation build, type-check or bundle measurement has been executed for this slice. This is not a passing validation report. No push, package publication or deployment is authorized by this document.

## Current bounded work

- Selection replacement across ordinary direct-inline or p/h1–h6-body-sequence sibling list items under one ul/ol, and between distinct supported bodies of one item: typing, selected Backspace/Delete, and inline/single-ordinary-p API or clipboard insertion.
- Forward Delete at an ordinary item's own-content end: join the next sibling within the same list, preserving branches and metadata; stop at unsupported/container boundaries.
- Selection direction, exact caret/history, read-only/composition/cancellation, external synchronization and React StrictMode acceptance scenarios.
- Pending caret-formatting state across native/API replacements, failed operations and undo/redo. The newly written regression definitions are source-review candidates, not executed reproductions.
- Wrapped/direct body combinations, first-wrapper tag/alignment and inline semantic metadata, unselected branch identity outside the wrapper, item-level endpoint normalization and exact undo boundaries.
- Wrapped Enter/Shift+Enter and the explicit empty/semantic/complex-body limits described in `lists-toolbar.md`.
- Multiple ordinary paragraph/heading bodies per item: same-item cross-body replacement, preserved outside bodies, splitting with subsequent bodies, and bounded internal Delete/Backspace joins. Semantic bodies, mixed direct text/block shapes and arbitrary structural payloads remain unsupported.
- RU/EN API, list guide, roadmap and local homepage/playground examples, including single-body and multiple-body paragraph/heading modes and backward same-item selection controls.

The accepted source/payload boundaries are specified in `list-selection.md` and the forward-Delete addendum in `lists-toolbar.md`. Existing ordinary-block insertion remains under `paste-replacement.md`. New list behavior must remain marked unverified in the documentation until the checks below actually run.

## Checks to run when execution is requested

1. Read the final source diff and specifications before selecting the checks; preserve unrelated work.
2. Build packages and run focused list behavior tests in Chromium, Firefox and WebKit: `tests/list-selection.spec.ts`, `tests/list-selection-guards.spec.ts`, `tests/list-selection-react.spec.ts`, `tests/list-forward-delete.spec.ts` and `tests/caret-replacement-state.spec.ts`, plus `tests/list-wrapped-selection.spec.ts`, `tests/list-wrapped-input.spec.ts`, `tests/list-wrapped-guards.spec.ts`, `tests/list-wrapped-react.spec.ts`, `tests/list-multiblock-selection.spec.ts` and `tests/list-multiblock-input.spec.ts`, together with the existing list, native input, composition, transaction and paste suites relevant to shared helpers.
3. Run `pnpm run check --workers=2` for project contracts, declarations, package boundaries, selective-import/tree-shaking checks, type checks, budgets and the complete browser suite. Avoid concurrent package builds while browser tests consume their output.
4. Run `pnpm run docs:build` and `pnpm run test:docs --workers=2` for both language versions and the new examples, including `tests/docs/list-selection.spec.ts`, `tests/docs/list-wrapped.spec.ts` and `tests/docs/list-multiblock.spec.ts`. Inspect the actual new demo controls and a narrow viewport; a successful build alone is not browser proof.
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

No new list bundle delta, performance result, mobile/OS IME result or accessibility certification is currently available. Existing budget thresholds and zero-runtime-dependency requirements remain in force; postponing measurements does not relax them.
