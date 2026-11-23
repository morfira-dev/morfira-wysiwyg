<script setup>
import MediaFormulaExample from '../.vitepress/theme/MediaFormulaExample.vue';
</script>

# Media and formulas

Two independent optional modules extend the editor without growing core or automatically entering presets. Media stores YouTube/Vimeo metadata; formulas store literal source in a small TeX-like language. All visual views below live **outside the persisted document**.

<MediaFormulaExample />

## Try the example

1. Load the example: semantic nodes appear in the editor, with separate views beside/below it. Native MathML shows fractions, roots and scripts without downloading fonts or a formula library.
2. Open formula insertion, enter `x_1^2 + \frac{a}{b}`, and apply. Use the explicit sample-edit action to edit a current formula. The draft is tied to an actual node/selection and participates in undo/redo.
3. Open media insertion and provide a YouTube/Vimeo HTTPS URL and title. Insertion stores an allowlisted provider, ID and literal text rather than an `iframe` or arbitrary markup.
4. Press **Load external video** in a media card only when you want to contact the provider. Before that there are no iframes, thumbnails, fetch, oEmbed or preconnect requests. Unload removes only the iframe owned by that card.
5. Try undo and read-only. Explicit viewing of existing media remains available; user document mutations are blocked.

## Integration

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { media } from '@morfira-dev/wysiwyg/plugins/media';
import { formulas } from '@morfira-dev/wysiwyg/plugins/formula';
import { createMediaForm, createMediaView } from '@morfira-dev/wysiwyg/ui/media';
import { createFormulaForm, createFormulaView } from '@morfira-dev/wysiwyg/ui/formula';
import '@morfira-dev/wysiwyg/ui/media.css';
import '@morfira-dev/wysiwyg/ui/formula.css';

const editor = createEditor(editorHost, { plugins: [media(), formulas()] });
const mediaForm = createMediaForm(mediaFormHost, editor);
const formulaForm = createFormulaForm(formulaFormHost, editor);
const mediaView = createMediaView(mediaViewHost, editor);
const formulaView = createFormulaView(formulaViewHost, editor);
// All UI hosts must be outside editor.surface in the same document.
// When disposing your integration:
mediaForm.destroy();
formulaForm.destroy();
mediaView.destroy();
formulaView.destroy();
editor.destroy();
```

The two modules do not require each other. Import only the features you need; CSS is explicit. Locale changes update public labels, and editor destruction cleans its forms/views. See the [media API](/en/media) and [formula API](/en/formulas) for contracts and limits.

## Boundaries and security

Formulas use a bounded language, **not full LaTeX**: at most 1024 UTF-16 code units, 512 tokens/nodes and depth 24. Unknown commands reject. Rendering uses a fixed MathML vocabulary and literal `textContent`, without HTML interpretation, macros, URLs, arbitrary styles or network resources. Unsupported imported syntax remains inert source with an error message. In this first version the formula inside the editor remains a source atom; MathML lives in an external host, not editable `contentDOM`.

Media supports validated YouTube/Vimeo URLs only; arbitrary HTML embeds and other providers are unsupported. Explicit Load causes a provider request: application CSP `frame-src`, privacy policy, network restrictions and video availability remain integration concerns. Frontend filtering is not a substitute for server validation or a security certification.
