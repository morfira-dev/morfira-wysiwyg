# Independent Markdown codec

Status: accepted bounded implementation contract. Actual validation belongs to
verification-backlog.md; authored scenarios are not executed browser evidence.

## Composition and API

Expose `@morfira-dev/wysiwyg/codecs/markdown` with `parseMarkdown(source: string, options?: MarkdownCodecOptions):
EditorDocument` and `serializeMarkdown(document: EditorDocument, options?: MarkdownCodecOptions): string`.
Implementation belongs to optional plugins `codecs/markdown`, with a facade
entry, strict TypeScript and no third-party runtime dependency. Neither core,
typing shortcuts nor presets import it. These synchronous codecs use document
JSON and validation only: no DOM, network, global installation or editor mutation.
Import and calls must work without browser globals. Existing `/plugins/markdown`
remains the independently selected typing-shortcut module.

## Supported bounded syntax

Import paragraphs, ATX headings 1–6, thematic breaks, fenced plain code,
explicit blockquotes, ordinary nested bullet/decimal lists and simple pipe
tables with a delimiter/header row. Inline support covers backslash punctuation
escapes, strong/emphasis/strikethrough, backtick code, inline links/images with
bounded destinations and optional quoted titles, and explicit hard line breaks.
Normalize CRLF/CR. Ordinary soft paragraph line breaks become spaces. No claim of
full CommonMark/GFM conformance is made. Exact accepted nesting/delimiter grammar
and canonical output examples must be documented alongside implementation.

The initial grammar uses two-space list indentation (continuations remove two
spaces), ATX headings with a space after the marker, and backtick/tilde fences of
at least three identical characters with matching closing runs. Inline code uses
equal-length backtick runs. If its body has one ASCII space at both edges and
contains a nonspace character, strip exactly one space from each edge; canonical
export pads edge backticks and intentional paired edge spaces to preserve them.
All-space code bodies remain literal; empty inline-code wrappers export no text.
Links support angle-wrapped destinations or unquoted balanced-parenthesis
destinations and optional double-quoted titles. Backslash escapes accept ASCII
punctuation, including angle brackets, ampersands and table pipes. A trailing
backslash or at least two spaces produces a hard line break; soft breaks become
spaces. Pipe table rows have one fixed column count and a delimiter header with
at least three hyphens per column; colon alignment hints persist only with the explicit `tableAlignment` option.
Parsing has a bounded scan-work budget of 32,000,000 units; exceptionally dense
or adversarial syntax may reject rather than repeatedly rescan source indefinitely.
Link labels balance square brackets up to the nesting bound and skip matched
inline-code spans; image labels inside links are supported, while nested links
are kept literal. Backslashes inside code are literal and do not escape its
closing delimiter.

Raw HTML is literal text, never parsed or executed. The extended authoring profile
below defines reference links, angle autolinks, entity decoding and opt-in task metadata.
Math, footnotes and extended directives are not interpreted. Code-fence language info is not persisted by schema v1.
Unsafe link/image destinations degrade to visible label/alt text with no URL.

Export canonical Markdown from validated schema-v1 nodes. Preserve ordinary
supported text, marks, blocks, list nesting/start, links/images and simple tables.
Escape literal syntax so export cannot turn user text into raw HTML, links or
accidental block structure on reimport. Use safe delimiter/fence lengths for code.
Drop unsupported visual styles and attributes explicitly: colors, fonts, layout,
direction, list marker/reversed settings, image dimensions, table sizing and
presentation are not Markdown metadata. Underline/sub/sup/spans export their
text; figure captions become separate paragraphs. No embedded HTML fallback.
Merged/nested tables and unregistered semantic nodes must reject explicitly
rather than silently flatten structural/identity-bearing data. Simple table
export uses the first row as its Markdown header; arbitrary TH placement is not
preserved. JSON validation occurs before export, including URL/resource checks.

Canonical export uses `**strong**`, `*emphasis*`, `~~strike~~`, ATX headings,
`---` thematic breaks and two-space list continuation/nesting. Ordinary text
escapes ASCII punctuation. Inline backtick fences exceed every contained run;
when content touches a backtick fence, one space is padded at each edge. Import
removes one paired edge-space only when the body is not entirely spaces; export
also pads intentional paired edge-spaces so their content survives. Empty inline
code/empty formatting wrappers and empty paragraphs have no standalone Markdown
identity. Multiline inline-code nodes and multiline headings reject. Block code retains content through
one structural newline before its closing variable-length fence.

Pipe table export requires a rectangular grid of at most 100 rows/columns, with
one inline flow or one paragraph per cell and no BR/newline or structural child;
unsupported rich/multiline cells reject rather than emitting malformed table rows.
Table captions become separate paragraphs. Ordered starts must be integers from
0 through 999999999; negative or ten-digit starts reject. Every item may
repeat the list's initial marker; the importer owns the sequential list counter.
Link/image destinations use angle syntax and percent-encode angle brackets,
backslash and pipe. Attribute title/alt whitespace is normalized to spaces.
Nested anchor descendants reject on export; linked images and code inside labels
use the bounded balanced-label grammar. Canonical hard breaks use backslash plus
newline, retaining consecutive/trailing breaks as nonblank source lines. Ordinary
block-edge whitespace and empty-paragraph identity may normalize under Markdown.

## Resource and application boundaries

Bound source/output to 1,000,000 UTF-16 code units, codec nodes to 10,000 and
recursive nesting to 32. Enforce limits while constructing/scanning, before
unbounded recursion/output allocation; avoid pathological delimiter rescans.
Reject oversized/malformed API values without mutating any editor or input object.
The core's own normalized-document validation remains authoritative as well.

