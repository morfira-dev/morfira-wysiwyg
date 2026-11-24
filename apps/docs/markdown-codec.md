<script setup>
import AdvancedMarkdownExample from './.vitepress/theme/AdvancedMarkdownExample.vue';
</script>

# Markdown import and export

The separate codec converts Markdown to schema-v1 `EditorDocument` and back. It is outside core and presets and does not install [Markdown typing shortcuts](/markdown). It uses TypeScript with no third-party runtime dependencies, works without DOM, and makes no network requests.

This is a bounded everyday-authoring dialect, without a claim of full CommonMark/GFM conformance. Current browser/example execution results and their limits are recorded under [testing](/testing).

## API and composition

```ts
import { parseMarkdown, serializeMarkdown } from '@morfira-dev/wysiwyg/codecs/markdown';

const value = parseMarkdown('# Heading\n\nA **bold** word.');
const source = serializeMarkdown(value);

// External replacement clears Undo/Redo.
editor.setJSON(value);

// Insertion uses the editor's existing selection, read-only and history rules.
editor.insertHTML(editor.schema.documentHTML(parseMarkdown('**Inserted**')));

// Export changes neither the document nor its history and works read-only.
const exported = serializeMarkdown(editor.getJSON());
```

`parseMarkdown(source: string, options?: MarkdownCodecOptions): EditorDocument` does not edit an editor. `serializeMarkdown(document: EditorDocument, options?: MarkdownCodecOptions): string` validates first and does not mutate its input. There is no automatic Markdown paste or global registration. Load the module with dynamic `import()` when needed; its JS is not added to standard editor profiles automatically. No additional CSS is required.

External synchronization through `setJSON` remains possible in a read-only editor. The demo disables user import/insert buttons in that mode and keeps export available.

## Supported syntax

| Feature | Input and result |
| --- | --- |
| Paragraphs and headings | Blank lines separate paragraphs; `#`–`######` followed by a space create headings. Ordinary soft paragraph line breaks become spaces. CRLF/CR are normalized. |
| Hard breaks | Two spaces or a backslash at end of line create `br`. |
| Lists | `-`, `*`, `+` and decimal `1.` / `1)` followed by a space; ordered starts survive. Nested items use two spaces per level; export uses the same indentation. |
| Quotes and rules | Explicit `>` and nested quotes; lines of at least three `-`, `*` or `_` create `hr`. |
| Code | Backtick runs for inline code; at least three backticks or `~` for fences. A closing fence uses the same character and is at least as long as its opener. Language information is not stored. |
| Marks | `**strong**`, `*emphasis*`, `~~strike~~` and supported underscore variants. Backslash escaping for ASCII punctuation. |
| Links and images | `[label](destination "title")`, `![alt](destination "title")`; destinations may be enclosed in `<…>`. Unsafe URLs degrade to visible label/alt text without a URL. |
| Simple tables | Pipe tables with a header and matching-column delimiter row. Escaped `\|` stays literal cell text. |

Inline code retains literal contents; exactly one pair of edge ASCII spaces around a nonblank code span is treated as separation and removed on import. The exporter adds this pair when backticks would collide at the boundary; all-space contents remain literal. Export chooses backtick/fence runs longer than conflicting runs in the contents. Table export treats the first row as the header; arbitrary `th` placement is not retained.

## Losses and refusals

The codec evaluates no HTML, CSS, formulas or external resources. Raw HTML remains literal text. Entities decode into data only; footnotes, math and extended directives are not interpreted. Export escapes literal Markdown markers and HTML punctuation.

Colors, fonts, ordinary text alignment, text direction, list marker/reversed settings, image dimensions and table presentation are lost. `u`, `sub`, `sup` and ordinary `span` export their contents; figure captions become separate paragraphs. Output never uses an HTML fallback. Arbitrary empty paragraphs and empty inline-code wrappers are not retained as distinct structure. Title/alt whitespace is normalized; `<`, `>`, `|` and backslash characters in exported URLs are percent-encoded. Negative and ten-digit ordered-list starts reject, as do multiline inline code and headings containing line breaks.

**Merged, nested and unsupported complex tables reject**, rather than silently flattening. Cells with several blocks or line breaks cannot be exported by this slice. Unregistered semantic nodes also cause an error: mention identity and plugin metadata cannot be assumed to survive Markdown export. Use editor JSON for exact storage.

## Security and limits

Input and output are capped at 1,000,000 UTF-16 code units, codec trees at 10,000 nodes and nesting at 32. Exceeding a limit rejects; final documents also pass ordinary schema validation. Import never parses raw HTML as DOM. A safe URL scheme does not imply a trusted destination; subsequently rendering an allowed image can load its URL.

Applications must handle exceptions and validate server-side. The codec does not replace CSP, upload authorization or server URL policy. Its functions do not alter an editor on error; changes happen only through explicit editor API calls.

## Extended profile

Setext headings (`===` and `---` after text), four-space/tab-indented code, link/image definitions `[guide]: /guide "Title"`, full `[label][guide]`, collapsed `[guide][]` and shortcut `[guide]` references are supported. Definitions are collected before inline parsing, so forward references work. The first definition wins; label case and repeated whitespace normalize. Labels are limited to 999 characters and definitions to 10,000; multiline definitions are unsupported. Definitions inside code remain code.

`<https://example.com>` and `<reader@example.com>` create safe links; bare URLs without angle brackets are not automatically linked. Numeric HTML references and a bounded named set decode into text/destinations before URL checks, so `java&#115;cript:` also rejects. Decoded `<script>` remains text; code contents never decode. Unknown entities stay literal. The case-sensitive named set requires semicolons:

`amp AMP lt LT gt GT quot QUOT apos nbsp copy reg trade euro pound yen cent ndash mdash hellip middot bull laquo raquo lsquo rsquo ldquo rdquo times divide plusmn deg micro para sect shy ensp emsp thinsp eacute Eacute aacute Aacute agrave Agrave ouml Ouml uuml Uuml auml Auml szlig`.

`***strong + emphasis***`, nested distinct marks and Unicode whitespace/punctuation flanking are supported. Intraword `snake_case_name` stays text. The complete CommonMark delimiter stack and every ambiguous combination are not implemented.

```ts
import type { MarkdownCodecOptions } from '@morfira-dev/wysiwyg/codecs/markdown';
const options: MarkdownCodecOptions = { taskLists: true, tableAlignment: true };
const value = parseMarkdown('- [x] Done', options);
const source = serializeMarkdown(value, options);
```

Both flags default to `false`. `taskLists` preserves `data-checklist-checked` on `li`; the receiving editor must install `checklists()`. Without the option, `[x]` is ordinary text and task metadata is not retained on export. `tableAlignment` preserves safe cell `text-align`; export requires consistent alignment throughout each column and rejects ambiguity. When `false`, alignment hints are lost as before. Unknown options and nonboolean values reject.

This profile follows the primary [CommonMark 0.31.2](https://spec.commonmark.org/0.31.2/) and [GFM](https://github.github.com/gfm/) specifications without claiming complete conformance. Regression fixtures are independently authored for this project. Existing limits, DOM-free execution and the separate 15,000 gzip JS byte guard remain; actual size comes from a measured build.

<AdvancedMarkdownExample />

## Demo

On the [homepage](/#editor) and [playground](/playground), expand **“Markdown: import and export”**. Edit the source and choose import, insert or export. Import replaces content and clears previous history; insertion can be undone once. Export writes back to the Markdown field. The shortcuts toggle continues to control typing conversions only.
