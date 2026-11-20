# Optional special-character panel

Status: accepted next roadmap slice; actual validation belongs to verification-backlog.md.

## Composition

Expose `@morfira-dev/wysiwyg/ui/special-characters` and its explicit `/ui/special-characters.css`.
`createSpecialCharacterUI(host, editor, options?)` returns `element`, `refresh()` and
idempotent `destroy()`. Public adjacent types: SpecialCharacter { id, text, label },
SpecialCharacterUIOptions { label?, characters?: readonly SpecialCharacter[], onError? },
SpecialCharacterUIController and SpecialCharacterUIMessageKey. Export the RU/EN
`specialCharacterUIMessages` catalog. No plugin installation is required: literal
insertion delegates to existing validated core operations. This is optional UI,
not a new document format/engine or a redundant headless character command.
No core/preset imports, automatic styles, framework/runtime dependencies or fonts.

Provide a small built-in catalog (roughly 24–40 punctuation, currency, mathematical
and typographic symbols), localized names and a text search field. Applications
may replace the catalog; snapshot and validate it before mounting. Allow 1–256
unique bounded IDs (1–64 ASCII identifier characters), literal labels 1–160 UTF-16
units, and nonempty text at most 16 Unicode code points / 64 UTF-16 units. Reject
C0/C1/DEL, line/paragraph separators, bidi embedding/override/isolate controls and
unpaired surrogates. Character text may include literal angle brackets: never
interpret catalog entries as markup. Query filtering affects only the panel;
locale updates retain the query, selected editor range and draft state. A focused
character button retains its same visible ID on locale rerender; external/search
focus is never stolen. Editor-surface UI attribute changes are not persisted
document mutations and do not invalidate the saved target.

## Selection, history and ownership

Require an empty connected same-document external HTML host, outside editor
content. Reject malformed options without changing host, document or listeners.
Use the existing saved native Selection/Range contract, including backward and
empty-block ranges. Do not insert at a stale fallback after API replacement,
readonly, composition, disposal or focus callbacks replacing content/selection.
Require a fresh valid editor selection before accepting another target after
replacement; remember ordinary changes through existing selection capture.
Refuse selections inside/touching protected semantic nodes, atomic mentions,
noneditable/foreign descendants, or selected image/table/figure resources rather
than introducing a replacement policy for them. Ordinary paragraph/heading,
list-body, quote, marked/link text and cell text contexts reuse existing insertion
within one own text flow. Expanded ranges across different blocks/own bodies are
refused in this first panel slice.
No table-range ownership interception or general structural source support.

A native button inserts its exact literal text over the remembered valid range
with one existing history step and one user notification, leaving a usable caret.
Undo restores original document and range/direction. Catalog navigation/search,
locale changes and panel rendering never mutate document/history. Readonly and
IME disable/guard insertion synchronously while search remains observational.
Retained controls after disposal cannot act. All listeners/subscriptions and
DOM are owned per editor/controller; setup rollback and editor destruction release
them. Diagnostic callbacks are trusted code and cannot bypass selection guards.

## Keyboard, localization and presentation

Use a labeled nonmodal group, labeled search input, native character buttons,
a localized live result/no-results status and scoped --mw-* variables. Search
matches localized label, ID and symbol; no regex interpretation. Character buttons
use roving tabindex: arrows move through an eight-column grid, Home/End row edges,
Ctrl/Meta+Home/End whole filtered set; Enter/Space retain native button activation.
Escape restores a still-valid saved editor selection without reviving stale state.
Do not claim full screen-reader/real-device accessibility without evidence.
Styles are scoped, responsive and do not require documentation CSS.

## Acceptance and budgets

Cover representative three-browser literal insertion/replacement, marked/list/cell
text and one backward/empty-block history case; keyboard/search/localization,
readonly/IME, external replacement and focus callback races, malformed catalogs,
resource/semantic barriers, two instances and cleanup. Avoid a cross-product of
every symbol and block. Add RU/EN homepage/playground controls, guide/API recipe
and small localized docs tests. Add public type/package/selective-import and actual
tarball smoke. Measure raw/gzip/Brotli/CSS independently and a deduplicated
standard-special-characters-ready profile. Initial standalone guards: 12000 gzip
JS bytes including selected core helpers, 3000 raw CSS bytes. The selected profile
keeps standard's existing 80000 gzip JS / 20000 raw CSS caps. Presets remain unchanged.

## Optional dialog presentation (2026-11-20)

`presentation: 'dialog'` creates an initially closed native modal dialog; inline
remains the default. `open()`, `close()` and `isOpen()` belong to its controller.
Open captures the ordinary editor target before moving focus to search. Native
dialog focus containment and Escape are used; Close/Escape return focus to the
connected invoker. Before validated insertion the dialog closes so editor focus
and callback-time target checks remain effective; successful insertion leaves
the document caret available. API replacement/read-only/composition close the
dialog and invalidate the target. Destroy removes the owned dialog/listeners.
No polyfill, global registration, persisted UI or dependency is added; browsers
without native dialog support refuse this opt-in explicitly. Deterministic
browser tests cover focus, literal insertion/history, cancellation and stale
targets, not every platform's assistive technology.
