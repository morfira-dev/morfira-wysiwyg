# Text layout: line height and paragraph spacing

Status: accepted implementation contract, 2026-11-23. Opt-in plugin
`/plugins/text-layout` and independent UI `/ui/text-layout`; presets unchanged.

`textLayout()` and `textLayoutCommands(editor)` provide `setLineHeight(number | false)`,
`setSpaceBefore(number | false)`, `setSpaceAfter(number | false)` and `getState()`.
Line height is finite unitless 0.5–4, at most three decimal places; paragraph
spacing is an integer 0–96 CSS px. False resets only the requested property.
Invalid arguments reject before edits, even without a valid selection.

Persist only P/H1–H6 line-height, margin-top and margin-bottom through the core
HTML/JSON codec, canonicalizing numeric units and rejecting arbitrary CSS.
Core helper normalizeTextLayoutStyle lives privately with document validation;
existing schema version stays compatible, older readers may lose these styles.
Block layout remains outside inline format painter and inline text styles.

Targets are the nearest ordinary paragraph/heading at each native endpoint and
a contiguous sibling interval sharing one parent and table cell. This includes
paragraphs/headings in list items and quotes. No root child-index, cross-item,
cross-cell, PRE, semantic, image-containing, foreign or nested structural target.
A range ending at the start of a sibling block includes that endpoint, consistently
with explicit direction formatting. Preserve actual nodes, exact selection,
inline formatting and branches; one command is one history entry. No-op changes
create no history. API calls and native UI controls capture exact revision-bound
target points and refuse focus callbacks selecting a newer target before mutation. Read-only/composition refuse through the command registry.

State exposes explicit numeric or false values and separate mixed flags for all
three fields; no computed/inherited styles are sampled. UI uses native compact
selects, saved revision-bound selection, localized RU/EN labels and explicit host
ownership/cleanup. Consumers can use commands without UI or CSS.

Focused acceptance: backward multi-block selection/history, nested list/quote
locality, mixed/reset, invalid/nonfinite/CSS payloads, unsafe HTML/JSON filtering,
read-only/composition, stale UI targets, external replacement, destroy and locales.
Run the changed cases in Chromium, Firefox and WebKit; record actual evidence
separately. Do not run full suites automatically.

## Optional UI stylesheet baseline

The independently imported text-layout/format-painter styles use native CSS
nesting (explicit `&` type selectors): Chrome 112+, Firefox 117+, Safari 16.5+.
This baseline applies to these optional styles, not to headless commands or a
new core browser-support claim. Applications targeting older CSS engines can
transform the optional styles in their own CSS toolchain.
