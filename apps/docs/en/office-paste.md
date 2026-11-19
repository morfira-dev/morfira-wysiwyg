# Pasting from Word, Excel and Google Docs

Paste uses the shared safe HTML importer. This slice adds bounded normalization of common Office markup; it does not promise an exact reproduction of every application document or version. New browser regressions are authored but have not been run locally at the user's request. Actual system clipboard captures and application-version checks remain a separate stage.

## What survives

| Source | Supported input | Result and limitations |
| --- | --- | --- |
| Word | Adjacent `p` elements with explicit inline `mso-list:lN level1…9 lfoN` and a descendant `span` with `mso-list:Ignore` | Recognized decimal `1.` / `1)` labels and `· • ○ ▪ ■ o` bullets become ordinary `ol` / `ul`. The first entry must start at level 1; depth grows by at most one level per item. The initial number survives; numbering discontinuity starts a new list. Unknown labels and depth jumps remain paragraphs. |
| Google Docs | A `b` with `id="docs-internal-guid-…"` and explicit inline `font-weight:normal` or `400` | The service wrapper is removed without turning the whole text bold. The service wrapper's own styles are discarded. Real nested `b` / `strong`, headings, lists and permitted links use ordinary import. Arbitrary `b` elements are not considered service wrappers. |
| Excel | An HTML table with permitted `rowspan` / `colspan` | Cell content, supported formatting and merged cells survive. Classes, formulas, calculations and stylesheet rules are not imported. Geometry and print layout are not reproduced. |
| Excel / another tabular source | Tab-separated text in a selected table cell with `tables()` installed | Existing TSV import understands quoted fields, embedded tabs/line breaks and escaped double quotes. This imports values, without formulas; outside a table context TSV does not automatically create a table. |

These are markup recognition rules, not installed-application detection. Identical markup is handled identically regardless of its source. Classes, stylesheets and application preferences are not evaluated. Existing permitted inline styles survive within the schema's limits. Office font sizes in `pt` are not automatically converted to supported units.

## Try it

On the [homepage](/en/#editor) and in the [laboratory](/en/playground), expand “Office application paste”. Three buttons replace the document with an empty paragraph and dispatch a demonstration `paste` event; one Undo reverts the paste. Samples are hand-authored and explicitly identified as synthetic. No system clipboard permission, external application or network request is required.

For a real clipboard, copy a fragment in the source application, place the caret in the editor and press Ctrl/Cmd+V. The result depends on the HTML supplied by the application and browser. Select a table cell for TSV paste. Save any demo content you need first: loading a sample replaces the document.

## Setup and API

Normalization belongs to the core HTML codec, without additional runtime dependencies or a separate plugin. It is shared by `schema.parseHTML`, `sanitizeHTML`, `setHTML`, `insertHTML` and ordinary HTML paste. The JSON contract is unchanged: output uses existing safe schema-v1 nodes. Install the ordinary [table plugin](/en/plugins) for table editing and range paste into tables.

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

Markup is parsed inertly and then passes ordinary reconstruction of allowed nodes/attributes. Office-specific CSS declarations do not become persisted styles. Scripts, event handlers, foreign namespaces, unsafe URLs and arbitrary CSS are discarded; shared document resource limits apply. Permitted images may still load their URL when actually rendered — host restrictions, CSP and backend validation remain application responsibilities. See [security](/en/security).

This slice does not read `.docx` / `.xlsx` files, Office XML, RTF, special MIME types, numeric CF_HTML offsets or CSS `@list` rules. Formula, comment, tracked-change, footnote, page-break, exact typography and full LibreOffice compatibility are not claimed. Unrecognized lists retain their text instead of guessing structure. Real Word/Excel/Google Docs versions and further formats must populate a separate matrix of evidenced scenarios.
