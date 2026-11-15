# Text direction LTR / RTL

On the [homepage](/en/#editor) or [playground](/en/playground), open **Text direction** and load the multilingual sample. It replaces the document, resets history and selects backward through two adjacent Arabic/Hebrew/Latin paragraphs. External native buttons preserve selection; Undo/Redo restore changes.

## Explicit installation

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { textDirection, textDirectionCommands } from '@morfira-dev/wysiwyg/plugins/text-direction';
import '@morfira-dev/wysiwyg/style.css';

const editor = createEditor(host, {
  plugins: [textDirection()],
  value: '<p>مرحبا · שלום · Latin</p>',
});
editor.setSelection(1);
const direction = textDirectionCommands(editor);
direction.setDirection('rtl');
// Later: direction.setDirection(false) removes the explicit attribute.
```

The independent plugin is excluded from preset defaults and built-in ready toolbar controls. With a preset, use `plugins: [textDirection()]`; the full demo explicitly composes it this way. There are no runtime dependencies, mandatory CSS, listeners, custom bidi engine or data loading. Imports are SSR-safe; editor creation requires a browser. `TextDirection`, `TextDirectionCommands` and `TextDirectionState` are explicit public type exports.

## Command and state

`setDirection('ltr' | 'rtl' | false): void` applies an attribute to each target block. **`false` removes explicit dir and inherits the surroundings, rather than forcing LTR.** Direction does not change text-align, text, marks, links or Unicode character order.

`getState()` returns fresh `{ disabled, direction, mixed }`. `direction` is stored `'ltr'`, `'rtl'` or `false`, not computed CSS or detected language. Different explicit values, including absent versus `'ltr'`, produce `mixed: true` and `direction: false`; unsupported targets are disabled without mixed state. Reading changes neither document, selection nor history.

Invalid payloads reject before target eligibility, including unsupported selection and read-only. A valid unsupported target or already-equal value is a no-op without clearing redo/pending typing styles. Read-only/composition block mutations; external document synchronization remains allowed. Multiple targets change in one transaction/Undo; commands compose through `editor.transact`. Missing installation and retained handles after destruction throw.

## Which blocks change

Native Range endpoints resolve to the closest ordinary `p`, `h1`–`h6`, `pre`, `blockquote`, `li`, `td` or `th`. Carets, empty blocks, backward selections and consecutive sibling target blocks with one parent are supported. Both endpoint blocks are included even at zero offsets; only ASCII formatting whitespace may occur between siblings. Root/outside positions, different parents/levels, owning semantics and unsupported intervening nodes reject the whole operation.

Both endpoints and every target must share one closest cell or all be outside cells; crossing cells, including a merged grid, is unsupported. Resolution never crosses `ul`/`ol`/`table`/`tr`/`figure`/caption wrappers to reach an outer LI or TD. A paragraph inside an item targets that paragraph; bare item text targets LI. **Ranges through inner paragraphs of different LI are unsupported** because their parents differ; ordinary sibling LI targets are supported.

The container changes while its child nodes remain. Inheritance may affect descendants without overrides; the command does not recurse through branches. External UI must restore a valid selection before activation; the demo reuses its shared `run` helper. Undo/Redo and subsequent typing follow existing bounded editing contracts, not arbitrary structural replacement support.

## Import, security and limits

The tag set refers to canonical schema tags after existing HTML aliases: `div dir="rtl"` may become `p dir="rtl"`; JSON still requires a canonical tag. Paste retains an incoming wrapper’s `dir` when its insertion profile retains that wrapper. Single-paragraph content insertion or merging the first block into a destination keeps the destination direction and may discard the removed wrapper’s `dir`. Inline bidi wrappers are not created automatically.

Schema v1 retains `dir="ltr"`/`"rtl"` on `p`, `h1`–`h6`, `pre`, `blockquote`, `ul`, `ol`, `li`, `td` and `th`, without the plugin. HTML normalizes case/outer whitespace and filters invalid values or other tags. JSON accepts only canonical lowercase strings on these tags; invalid tags/types/values reject before document/history/notification changes. Older readers may remove dir and change display; lossless compatibility is not promised. **JSON-boundary change:** an own `dir` key with an invalid tag/type/value could previously be filtered as an unknown attribute; it is now recognized and rejected atomically. JSON must use canonical `ltr`/`rtl`; HTML normalization remains a separate import contract.

Clone-based Enter/splits retain dir. Enter at the end of an ordinary heading also copies its validated explicit dir to the new paragraph. Existing whole-block retagging, paragraph↔item, UL↔OL and Markdown conversions copy only validated dir when both tags support it, without arbitrary attributes/metadata. Lists with different explicit directions cannot merge and discard a boundary.

When list formatting or supported first-body Backspace exits a root item and unwraps its existing paragraph/heading bodies, LI direction is copied only to immediate preserved P/H bodies without an explicit dir. Existing body overrides are never replaced and nested branches are not updated recursively. In the separate existing Enter exit from an item containing one empty body, that body is flattened into a paragraph; its explicit dir takes precedence over LI direction while the existing output shape remains unchanged.

These bounded exit paths are not a direction-propagation guarantee for arbitrary joins, structural deletion or nested wrapper removal. Other operations retain their own document rules.

No `dir=auto`, inline wrappers, `bdi`/`bdo`, CSS `direction`/`unicode-bidi`/`writing-mode`, automatic language detection or Unicode-control conversion is added. **Native Unicode bidi remains browser-owned**; this feature neither guarantees protection against visual spoofing nor reorders text or rewrites bidi control characters. Native direction/marker display and visual arrow-key movement remain browser-defined. Applications still own server validation and safe rendering context. Actual executed checks are recorded separately in the [roadmap](/en/roadmap#verification-and-limits).
