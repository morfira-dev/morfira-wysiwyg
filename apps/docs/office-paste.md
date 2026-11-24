<script setup lang="ts">
import OfficeCorpusExample from './.vitepress/theme/OfficeCorpusExample.vue';
</script>

# Pasting from Word, Excel and Google Docs

Paste uses the shared safe HTML importer. This slice adds bounded normalization of common Office markup; it does not promise an exact reproduction of every application document or version. Actual executed checks are recorded in the project verification log. The external corpus below now includes documented historical Word/Excel captures, a fresh native Google Docs capture and separate upstream Docs samples; a current application/version matrix remains separate.

## What survives

| Source | Supported input | Result and limitations |
| --- | --- | --- |
| Word | Adjacent `p` elements with explicit inline `mso-list:lN level1…9 lfoN` and a descendant `span` with `mso-list:Ignore` | Recognized decimal `1.` / `1)` labels and `· • ○ ▪ ■ o` bullets become ordinary `ol` / `ul`. The first entry must start at level 1; depth grows by at most one level per item. The initial number survives; numbering discontinuity starts a new list. Unknown labels and depth jumps remain paragraphs. |
| Google Docs | A `b` with `id="docs-internal-guid-…"` and explicit inline `font-weight:normal` or `400` | The service wrapper is removed without turning the whole text bold. The service wrapper's own styles are discarded. Real nested `b` / `strong`, headings, lists and permitted links use ordinary import. Arbitrary `b` elements are not considered service wrappers. |
| Excel | An HTML table with permitted `rowspan` / `colspan` | Cell content, supported formatting and merged cells survive. Classes, formulas, calculations and stylesheet rules are not imported. Geometry and print layout are not reproduced. |
| Excel / another tabular source | Tab-separated text in a selected table cell with `tables()` installed | Existing TSV import understands quoted fields, embedded tabs/line breaks and escaped double quotes. This imports values, without formulas; outside a table context TSV does not automatically create a table. |

These are markup recognition rules, not installed-application detection. Identical markup is handled identically regardless of its source. Classes, stylesheets and application preferences are not evaluated. Existing permitted inline styles survive within the schema's limits. Explicit inline `font-size` in points is converted to CSS pixels using `1pt = 4/3px`: `12pt` → `16px`, `11pt` → `14.667px`. Unsigned decimal values with up to four integer and three fractional digits are accepted only when the rounded result fits `0…9999.999px`. Values with signs, exponents, functions or `!important` are not converted. Declaration order and existing supported units remain unchanged. Semantic SDK subtrees are not normalized by this rule. Direct JSON `pt` values remain unsupported; HTML import stores canonical `px`. This does not load fonts or restrict imports to the font plugin’s configured toolbar choices.

## Try it

