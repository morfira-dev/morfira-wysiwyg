# Table and cell properties

Optional `tableProperties()` adds table width/placement and selected-cell background, border color and vertical alignment. Independent `createTablePropertiesForm()` supplies ready controls. Core, the standard/contextual toolbar and presets do not install these modules automatically.

On the [homepage](/en/#editor) and [playground](/en/playground), find the form in the Tables section. Click a cell or select a logical rectangle, edit fields and choose Apply properties. For a rowspan example, open Contextual table, choose Load contextual table sample and Select 2 × 2 region. Properties retain actual nodes, content and spans; one form submission is one Undo.

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
  value: '<table><tbody><tr><td><p>Alpha</p></td><td><p>Beta</p></td></tr></tbody></table>',
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

Table placement is not text alignment. Left/center/right may look identical at 100% width. Resetting width removes owned CSS width and the legacy TABLE width attribute; any width write also removes that attribute. Resetting placement removes both margins. Color/vertical reset removes only the corresponding own declaration, without clearing computed theme styles.

Colors are limited to 100 characters: hex, supported names, numeric rgb/rgba/hsl/hsla and browser parsing. URLs, var(), arbitrary functions, escapes, extra declarations and `!important` are rejected. Returned colors use browser-canonical explicit values. The entire patch is validated before mutation: unknown keys, explicit `undefined`, arrays and unsupported values throw without a partial result. Empty/idempotent patches do not add history or clear redo.

`getState()` returns `disabled`, `width`, `alignment`, `cellBackground`, `cellBorder`, and `cellVerticalAlign`. Missing explicit values are `false`; differing selected-cell values are `mixed`. These are persisted inline values, not computed theme CSS. Safe imported width units may lie outside the narrower command choices: state reports the stored string and unrelated updates leave it untouched. CSS width takes precedence over a legacy numeric width attribute.

## Form drafts and localization

The controller exposes `element`, `refresh()`, `getValues()`, `setValues(partial)`, and idempotent `destroy()`. Value fields are strings: `width`, `alignment`, `cellBackground`, `cellBorder`, `cellVerticalAlign`; an empty string means reset. setValues changes only the draft and marks supplied fields dirty, without editing the document.

Apply sends **only dirty fields**. Mixed colors show an empty control with the Mixed values placeholder; editing width alone preserves differing cell colors. A successful Apply reloads authoritative values. Locale/read-only refresh preserves a draft for the same target; switching tables or replacing the document discards stale drafts and authority.

Native labels, select options, statuses and mixed state use the editor’s RU/EN locale and exported `tablePropertiesFormMessages`. Overrides under `ui.tableProperties.*` render as text; `options.label` supplies an application-owned text label. onError may return `void` or `Promise<void>`; its own failures do not leak rejections. Enter in text inputs applies; IME/229 Enter does not. Missing eligible targets, read-only and composition disable controls. Editor destruction cleans up automatically; explicit earlier disposal is also supported.

## Selection, persistence and limits

Targets are one native cell Range or an actual complete logical rectangle, including rowspan/colspan. Nested, foreign, semantic, protected, incomplete/overlapping grids and ambiguous cross-cell native ranges cannot authorize edits. Spoofed data-mw-selected attributes are not selection authority. The form retains its target while its controls own focus, then revalidates after focus restoration; replacement, changed node identities, read-only/IME or disposal cannot redirect an old draft to another table.

Schema version stays 1 with a narrow additive codec extension: only TABLE keeps margin-left/right `0px | auto`, and only TD/TH keeps vertical-align `top | middle | bottom`. Full-document HTML/JSON roundtrips retain these properties without the optional plugin installed. Older readers can discard the additions; version 1 does not promise lossless older-reader compatibility.

Rectangle clipboard creates a fresh TABLE: selected cells retain their colors/vertical alignment, but table width/placement are not copied, even for an all-cell rectangle. Structural commands retain surviving cells’ styles; inserted/split cells keep their existing defaults, and merge retains the origin cell’s style. Header/caption commands, row heights, padding, border width/style and Office fidelity are outside this slice.

Modules have independent selective imports and measured JS closures; CSS is separate and shared profile code is counted once. Current raw/gzip/Brotli values are in size-report.json and actual runs in the project verification record. No runtime dependencies, remote resources or new backend trust boundary are added; see [security](/en/security).
