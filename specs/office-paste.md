# Office HTML compatibility

Status: bounded implementation contract; browser validation is recorded in
`verification-backlog.md`, not implied by the scenarios below.

## Shared HTML import

The schema HTML boundary recognizes a small explicit subset of Office HTML before
the normal safe reconstruction. Clipboard paste, `insertHTML`, `setHTML`, initial
HTML and table clipboard sanitization consequently share this interpretation.
JSON schema v1 and existing atomic paste/history/selection rules are unchanged.

- Word paragraphs need an inline `mso-list: lN levelD lfoN` declaration, with
  depth 1–9, and one explicit descendant SPAN with inline `mso-list:Ignore`.
  Only standalone decimal markers (`1.`, `1)`) or the common bullet markers
  `·`, `•`, `○`, `▪`, `■`, `o` are recognized. The marker span may contain
  formatting spans and whitespace. A recognized marker alone is removed;
  paragraph content/formatting is retained inside an ordinary LI paragraph.
- Adjacent recognized paragraphs with the same Word list/lfo identity become
  semantic UL/OL. A group starts at level 1; nesting may increase by one beneath
  the preceding item. Decimal starts survive as OL start; a numbering gap starts
  another OL rather than silently renumbering. List kind may change at a level.
  Comments/formatting whitespace do not interrupt a group. Other nodes, unknown
  markers, invalid metadata and unsupported level jumps retain their source
  paragraphs and interrupt grouping. No CSS stylesheet/class-based list engine,
  alphabetic/Roman counter interpretation or margin-based inference is added.
- A B wrapper whose ID starts `docs-internal-guid-` and whose explicit inline
  font-weight is `normal` or `400` is unwrapped, preserving child nodes without
  creating invalid inline wrappers around blocks. The artifact wrapper's own
  attributes/styles are discarded; actual nested bold nodes and child styles
  retain their semantics. Ordinary B nodes and matching IDs without that
  explicit weight remain bold. IDs themselves remain filtered by the codec.
- Excel semantic HTML tables retain the existing grid/span and safe-formatting
  contract; TSV uses the existing table plugin path. Formulas, workbook metadata,
  class stylesheets, Office XML, drawings and local file images are not imported.
  Existing bounded CSS units remain unchanged: Office point-valued font sizes
  and class-only heading/typographic declarations are not translated.
  This slice does not parse raw Windows CF_HTML offset headers or claim universal
  fidelity for all application/browser/version combinations.

## Safety and ownership

Only HTML-namespace nodes are normalized in an inert template; no stylesheet,
script, resource lookup or live-DOM Office content is used. Before Office
transformation an iterative source walk enforces the existing 100,000-node and
depth-100 bounds, including otherwise discarded source subtrees. Existing
5,000,000-code-unit input and normalized output budgets, safe URL/style/attribute
reconstruction and final document validation remain authoritative. No additional
dependencies, persisted Office metadata or new public API are introduced.

Semantic application-owned wrappers/markers (`data-mw-node`) are not retagged,
removed or moved into reconstructed lists. Unsupported metadata is not authority
to execute a command or bypass schema validation. Invalid clipboard imports leave
content, selection and history unchanged; read-only and composition still block
user edits. Backend sanitization, upload authorization and CSP remain application
responsibilities.

## Acceptance and evidence

Representative synthetic Word list, Google Docs wrapper and Excel table fixtures
exercise actual ClipboardEvent import, selection replacement, one-step undo/redo,
safe formatting/URL stripping, merged-cell preservation and atomic bounds/guards.
Fixture provenance is explicit: these are reduced reproductions of supported
markup shapes, not captured real-application clipboard evidence. Real Word,
Excel and Google Docs release/browser/OS captures and native clipboard permission
checks remain a separate verification task. No local behavioral test run or CI
result is implied by authoring those regressions.
