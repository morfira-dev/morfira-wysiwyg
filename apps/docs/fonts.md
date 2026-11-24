# Font family and text size

On the [homepage](/#editor) or [playground](/playground), open **Font family and size** and click **Load font sample**. Loading replaces the document, resets history and selects the bold word. Apply/reset family and size independently; Undo/Redo preserve content and selection.

## Explicit installation

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { fonts, fontCommands } from '@morfira-dev/wysiwyg/plugins/fonts';
import '@morfira-dev/wysiwyg/style.css';

const editor = createEditor(host, {
  plugins: [fonts({
    families: [
      { id: 'system', label: 'System', family: 'system-ui, sans-serif' },
      { id: 'serif', label: 'Serif', family: 'Georgia, serif' },
    ],
    sizes: [14, 16, 24, 32],
  })],
  value: '<p>Select some text.</p>',
});
const text = fontCommands(editor);
editor.setSelection(0, 6);
text.setFamily('serif');
text.setSize(24);
```

`fonts()` is an optional zero-runtime-dependency plugin with no mandatory stylesheet of its own. Imports are SSR-safe; create the editor in a browser. Core and ready presets do not install the plugin automatically. Add `fonts()` through a preset's `plugins: [fonts()]` option. The full demo explicitly composes it this way; ready toolbar built-ins gain no font controls in this slice.

The public entry also exports `FontsOptions`, `FontFamilyOption`, `FontCommands` and `FontState`.

## Options and commands

Defaults are `system` → `system-ui, sans-serif`, `serif` → `Georgia, serif`, `monospace` → `monospace`; sizes are `[12, 14, 16, 18, 24, 32, 48]` px. Each explicitly supplied collection replaces its corresponding defaults.

`families` and `sizes` each contain 1–32 distinct choices. IDs are unique lowercase ASCII strings of 1–64 characters, starting with a letter and continuing with letters/digits/hyphens. A `label` is nonempty text up to 100 characters; `family` is a safe CSS value from the subset below. Sizes are distinct integers **8–96 px**. Unknown options, duplicates and malformed values reject; configuration is validated and copied at the `fonts(options)` factory call, before editor setup.

| Method | Result |
| --- | --- |
| `setFamily(id: string \| false)` | Applies a configured family by ID; `false` removes only inline font-family |
| `setSize(size: number \| false)` | Applies a configured px size; `false` removes only inline font-size |
| `getState()` | Fresh `{ disabled, family, size, familyMixed, sizeMixed }` snapshot |

`family` and `size` are **actual explicit CSS values**, not choice IDs or computed theme values. Missing properties report `false`; mixed selections have separate `familyMixed`/`sizeMixed` flags. A safe imported family/size may be absent from configured choices, such as `Arial, sans-serif` and `1.25em` in the demo. Do not replace that state with the first dropdown option. Local choice fields are command drafts, not a claim about the current formatting.

Commands use the current native selection. External controls must preserve and restore a valid range; the demo reuses its shared selection mechanism. Read-only/composition block mutations. Invalid arguments reject atomically; disabled commands leave selection, content and redo unchanged. Resolving the API without installation or retaining handles after destruction throws.

## Format, history and import

Core supports inline `fontFamily` and `fontSize` formats. Selected formatting retains marks, links, other styles and block structure; each application or reset is a separate history operation. At a caret it sets pending typing styles without a history entry until typing. Resetting one property retains the other; block styles and theme values remain inherited.

Safe `font-family` survives HTML/JSON/API/paste without the plugin and independently of configured choices. This additive schema-v1 support keeps the document version; older readers may strip the new style, so lossless older-reader compatibility is not promised. Existing allowed imported `font-size` units/range are not narrowed to command px: command choices do not redefine the import codec.

## Security and font loading

`font-family` is bounded to **256 characters and eight comma-separated names**. Simple ASCII CSS names, multiword names and simple single/double-quoted names, including generic families, are supported. Non-generic name case is retained; unquoted generic names normalize to lowercase. Insignificant whitespace/quotes normalize consistently. This is a bounded CSS subset, not a full font parser. For example, `Times New Roman, serif` normalizes to `"Times New Roman", serif`; explicitly quoted `"serif"` remains a family name rather than a generic keyword.

Empty parts, controls, escapes, comments, functions/parentheses, declaration delimiters and CSS-wide keywords are rejected. URLs, `var()` and arbitrary declarations are unsupported. Invalid imported declarations are filtered under the existing style contract; invalid configuration and command arguments reject before editing. Applications still own server-side validation of persisted content.

The plugin creates no `style`, `link`, `@font-face`, `FontFace` or font loader. It uses installed/system fonts or families already provided by the application. **The browser may fetch a font previously declared by application CSS** when text begins using it; applications own assets, CSP and licensing. Font assets are excluded from the plugin's measured size. Actual checks and sizes are recorded separately in the [roadmap](/roadmap#verification-and-limits).
