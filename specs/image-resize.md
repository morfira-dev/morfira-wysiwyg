# Proportional image dimensions

Status: accepted implementation scope; browser tests are authored but not run locally at the user's request. This stage adds numeric/keyboard resizing, not pointer handles or cropping. Core, schema v1, URL rules, preset installation and runtime dependencies remain unchanged.

## Commands

Add `ImageResize = { width: number; height?: never } | { height: number; width?: never }` and `imageCommands(editor).resize(size): void` through the existing images entry. Require exactly one own width/height field, integer 1–1000; reject arrays, missing/both/unknown fields, fractions, nonfinite and out-of-range values before mutation. Derive the other dimension with Math.round from a valid stored width/height pair; if that pair is absent, use the selected image's already available positive naturalWidth/naturalHeight. Do not fetch, decode, clone or create a preview image and do not use CSS layout as the ratio source. Missing proportions and derived sizes outside 1–1000 reject atomically; no clamping or distortion. Integer dimensions preserve the source ratio to nearest-pixel precision, not exact rational precision across repeated separately committed resizes.

Resize one actual selected ordinary IMG (the existing image-selection/caption-caret contract), inline or directly owned by a simple single-image figure, including list/cell placement. Refuse foreign/protected ancestors and protected/foreign figure descendants or complex figure structure. Keep existing metadata, actual IMG/figure/caption identities and rich caption children. Persist both HTML dimensions and validated pixel styles using existing update/history. One successful resize creates one undo transaction with exact native node selection; identical dimensions create no history entry. Read-only/composition are no-ops and disposed APIs throw. Recheck identity/ownership/read-only/composition after any focus callbacks before mutation; an external replacement must never redirect a resize to new content.

## Reusable form

Add a localized checkbox `ui.images.keepAspectRatio` to both existing image-form modes, with `ImageFormOptions.keepAspectRatio?: boolean` (default false for compatibility, validated and snapshotted before mount). It applies to resizing an existing selected image; insertion, upload, independent dimensions and blank-dimension reset remain available under the existing unlocked contract. Unknown proportions disable the checkbox; an existing surface-capture load listener can refresh it after the already-requested image loads. No listeners belong to individual image nodes.

When checked, user input in width/height calculates the other draft from the inspected image's fixed ratio, avoiding cumulative rounding within a draft. Do not write document data before Update/Enter. Programmatic setValues preserves literal drafts; Apply validates that the pair matches the locked ratio. Invalid/blank/oversized drafts preserve fields and show the existing localized error; uncheck to reset independent dimensions. Changing src while locked cannot apply an unrelated image's ratio. A locked update is bound to the inspected actual IMG and source/dimensions; a changed target, API replacement, readonly/composition or destruction invalidates it. Combine size/other metadata in one update and omit an unchanged caption so rich caption children survive. Locale changes preserve draft/checkbox state, and disposal removes every owned listener. Checkbox state is transient UI, never persisted schema data.

## Acceptance and evidence

Author representative Chromium/Firefox/WebKit regressions for width/height resizing, rounding, stored/natural/missing proportions without extra requests, native selection and exact Undo/Redo, rich caption/node and merged-cell preservation, malformed inputs/extreme aspect ratios, semantic/complex/foreign targets, no-op history, read-only/IME/disposal and focus-time replacement. Form cases cover linked drafts and one-step Apply, opting out/reset, unknown/load state, invalid/stale programmatic drafts, external replacement, rich captions, constructor validation, locale and detached controls. Extend existing RU/EN homepage/playground examples and installed-consumer/type coverage without repeating the entire matrix. Preserve selective imports and current gzip/CSS budgets. Record unexecuted tests and unmeasured sizes explicitly; do not claim a passing run from source review.

## Local evidence — 2026-11-18

Final `pnpm run build`, `pnpm run typecheck` (including authored test compilation, Svelte and docs Vue types), and `pnpm run docs:build:site` passed. The project source-contract guard also passed during implementation. pnpm 11.0.7 refreshed the already-frozen dependency installation without a lockfile change; there are no new dependencies. Sandbox IPC failures were environmental and the affected non-test commands succeeded outside that boundary. No editor, documentation, release or installed-consumer tests were executed, and there was no browser/manual rendering verification. Eight command definitions, six form definitions, two bilingual demo definitions and extended installed-consumer sequences remain unexecuted acceptance coverage. The user authorized local commits only, with no push or publication.

Actual final build sizes (decimal bytes, shared JS chunks included once in each selected closure):

| Entry/profile | Minified JS | gzip JS | Brotli JS | Minified CSS |
| --- | ---: | ---: | ---: | ---: |
| Core | 89310 | 27690 | 24363 | 3293 |
| Images entry | 10763 | 3859 | 3435 | 0 extra |
| Image form | 25806 | 9274 | 8224 | 1506 explicit shared forms CSS |
| Contextual image UI | 38084 | 13876 | 12321 | 1662 contextual CSS + shared forms CSS |
| Standard ready | 205902 | 61205 | 52386 | 11504 |
| Standard contextual image ready | 217423 | 64478 | 55145 | 13166 |

Core and CSS are unchanged. The largest measured standard JS profile is 66279 gzip bytes, leaving 13721 bytes under 80000; all existing build budgets passed. Shared forms CSS is 599 gzip/488 Brotli bytes; contextual image CSS is 676 gzip/545 Brotli bytes. Profile CSS totals already include their selected shared styles. These build/static measurements do not establish runtime editing correctness or accessibility.