Applications choose replacement via `editor.setJSON(parseMarkdown(source))`
(external replacement clears history) or insertion via
`editor.insertHTML(editor.schema.documentHTML(parseMarkdown(source)))` (existing
selection, readonly/composition and atomic history rules). Export is observational.
Frontend validation does not replace backend content validation or CSP; rendering
validated images can load their allowed URLs, whereas codec-only calls never do.

## Acceptance, examples and measurement

Representative three-browser definitions cover supported syntax and canonical
round trips, literal/escaped HTML, unsafe URLs, code delimiter collisions, nested
lists/quotes, simple tables and merged refusal, limits, nonmutation and actual
editor integration/history. Add DOM-free runtime fixtures/SSR coverage for later
execution, public type fixtures and packed-consumer/selective-import coverage.
Do not multiply the existing shortcut matrix. Add RU/EN docs and homepage/demo
input, explicit import/insert/export controls, sample and clear loss boundaries.

Measure raw/gzip/Brotli independently, no CSS added. Use a 15000 gzip JS byte
guard for this standalone entry including its selected shared closure; the
product optional-entry envelope remains 150000. Do not install the codec into
standard/extended profiles or claim its bytes are included in them. Package,
types, selective-import, size and docs builds may run; local behavioral tests and
CI observation are paused by the user's explicit instruction for this stage.

Report both plugin-package chunks and a standalone public consumer bundle that
includes selected core validation helpers, with the same 15000 gzip guard for
the latter. The existing all-plugins behavior aggregate excludes independent
codecs; its boundaries must not silently expand when the new entry is added.

## Fence regression — 2026-11-19

A backtick fence info string cannot contain backticks. A paragraph consisting of a variable-length inline code span, including embedded backticks or a trailing backslash, must remain inline during export/import; it must not consume subsequent blocks as an opening fence. Existing code-delimiter round-trip coverage is the regression scenario.

## Extended authoring profile — 2026-11-23

The existing function signatures remain valid. Both additionally accept copied,
validated `MarkdownCodecOptions { taskLists?: boolean; tableAlignment?: boolean }`,
with both flags false by default. The extended ordinary grammar is enabled without
options: setext headings, indented code blocks at block boundaries, reference link
and image definitions (full/collapsed/shortcut references), safe angle URL/email
autolinks, numeric character references and a documented common named-entity set.
Raw HTML remains literal; no DOM parser or external engine is introduced.

Definitions use at most 999 UTF-16 units per label, normalized by collapsing
whitespace and Unicode lowercase; first definition wins. Same-line bounded URL
and optional single/double quoted or parenthesized title are supported. Definitions
inside code fences/indented code stay code. Definitions collected inside supported
quote/list containers share the document lookup. Multiline definitions/titles,
full Unicode case folding and the complete CommonMark block-container algorithm
are not claimed. Undefined references remain literal. Decode escapes/entities
before the existing URL policy, so encoded unsafe schemes never become links.

Character references require a semicolon. Numeric references handle Unicode
replacement/control mappings. Named references cover the documented common set,
not the full HTML5 entity catalog; unknown names remain literal. Code spans and
code blocks never decode entities. Emphasis observes whitespace/punctuation
flanking and refuses intraword underscore emphasis; arbitrary CommonMark delimiter
stack equivalence is not claimed.

With taskLists true, leading `[ ]`, `[x]` or `[X]` in ordinary bullet/ordered items
becomes the same `data-checklist-checked` LI metadata as the existing checklist
plugin. Codec validation registers only that lightweight declarative attribute
schema, not its runtime interaction/UI. Consumers install checklists when replacing
an editor value to retain and interact with task state. Export emits canonical
`[ ]` / `[x]` before item text. Without the option markers stay literal.

With tableAlignment true, delimiter colons become bounded per-cell text-align
styles; export emits column alignment only when its cells agree, and rejects
mixed per-column alignment instead of silently guessing. Other table styling
continues to be lossy. Existing source/node/depth/work/output budgets and the
standalone 15000 gzip guard remain in force.

Primary syntax references: CommonMark 0.31.2 (https://spec.commonmark.org/0.31.2/)
and GFM 0.29 (https://github.github.com/gfm/). Regression inputs are independently
authored examples based on those published rules, not copied parser code or a
claim of official conformance. Actual checks and unsupported cases are recorded
separately from the existence of this implementation contract.

The accepted named character references (case-sensitive, semicolon required) are:
`amp AMP lt LT gt GT quot QUOT apos nbsp copy reg trade euro pound yen cent
ndash mdash hellip middot bull laquo raquo lsquo rsquo ldquo rdquo times divide
plusmn deg micro para sect shy ensp emsp thinsp eacute Eacute aacute Aacute
agrave Agrave ouml Ouml uuml Uuml auml Auml szlig`. Decimal numeric references
accept at most eight digits and hexadecimal references at most six; invalid Unicode
scalars become U+FFFD. Unknown references remain literal. Escaped ampersands are
not decoded a second time.

Delimiter support includes Unicode whitespace/punctuation flanking, literal
intraword underscores, nested distinct strong/emphasis/strike and triple emphasis.
This bounded recursive delimiter profile does not implement the complete CommonMark
delimiter-stack algorithm or its rule-of-three ambiguity resolution. Unsupported
ambiguous arrangements may preserve literal markers instead of matching another parser.

Canonical emphasis now uses asterisks so emphasis next to ordinary letters remains
representable while intraword underscores correctly remain literal on import.

Inline import coalesces adjacent ordinary text fragments, including refused URL
label/alt fallbacks, so canonical round trips preserve JSON text-node boundaries.
