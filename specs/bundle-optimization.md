# Standard bundle reserve — behavior-preserving optimization

Status: implemented and locally validated with staged site verification, 2026-11-16. Baseline source 691f32f. Actual results belong to verification-backlog.md.

## Outcome and unchanged boundaries

Create useful gzip reserve in the largest selected standard profile, currently 64999 bytes against the unchanged 65000-byte guard. Aim for at least 2000 bytes of reserve if safe structural reductions support it; report the actual result rather than assuming a target is achieved. Keep identical selected factories, plugins, defaults, public paths/types, schema, localization, DOM controls, security checks, history, selection and lifecycle behavior. Core/plugins gain no runtime dependency. Do not remove tests/features, shorten diagnostic messages for bytes, change compression/charset settings, raise limits, move code outside measured closures or claim runtime flags as tree-shaking.

## Accepted narrow refactors

1. Require the already supplied DocumentSchema in internal formatting helpers and its sanitizer in the internal exact-HTML snapshot cache, removing unreachable default-codec fallback branches; exported Editor and standalone codec APIs stay unchanged. Remove only proven unread private state (ListItemBoundary.ownEmpty and its unused computation). Factor only genuinely identical validated multi-block composition and identical source-inline predicates, retaining separate source/payload eligibility barriers and caller-owned branch placement.
2. Factor row/column insert/delete grid mechanics behind the existing functions. Each call still reads and rebuilds the current grid separately; preserve span-origin relocation, cell identity/content, caption/width behavior, errors and rollback. Require the already passed per-editor sanitizer in private table clipboard helpers rather than importing an unused global fallback.
3. Consolidate repeated UI DOM construction and listener/disposer plumbing in feature-owned internal helpers. Preserve native elements, exact hierarchy/order/classes/attributes, field restrictions, localized labels, listener order/capture, cleanup/rollback order and per-instance ownership. Leave commands, drafts, upload state, focus, read-only and composition logic with their existing owners. No generic global UI service or image-mode capability removal.

Only retain measured useful reductions; readability and exact behavioral equivalence take precedence over speculative abstractions. Named helper types remain adjacent owner types. No new tests that merely mirror helper implementations; retain all existing meaningful scenarios and add a regression only for a new distinct risk.

## Verification and reporting

Measure before/after raw JS, gzip, Brotli and CSS using the same build/size scripts and profile selection; shared emitted chunks once, framework runtimes/maps/declarations/fonts excluded. Save baseline and machine-readable diagnostics in ignored artifacts, regenerate size-report.json through tooling only. Keep existing profile budgets unchanged. This is transfer-size work, not a browser-latency or memory-capacity claim; any runtime benchmark follows performance.md and runs without concurrent builds/tests.

After implementation, exercise formatting/schema/security/paste/list, merged-table/history/clipboard and UI/lifecycle regressions in Chromium/Firefox/WebKit through the complete existing suite, avoiding a duplicate focused run when no new failure justifies it. Run the complete check on a fresh task-owned Vite server, followed sequentially by built bilingual docs/examples and actual installed tarball consumers (default and Angular 22). Do not rebuild packages under active browser tests, weaken timeouts/assertions or hide failed runs. Refresh RU/EN size/status documentation and the verification record with actual results. The latest user instruction authorizes commit and push after this stage is validated, then stop until the user resumes. No manual package publication or site deployment is authorized.

## Experiment cutoff

The first safe refactor build reduced the largest standard profile from 64999 to 64527 gzip bytes. The original 2000-byte reserve aim was not reached at this checkpoint. UTF-8 output would save only about 189 bytes in a diagnostic and was not adopted; measurement charset remains unchanged. Terser per-module minification increased the final esbuild consumer profile (whole graph and isolated core/plugin variants), so its temporary dev dependency was removed and package.json/pnpm-lock.yaml returned unchanged. Exact private-field shortening showed only 122 bytes extra on the audited long-name set and 251 on a broader unapproved diagnostic; no property renaming or build configuration change is retained. Stop experiments here, validate only the readable structural changes and report the actual modest reserve without claiming the original aim was reached.
