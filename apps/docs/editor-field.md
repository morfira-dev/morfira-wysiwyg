<script setup>
import EditorFieldExample from './.vitepress/theme/EditorFieldExample.vue';
</script>

# An editor field in your application

Connect the existing adapter, a ready toolbar and your application's validation
and persistence. This example is an application recipe, not another editor
package. It includes a visible label, help text, an error message, read-only,
explicit Save/Retry, restoration of saved content and simulated image upload.

<EditorFieldExample />

## Try the complete field

Delete all text and choose **Save publication**: the field receives focus, its
error is announced and nothing is submitted. This sample requires nonempty text;
an image alone does not meet that editorial rule. Applications choose their own
required-content policy rather than treating nonempty HTML as meaningful content.

Type a draft, save, then edit while **Saving…** is visible. The earlier snapshot
is saved, while newer edits remain **Unsaved changes**. **Last saved text** shows
persisted text separately from the current draft. **Fail next save** makes one
request fail; **Retry save** captures the current draft, not the failed payload.

**Restore saved** explicitly replaces the current document and clears its undo
history. It cancels acknowledgement of an in-flight save: a late response cannot
replace the restored document. Read-only blocks editing and image insertion,
while saving already committed content remains available.

**Simulate image upload** reports local progress and inserts the site's local
logo. **Cancel upload** stops that request. The file placeholder is neither read
nor sent anywhere. The ready toolbar's image form uses the same callback; choosing
a real local file still does not upload its bytes in this demonstration.

## Attach labels and errors to the actual surface

A contenteditable surface is not a native labelable form control. Put the visible
label/help/error in your application and reference their unique IDs from
`editor.surface`. A surrounding component's attributes alone do not associate
those nodes with the editable textbox.

Copy this small application-owned helper into your project; it is not an npm
subpath. It changes only the three owned ARIA attributes and restores them on
cleanup when another owner has not changed them.

Create adjacent `types.ts` and `index.ts` files:

<<< @/.vitepress/theme/editor-field/types.ts

<<< @/.vitepress/theme/editor-field/index.ts

Call `setInvalid(true)` only while the referenced error exists and is relevant.
The example uses a stable error node and `role="alert"`. Localize your label,
help and error in the application; `editor.setLocale()` localizes built-in UI.
ARIA descriptions do not replace validation or authorize backend operations.

## Ready toolbar and application save

```ts
import { createStandardPreset } from '@morfira-dev/wysiwyg/presets/standard';
import { saveState } from '@morfira-dev/wysiwyg/plugins/save-state';
import { createStandardEditorUI } from '@morfira-dev/wysiwyg/ui/standard';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/plugins/tables.css';
import '@morfira-dev/wysiwyg/ui/editor.css';
import '@morfira-dev/wysiwyg/ui/forms.css';

// save and upload are your typed application callbacks; keep this configuration
// stable for one adapter mount. Create a new bundle for a new field instance.
const preset = createStandardPreset({
  images: { upload },
  plugins: [saveState({ save })],
});

// Pass preset.plugins to the adapter. After its ready event:
const ui = createStandardEditorUI(toolbarHost, editor, {
  presentation: 'floating',
  overflow: 'more',
});
// On unmount: ui.destroy(); let the adapter destroy its editor.
```

[Save-state](/save-state) owns per-instance request coalescing, revision snapshots,
error/retry state and cancellation. Subscribe to its state instead of inventing a
second dirty counter. A successful older snapshot does not mark subsequent edits
saved. External replacement establishes a new baseline, while controlled feedback
of identical HTML preserves selection and history.

The local service is deliberately not production storage. In a real `save`, send
the detached document and a document/version precondition to your authenticated
backend, pass its AbortSignal to transport and acknowledge only an accepted write.
The server owns authorization, validation, idempotency and conflict handling.
Aborting the client does not roll back a write already accepted by the server.
Do not render raw transport errors or insert untrusted HTML directly.

## Use the same connection with every adapter

Use the adapter's public ready event to connect external UI and field semantics.
Keep the returned cleanup with that mounted editor, not in a global singleton.
The application remains the owner of its form value, IDs and validation state.

| Adapter | Controlled value | Ready connection | Cleanup |
| --- | --- | --- | --- |
| Vue | `v-model="value"` | `@ready="onReady"` | `onBeforeUnmount` |
| React | `value={value}` and `onChange={({ html }) => setValue(html)}` | `onReady={onReady}` | effect cleanup; support StrictMode remounts |
| Svelte 5 | `bind:value` | `onready={onReady}` | `onDestroy` or an effect's cleanup |
| Angular 21/22 | `[formControl]="body"` or `[(value)]="value"` | `(ready)="onReady($event)"` | `DestroyRef.onDestroy` |
| Web Component | `.value` and `value-change` | `ready` CustomEvent's `detail` | remove listeners and external UI when removing the element |

Do not combine Angular's form binding with a separate `[value]` owner. In React,
make each ready connection release the previous connection before replacing it;
StrictMode may create another editor. In the Web Component, explicitly register
the element only in the browser and set properties before connecting it.

[Complete adapter examples](/adapters) show the import, value and lifecycle for
each framework. The [extension recipes](/extension-recipes) include version-aware
save and production upload transport examples. [Content security](/security)
explains the frontend/backend boundary.
