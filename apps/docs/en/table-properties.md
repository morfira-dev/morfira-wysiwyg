# Table and cell properties

Optional `tableProperties()` adds table width/placement, first-row/column headers, a caption, minimum row height and selected-cell background, border color and vertical alignment. Independent `createTablePropertiesForm()` supplies ready controls. Core, the standard/contextual toolbar and presets do not install these modules automatically.

On the [homepage](/en/#editor) and [playground](/en/playground), find the form in the Tables section. Click a cell or select a logical rectangle, edit fields and choose Apply properties. For a rowspan example, open Contextual table, choose Load contextual table sample and Select 2 × 2 region. Styling retains actual cells; header conversion changes only TD/TH wrappers, preserving content and spans. One form submission is one Undo.

## Installation

The form host must be an empty connected HTML element in the editor’s document, outside persisted content. Install table behavior before properties. Import CSS explicitly; this form uses existing `/ui/forms.css` without an additional stylesheet.

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { tables, tableCommands } from '@morfira-dev/wysiwyg/plugins/tables';
import { tableProperties, tablePropertyCommands } from '@morfira-dev/wysiwyg/plugins/table-properties';
import { createTablePropertiesForm } from '@morfira-dev/wysiwyg/ui/table-properties';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/plugins/tables.css';
import '@morfira-dev/wysiwyg/ui/forms.css';

const editor = createEditor(editorHost, {
  locale: 'en',
  value: '<table><tbody><tr><td><p>Alpha</p></td><td><p>Beta</p></td></tr><tr><td><p>Gamma</p></td><td><p>Delta</p></td></tr></tbody></table>',
  plugins: [tables(), tableProperties()],
});
const form = createTablePropertiesForm(propertiesHost, editor, {
  onError: (error) => console.error(error),
});

// After the user chooses the actual table/cells:
tableCommands(editor).select({ row: 0, column: 0 }, { row: 0, column: 1 });
const properties = tablePropertyCommands(editor);
properties.update({ width: '75%', alignment: 'center', cellVerticalAlign: 'middle' });
const state = properties.getState();
// On unmount: form.destroy() first, then editor.destroy().
```

With standard/extended, pass `plugins: [tableProperties()]` to the preset factory: application plugins install after built-in tables. Mount the form independently. A runtime flag cannot tree-shake a module already imported. Commands do not require UI.

## Command values and state

| Patch field | Accepted values | Scope |
| --- | --- | --- |
| `width` | Integer `40–4000px` or `1–100%` string; `false` resets | Whole current table |
| `alignment` | `left`, `center`, `right`, `false` | Physical table placement through margin-left/right |
| `cellBackground` | A bounded safe color or `false` | Selected actual cells |
| `cellBorder` | A bounded safe color or `false` | Selected cells’ border color; width/style are unchanged |
| `cellVerticalAlign` | `top`, `middle`, `bottom`, `false` | Selected actual cells |
| `headerRow` | `true` / `false` | First logical row of the whole table |
| `headerColumn` | `true` / `false` | First logical column of the whole table |
| `caption` | Literal text up to 5000 characters; empty string / `false` removes | Native caption of the whole table |
| `rowMinHeight` | Canonical integer `1–1000px` string; `false` resets | Every logical row touched by the selected cell rectangle |

Table placement is not text alignment. Left/center/right may look identical at 100% width. Resetting width removes owned CSS width and the legacy TABLE width attribute; any width write also removes that attribute. Resetting placement removes both margins. Color/vertical reset removes only the corresponding own declaration, without clearing computed theme styles.

Colors are limited to 100 characters: hex, supported names, numeric rgb/rgba/hsl/hsla and browser parsing. URLs, var(), arbitrary functions, escapes, extra declarations and `!important` are rejected. Returned colors use browser-canonical explicit values. The entire patch is validated before mutation: unknown keys, explicit `undefined`, arrays and unsupported values throw without a partial result. Empty/idempotent patches do not add history or clear redo.

`getState()` returns `disabled`, `width`, `alignment`, `cellBackground`, `cellBorder`, `cellVerticalAlign`, `headerRow`, `headerColumn`, `caption` and `rowMinHeight`. Missing explicit values are `false`; differing selected-cell styles or row heights are `mixed`. Header axes are booleans, caption is a string or `false`. These are persisted values, not computed theme CSS. Safe imported width/row-height units may lie outside the narrower command choices: state reports the stored string and unrelated updates leave it untouched. CSS width takes precedence over a legacy numeric width attribute.

## Minimum row height

```ts
properties.update({ rowMinHeight: '80px' });
const minimum = properties.getState().rowMinHeight; // string | false | 'mixed'
properties.update({ rowMinHeight: false }); // remove only TR inline height
```

The property writes native `TR.style.height`, which acts as a **minimum** in CSS table layout. It does not clip content, insert spacer text or set per-cell heights. Content, cell padding, spanning cells and host/table layout may make the rendered row taller; this is not a promise of an exact pixel height. Resetting leaves cell heights/styles and the table height unchanged.

All actual rows in the selected logical rectangle receive the value, regardless of selected columns. A caret in a cell with `rowspan="2"` affects both covered rows. Other rows, caption, sections, headers and actual content nodes stay unchanged. The whole patch remains one Undo, including when combined with cell/table properties. Only canonical strings from `1px` to `1000px` are accepted: no whitespace, decimals, leading zero, other units, CSS keywords, declaration injection or `!important`.

On the homepage or playground, load **Tables**, click the first body cell spanning two rows and enter `80px` in **Minimum row height (1–1000px)**. Apply changes both body rows; the header row is unaffected. An empty field resets the owned height, while differing row values use the Mixed values placeholder. Imported safe values such as `2em` remain visible and survive unrelated edits, but an explicit height write must use the narrower px syntax. New runtime definitions are authored and have not been executed locally in the current work mode.

## Headers and caption

After selecting a cell, enable headers and update the caption in one patch:

```ts
properties.update({
  headerRow: true,
  headerColumn: true,
  caption: 'Release plan <literal text>',
});
properties.update({ headerRow: false }); // retain the header column
properties.update({ caption: false }); // remove only the caption
```

Commands affect the first **logical** row/column of the whole current table, regardless of the selected rectangle. Headers become `th` with `scope="col"` for the row and `scope="row"` for the column; the intersection uses `col`. Enabling a header row requires at least one following body row; a header column requires a following body column. Disabling one complete axis retains the other at the corner. Partial imported axes report `false` and are normalized only when explicitly written. Rows never move between THEAD/TBODY/TFOOT.

If a row write includes a first-row `rowspan > 1`, or a column write includes a first-column `colspan > 1`, **the entire patch rejects**: that cell crosses the header/body boundary. Merges entirely within an axis remain intact, without automatic splitting. Table, row and unaffected-cell identities survive. A `td`/`th` conversion changes only the cell wrapper; actual child nodes, rich formatting, styles and spans are moved, while selection and Undo are retained.

The caption is a real direct `caption` before the table’s other children. Its text is limited to 5000 UTF-16 units and assigned through `textContent`, so HTML-like input stays literal; whitespace is not trimmed. The multiline form control preserves line breaks; Enter adds a line instead of submitting, so use Apply for changes. Existing rich caption children survive when the requested text matches. Empty string or `false` removes it. Duplicate direct captions are unsupported. A caret only in the caption is not a cell selection: select a cell or use the form’s retained target. These are basic native semantics, without universal complex multi-level header associations or a claim of complete accessibility.

On the homepage or playground, load the Tables sample: it contains a header row, caption and first-column rowspan. In Tables, enable Header column, edit Table caption and apply; one Undo restores the whole patch. New browser definitions are authored but not executed locally in the current work mode.

Customize the caption on the editor container; styles are scoped to `.mw-content table > caption`:

```css
.my-editor {
  --mw-table-caption-padding: .5em 0;
  --mw-table-caption-color: var(--mw-muted);
  --mw-table-caption-font-size: .9em;
  --mw-table-caption-align: start;
}
```

## Form drafts and localization

The controller exposes `element`, `refresh()`, `getValues()`, `setValues(partial)`, and idempotent `destroy()`. Value fields are strings: `width`, `alignment`, `cellBackground`, `cellBorder`, `cellVerticalAlign`, `headerRow`, `headerColumn`, `caption`, `rowMinHeight`. Header selects use `"true"` for on and an empty string for off; an empty caption removes it and an empty row height resets it. Caption whitespace is retained. `getValues()` includes the new fields; update application-owned exact snapshot comparisons. setValues changes only the draft and marks supplied fields dirty, without editing the document.

Apply sends **only dirty fields**. Mixed colors show an empty control with the Mixed values placeholder; editing width alone preserves differing cell colors. A successful Apply reloads authoritative values. Locale/read-only refresh preserves a draft for the same target; switching tables or replacing the document discards stale drafts and authority.

Native labels, select options, statuses and mixed state use the editor’s RU/EN locale and exported `tablePropertiesFormMessages`. Overrides under `ui.tableProperties.*` render as text; `options.label` supplies an application-owned text label. onError may return `void` or `Promise<void>`; its own failures do not leak rejections. Enter in text inputs applies; IME/229 Enter does not. Missing eligible targets, read-only and composition disable controls. Editor destruction cleans up automatically; explicit earlier disposal is also supported.

## Selection, persistence and limits

Targets are one native cell Range or an actual complete logical rectangle, including rowspan/colspan. Nested, foreign, semantic, protected, incomplete/overlapping grids and ambiguous cross-cell native ranges cannot authorize edits. Spoofed data-mw-selected attributes are not selection authority. The form retains its target while its controls own focus, then revalidates after focus restoration; replacement, changed node identities, read-only/IME or disposal cannot redirect an old draft to another table.

Schema version stays 1 with a narrow additive codec extension: only TABLE keeps margin-left/right `0px | auto`, and only TD/TH keeps vertical-align `top | middle | bottom`. Full-document HTML/JSON roundtrips retain these properties without the optional plugin installed. Older readers can discard the additions; version 1 does not promise lossless older-reader compatibility.

Rectangle clipboard creates a fresh TABLE: copied cells retain their `th`/scope semantics, colors and vertical alignment, but the caption, table width/placement and TR height are not copied, even for an all-cell rectangle. Full-document HTML/JSON already retains `caption`, `th scope` and bounded TR height styles without the properties plugin; schema version and the height allowlist are unchanged. Existing structural grid commands rebuild TR wrappers and therefore do not preserve row height. They retain surviving cells’ styles; inserted/split cells keep their existing defaults, and merge retains the origin cell’s style. Row-resize handles, padding, border width/style and Office fidelity are outside this slice.

Modules have independent selective imports and measured JS closures; CSS is separate and shared profile code is counted once. Current raw/gzip/Brotli values are in size-report.json and actual runs in the project verification record. No runtime dependencies, remote resources or new backend trust boundary are added; see [security](/en/security).
