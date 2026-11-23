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
  Explicit inline point-valued font sizes are translated under the bounded
  typography contract below; class-only heading/typographic declarations are
  not translated.
  This slice does not parse raw Windows CF_HTML offset headers or claim universal
  fidelity for all application/browser/version combinations.

## Bounded inline point sizes

HTML import translates an explicit inline `font-size` in `pt` to `px` during
inert safe traversal, without consulting stylesheets, layout or computed
styles. This applies to any HTML using the supported inline markup; no source
application detection is required. Normalization reads decoded inline attributes,
including HTML character references, never CSSOM. Ordinary HTML keeps the existing
safe-traversal resource policy; point conversion does not enable the separate
full-source Office marker/wrapper prepass or broaden its trigger conditions.
Preserve declaration order, including duplicate
font-size declarations, so the last accepted value keeps precedence and an invalid
later declaration does not discard an earlier safe fallback. The CSS absolute-unit
ratio is 4/3; round to at most three fractional
digits and remove insignificant trailing zeroes. Accept unsigned decimals with
one to four integer digits and at most three fractional digits, including zero,
only when the converted value is at most 9999.999px (the existing safe length
grammar). Thus 12pt becomes 16px and 11pt becomes 14.667px. Conversion does not
restrict imported sizes to an optional fonts plugin's configured choices.

Reject signs, exponent syntax, unitless values, comments, functions, escapes,
`!important` and overflow by leaving them to the existing safe-style filter;
they never become accepted point sizes. Do not reinterpret width/height or other
point-valued properties. Preserve independent safe declarations and rich child
formatting. Skip original style attributes longer than 20000 code units rather
than shortening them into accepted input, foreign-namespace elements, and
application-owned semantic wrappers/subtrees (`data-mw-node`). The subsequent
safe reconstruction remains authoritative for every attribute and URL.

This is an additive HTML-import normalization shared by initial/set/insert HTML,
clipboard and schema HTML methods. Its output persists canonical px in schema-v1
HTML/JSON; direct JSON `pt` remains filtered by the existing style policy. No
document version, public API, font resource loading or runtime dependency changes.
It is not complete Office typography, stylesheet support or evidence from real
application clipboard captures.

Focused acceptance covers direct HTML and JSON round trips, fractional and
boundary conversion, invalid CSS/security filtering, selection replacement and
one-step paste history with surviving rich formatting. Existing guarded paste
and source-resource bounds remain in force.

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

## Evidence corpus and capture workflow — 2026-11-23

`tests/fixtures/office/manifest.json` pins immutable upstream commits and SHA-256
payloads with adjacent MIT notices. Import data only, never an external editor's
normalization code. Preserve original fixture bytes; distinguish upstream trimmed
Word captures, upstream anonymized Excel captures and Google Docs-labeled samples
whose original capture method/browser/version are undocumented. Unknown provenance
fields remain null. Existing authored synthetic samples retain their explicit label.

The Word Windows/Edge and Mac/Safari captures expose a Wingdings `§` bullet. Treat
this character as a bullet only inside one recognized `mso-list:Ignore` marker
whose nearest explicitly font-qualified own/intervening SPAN uses Wingdings
(quoted or unquoted, case-insensitive). A nearer different font blocks that rule. A normal section sign, different font, unsupported
marker or semantic subtree does not authorize discarding text. Decimal and other
existing marker rules are unchanged; alphabetic/Roman labels remain literal.

Real Excel overflow cells use `colspan` with inline `mso-ignore:colspan`; these are
not true merges. For an ordinary HTML TD under an ordinary TR with no semantic
ownership, rowspan absent/1 and explicit decimal colspan 2–1000, remove only this
false span and insert span-minus-one empty TD siblings immediately after it.
Retain source content and all later column positions; true colspan/rowspan merges
remain unchanged. Never expand semantic owners/descendants, foreign namespaces,
invalid spans or unsupported rowspan combinations. Count added cells against the
existing source-node limit before expansion; final schema/grid budgets still apply.
Recognize this explicit declaration in the inert Office prepass trigger. No general
CSS evaluation, hidden-row recovery or spreadsheet-formula interpretation is added.

Acceptance uses original data through actual ClipboardEvent import plus history,
exact unaffected content and structural assertions: Word nested bullet level3 and
unknown Roman labels; Excel true header/vertical merges versus overflow empty cells,
Korean/emoji/quoted literal text and displayed numeric values; Docs neutral wrapper,
styles, semantic table and retained colgroup widths versus unsupported edge/layout styles. Representative malformed
and semantic-owner variants remain separately authored security regressions.

The guide's local capture form reads raw `text/html` and `text/plain` from a user
paste and exports JSON with timestamp, browser string and self-reported application
version/OS. Store raw payload only as text; never assign it to innerHTML, fetch its
resources or upload it. Bound each payload to 5,000,000 code units before storing.
Capture metadata does not prove application origin. A sample viewer uses the safe
editor importer and labels its original source and known losses. Current browser
runs are separate from historical upstream source-application captures.

### Fresh native Google Docs capture

`google-docs-native-chrome.html` and `.txt` record actual native Cmd+C from
Google Docs on 2026-11-23T08:03:38.605Z in Google Chrome/macOS (exact versions
unknown). The non-sensitive sample is project-authored MIT content: three
paragraphs, explicit bold and one bullet item. Preserve raw HTML/plaintext bytes
and hashes; exclude private document/account URLs and Docs internal-slice MIME.
The manifest distinguishes this own capture from upstream Docs samples with
undocumented capture methods. Replay acceptance covers semantic list/paragraph
content, intentional bold versus neutral wrapper, canonical pt typography, known
plain-text block-separator losses and one-step selection/history restoration.
This narrow fresh capture is not a cross-version Google Docs certification.
