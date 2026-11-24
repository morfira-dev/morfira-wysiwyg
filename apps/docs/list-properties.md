# List properties

On the [homepage](/#editor) or [playground](/playground), open **List properties** and click **Load list properties sample**. Loading replaces the document, resets history and selects parts of two items backward. Fields are command drafts; separate state displays stored values.

## Explicit installation

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { listProperties, listPropertyCommands } from '@morfira-dev/wysiwyg/plugins/list-properties';
import '@morfira-dev/wysiwyg/style.css';

const editor = createEditor(host, {
  plugins: [listProperties()],
  value: '<ol><li>First item</li><li>Second item</li></ol>',
});
const lists = listPropertyCommands(editor);
editor.setSelection(1);
editor.transact(() => {
  lists.setStart(7);
  lists.setReversed(true);
  lists.setMarker('upper-roman');
});
```

The three example commands share one Undo revision. Presets do not install the plugin by default: explicitly pass `plugins: [listProperties()]`. The full demo composes it separately; ready toolbar built-ins gain no controls. There are no runtime dependencies, required CSS, counter engine or network requests. Imports are SSR-safe; editor creation requires a browser. Public types are `ListMarker`, `ListPropertyCommands` and `ListPropertyState`.

## Commands and stored state

| Method | Value |
| --- | --- |
| `setStart(number \| false)` | Integer `-2147483648…2147483647` on OL; `false` removes explicit start |
| `setReversed(boolean)` | Sets/removes the native attribute on OL only |
| `setMarker(ListMarker \| false)` | Applies a matching marker or removes only explicit list-style-type |
| `getState()` | Fresh `{ disabled, kind, start, reversed, marker }` |

`kind` is `'ordered'`, `'bullet'` or `false`. `start` is an explicit integer or `false`, `reversed` is boolean, and `marker` is the explicit enum or `false`. **Missing start remains `false`**, even when the browser computes a normal starting value of 1 or a reversed default from the item count. State does not substitute computed CSS, inherited markers or local draft fields for stored properties. `disabled` reflects container eligibility, read-only and composition; start/reversed additionally require `kind === 'ordered'`.

UL accepts `disc`, `circle`, `square`; OL accepts `decimal`, `lower-alpha`, `upper-alpha`, `lower-roman`, `upper-roman`. Imported CSS marker case and outer whitespace normalize; commands accept only exact lowercase enum values. A valid marker for the other kind is a no-op; invalid payloads reject atomically even on an unsupported current selection. Each actual change is one transaction/Undo; setting an existing value adds no history. Read-only and composition block commands. Missing installation and retained handles after destruction throw.

## Which list changes

Both native selection endpoints must resolve to one ordinary existing UL/OL and share the same cell boundary: both inside one cell or both outside cells. A caret inside a nested item targets its immediate container; a Range endpoint on UL/OL targets that container itself. Carets, backward ranges, several direct items, empty LI and list-level DOM offsets are supported. Root positions, different lists/levels/cells, owning semantics, foreign namespaces and malformed direct children disable the command.

**Properties apply to the entire resolved container**, even when only part of one item is selected. Attributes/style change on the actual list; item/text/branch nodes, task metadata and selection remain. Properties are not explicitly copied to child containers; ordinary CSS inheritance still applies. External controls must restore a valid range before activation; the demo uses its shared `run` helper.

## HTML, JSON and compatibility

`ol.start` follows the existing signed-32-bit contract. HTML reversed is presence-based: **`reversed="false"` means true** and normalizes to `reversed=""`; omission means false. JSON accepts only an empty string on OL; wrong tags/types/nonempty values reject before mutation. These properties and safe marker styles survive HTML/JSON/paste/history without installation. Schema stays v1; older readers may discard reversed/marker and change numbering.

Only the listed marker enum is allowed on matching UL/OL. Functions, URLs, `var()`, strings, escapes, custom counters and arbitrary declarations are unsupported. Invalid imported markers are filtered under the existing style contract; other safe styles remain. Applications still own server-side document validation.

Structural shallow clones retain attributes. Containers with explicit start or reversed are not automatically joined across independently specified numbering boundaries. UL/OL conversion drops incompatible marker values, while a new UL receives no start/reversed. **Numeric offsets after splitting, continued numbering across containers and reverse counters are not recalculated**: the browser uses retained attributes and actual items. `li.value`, deprecated `type`, `list-style-image` and `@counter-style` are not added. This is bounded container configuration, not an arbitrary counter system.