On the [homepage](/#editor) and in the [laboratory](/playground), expand “Office application paste”. Three buttons replace the document with an empty paragraph and dispatch a demonstration `paste` event; one Undo reverts the paste. Samples are hand-authored and explicitly identified as synthetic. No system clipboard permission, external application or network request is required. The Word sample includes `12pt` → `16px`; an Excel cell includes `11pt` → `14.667px`.

For a real clipboard, copy a fragment in the source application, place the caret in the editor and press Ctrl/Cmd+V. The result depends on the HTML supplied by the application and browser. Select a table cell for TSV paste. Save any demo content you need first: loading a sample replaces the document.

## Setup and API

Normalization belongs to the core HTML codec, without additional runtime dependencies or a separate plugin. It is shared by `schema.parseHTML`, `sanitizeHTML`, `setHTML`, `insertHTML` and ordinary HTML paste. The JSON contract is unchanged: output uses existing safe schema-v1 nodes. Install the ordinary [table plugin](/plugins) for table editing and range paste into tables.

```ts
import { createEditor } from '@morfira-dev/wysiwyg';

const editor = createEditor(document.querySelector<HTMLElement>('#editor')!);

editor.insertHTML(
  '<p style="mso-list:l0 level1 lfo1">' +
  '<span style="mso-list:Ignore">1. </span>First item</p>',
);
```

Use `insertHTML` for a change covered by history. `setHTML` is an external document replacement and clears history under the ordinary API contract. Paste retains existing target/selection, read-only and composition restrictions; Office normalization does not enable previously unsupported structural replacements.

## Security and boundaries

Markup is parsed inertly and then passes ordinary reconstruction of allowed nodes/attributes. Office-specific CSS declarations do not become persisted styles. Scripts, event handlers, foreign namespaces, unsafe URLs and arbitrary CSS are discarded; shared document resource limits apply. Permitted images may still load their URL when actually rendered — host restrictions, CSP and backend validation remain application responsibilities. See [security](/security).

This slice does not read `.docx` / `.xlsx` files, Office XML, RTF, special MIME types, numeric CF_HTML offsets or CSS `@list` rules. Formula, comment, tracked-change, footnote, page-break, exact typography and full LibreOffice compatibility are not claimed. Unrecognized lists retain their text instead of guessing structure. Real Word/Excel/Google Docs versions and further formats must populate a separate matrix of evidenced scenarios.

## External corpus: provenance and measured losses

<OfficeCorpusExample />

| Sample | Provenance | Preserved / deliberately lost |
| --- | --- | --- |
| Word Windows / Edge, Word Mac / Safari | [Jodit real clipboard tests](https://github.com/xdan/jodit/blob/39c0ac9943124205e4e7c3551eb16754ef5ed2a5/src/plugins/paste-from-word/paste-from-word.test.js), MIT, upstream-trimmed; Word 16.113 is identified in its comment, OS/browser versions and capture date unknown | Nested ordinary bullets include explicitly font-qualified Wingdings `§`. Alphabetic/Roman labels remain literal text; class stylesheets and page layout are discarded. |
| Excel 365 16.0.20430.20092 | [gridclip capture protocol](https://github.com/fillddak/gridclip/blob/e6e315c6c46e3c7ff37ebf390dcc344643dcb4a6/test/fixtures/REAL-CAPTURES.md), MIT; Windows 11 / Korean locale / headed Chromium 141, 2026-10-01; upstream anonymized temporary-path username | Real horizontal/vertical merges, Korean text, displayed values, emoji and literal escaped HTML survive. `mso-ignore:colspan` overflow becomes a separate empty cell rather than a false merge. Hidden rows were absent from the original clipboard; formulas, number-format rules and stylesheet layout are not recovered. |
| Google Docs — project native capture | 2026-11-23, 08:03:38.605 UTC, Google Chrome / macOS; browser and OS versions unknown, Docs uses an unpinned rolling web version. Project-authored non-sensitive MIT text, actual Cmd+C; private document URL and internal-slice MIME excluded | Three paragraphs, a semantic bullet list and intentional bold survive. `11pt` → `14.667px`; exact spacing/indentation and service attributes are discarded. Editor text extraction need not reproduce every block-separator newline in the original `text/plain`. |
| Google Docs table / BIU formatting | [Lexical clipboard samples](https://github.com/facebook/lexical/tree/dc8cfac3c08f7d4bd4eff86a63089b4a88fae0e5/packages/lexical-playground/src/__tests__/browser), MIT; original capture method/date/OS/browser not documented | Neutral wrapper is removed, safe table/text/inline typography survives. Bounded numeric colgroup widths survive; per-edge borders, pt padding and exact line spacing are not reproduced. This is an upstream application sample, not independently verified fresh Docs capture. |

Original payloads, SHA-256 hashes, transformations and MIT notices are kept together
in `tests/fixtures/office`. The Word payloads are cooked string literals extracted
without executing upstream tests; Excel bytes (including CRLF) are preserved exactly
as published. No external editor implementation is used.

Only an ordinary TD under TR with explicit decimal colspan 2–1000, no rowspan
beyond 1 and no semantic SDK ownership qualifies for Excel overflow expansion.
Source-node and final document/grid budgets still apply. A `§` without explicit
Wingdings ancestry remains text. These rules do not enable arbitrary CSS evaluation.

The capture form reads actual paste MIME data and downloads local JSON with a
timestamp, browser string and self-reported application/version/OS. HTML is shown
only as text and never executed or uploaded. Each MIME string is bounded to
5,000,000 code units. Saving metadata does not independently prove app origin.
Review a capture before adding it to a shared corpus; no broad Office certification
is implied by replaying these samples in three browser engines.
