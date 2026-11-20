# Optional table size picker

Status: implementation contract; current validation belongs to verification-backlog.md.

Expose `/ui/table-picker` and `/ui/table-picker.css` as a separately imported framework-free size widget. `createTablePicker(host, options)` returns its owned `element`, `refresh(state)` and idempotent `destroy()`. It never imports table commands, presets or editing behavior and never mutates an editor itself. Its only application callback is `onSelect(rows, columns)`.

`TablePickerOptions` supplies initial integer `rows` and `columns` from 1 through 100, `locale: EditorLocale`, `disabled: boolean` and the callback. `TablePickerState` contains only locale and disabled; refreshing does not overwrite the current preview. Validate configuration before mounting into an empty external host, and validate refresh state before changing the existing widget. Localization uses instance-owned snapshots/overrides and the exported RU/EN `tablePickerMessages` catalog; labels are text, never HTML. Imports do not access browser globals or register anything.

The bounded 8-by-8 matrix uses native type=button cells in a localized group, one roving tab stop, individually localized insertion names and a polite dimensions status. Hover/focus previews the rectangle ending at that cell without editing or history. Initial sizes larger than eight clamp only the preview, not the caller's dimensions. Arrow keys move one cell without wrapping, Home/End move to the first/last cell in the row, and Ctrl/Meta+Home/End move to the first/last cell in the matrix. Native Enter/Space activation chooses the highlighted size. Composition-marked keys do not choose or navigate. Escape remains owned by the containing panel; Tab leaves the single widget tab stop. No ARIA grid/row model or focus trapping is implied. Disabled and detached controls cannot emit selections. Destroy removes all delegated listeners and owned DOM, retained controls become inert, and refresh after destroy fails clearly. Multiple widgets have independent state.

Standard UI accepts an additive `table.picker?: TablePickerFactory` hook, supplied explicitly with the imported factory. Default standard UI retains the existing numeric dimension fields and insertion button, without retaining the picker implementation or CSS. The picker is an optional fast path; numeric fields continue to support 1–100 rows and columns and keep their drafts through preview/localization changes. Choosing a size fills those fields and invokes the same validated insertion path. Public initial dimensions and existing options stay compatible. No runtime flag is claimed to tree-shake an already imported widget.

The containing table panel owns selection, read-only/composition gates, diagnostics, one atomic table command and history. Recheck editability after restoring selection because focus callbacks may replace content or enable read-only/composition. Invalid/stale selections or replacement dismissals must leave document/history unchanged. Panel close, API replacement, UI destruction and setup rollback dispose its owned picker. A captured callback after disposal cannot insert into a new document. Nested-table rejection and merged source content use the unchanged table command contract.

## Optional anchored table panel

Standard UI accepts `table.presentation?: 'inline' | 'popover'`, default `inline`.
The explicit popover presentation moves the entire owned insertion panel out of
page flow, including its optional matrix and the existing 1–100 numeric fields.
It does not add a second nested popup to the standalone picker or change its API.
Opening/preview/positioning create no document/history edits. A compact panel is
anchored to the actual table launcher, or the visible More trigger when overflow
has hidden that launcher. Keep it inside the visual viewport with a 20px gutter,
flip above when appropriate, and scroll the panel internally when space is short.
The editor/page layout must not expand merely because the chooser opens.

Use the browser's feature-detected manual Popover API for top-layer presentation
where available; otherwise use the same fixed-position panel in its owned host.
The fallback can be subject to application stacking/clipping contexts and is not
a general portal/overlay service. Do not require native CSS anchor positioning.
Use scoped CSS variables and no resource, stylesheet or global service injection.

Existing containing-panel ownership remains authoritative: Escape closes and
returns focus to the launcher/More, outside pointer dismissal preserves the chosen
outside target's focus, Tab is not trapped, and successful insertion restores the
editor. Read-only/composition disable mutation, external replacement invalidates
the panel, and destroy/close remove every positioning listener/observer and native
popover state. Position refresh is observational, retains input drafts and never
replaces the editor's selection. Multiple instances own separate panels; native
top-layer support does not make this a modal dialog or an accessibility guarantee.

Focused acceptance compares editor position before/after opening, checks keyboard
size choice and one Undo, narrow/short viewport fit, outside/Escape focus, fallback,
API replacement and retained controls after disposal. Keep inline defaults and
existing numeric fallback tests unchanged. Actual evidence is recorded separately.

CSS uses scoped `.mw-table-picker*` selectors and `--mw-*` colors, border, radius, focus and spacing. No remote assets, dependencies, resource loading, document schema change or new table insertion semantics. Measure its selective entry under 4000 gzip JS bytes and CSS independently; existing 80000 gzip standard and other guards stay unchanged. Explicit picker-ready profiles count shared chunks once and report raw/gzip/Brotli/CSS separately rather than hiding the additional closure.

Representative browser acceptance in Chromium/Firefox/WebKit: pointer preview versus one-step insertion/Undo; roving keyboard and Escape; live RU/EN/escaped overrides and disabled synthetic activation; numeric 1–100 fallback; API replacement/read-only/focus-callback/disposal rejection; standalone bounded initialization, invalid-state atomicity, independent widgets and cleanup. SSR imports and public types/selective consumers cover package boundaries. Keep existing table span and history regressions; do not multiply the complete operations matrix through this chooser. RU/EN public docs/demo explicitly import both factory and CSS and state its eight-by-eight quick-pick limit.
