# Document preview

`createPreviewUI` creates a separate nonmodal reading view of the current document. Supported headings, inline formatting, lists, tables and captions appear without an editing surface. The document, history and actual editor DOM nodes stay unchanged. Open “Document preview” on the homepage or in the [playground](/en/playground).

The module is explicitly selected, outside core and preset defaults. It is not a print engine, a new document, an iframe or a popup window. It does not promise print pagination or fidelity to arbitrary external CSS layouts.

## Setup

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { createPreviewUI } from '@morfira-dev/wysiwyg/ui/preview';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/ui/preview.css';

const editor = createEditor(editorHost, {
  locale: 'en',
  value: '<h2>Heading</h2><p>The current document</p>',
});
const preview = createPreviewUI(previewHost, editor, {
  live: true,
  images: 'omit',
  onError: (error) => console.error(error),
});
preview.open();
```

`previewHost` is an empty connected HTML container in the same document, outside persisted editor content. Place it where the application wants a reading view. Styles are explicit; no fonts are downloaded and the documentation site's CSS is not required.

## API

| Option | Behavior |
| --- | --- |
| `label?: string` | Explicit accessible panel/region name; built-in labels have RU/EN translations |
| `live?: boolean` | Defaults to `true`: an open view follows document changes, coalesced into one animation frame |
| `images?: 'omit' \| 'load'` | Defaults to `'omit'`: display text placeholders instead of images |
| `onError?: (error: unknown) => void` | Application diagnostics; UI errors use a generic localized message |

`PreviewUIController` exposes `element`, `open()`, `close()`, `toggle()`, `isOpen()`, `refresh()` and `destroy()`. `toggle()` returns the resulting open state. Destruction is idempotent; other methods reject after disposal. `PreviewUIOptions`, `PreviewUIMessageKey` and `previewUIMessages` are also exported.

With `live: false`, capture the document on opening and explicit `refresh()` or “Refresh preview”. A closed panel retains no document snapshot and performs no per-keystroke rendering. Reopening uses current data. Read-only does not disable viewing.

## Images, links and security

By default the preview **creates no images and makes no additional requests to their URLs**. It shows alt text or a localized placeholder. Resource policy is applied before live DOM creation: filtering an already-created `img` would be too late.

Loading images in this view requires an explicit application decision:

```ts
const preview = createPreviewUI(previewHost, editor, {
  images: 'load',
});
```

This uses the document's validated URLs and allows ordinary browser requests. Resource host policy, authorization and CSP remain application responsibilities. Opening preview never authorizes access to a server file. Closing removes owned view resources; it does not undo requests the browser already completed.

Links are always inert: retain text and formatting without navigation attributes. Mention labels do not invoke providers or identity lookups, and checklists receive no interactive editing handlers. The preview is constructed from the instance's validated JSON through DOM APIs, without cloning the live editor or injecting raw HTML.

## Keyboard and lifecycle

Controls are native buttons; content is a focusable reading region. Unhandled Escape inside the preview closes it before an outer fullscreen handler. Unrelated external focus is not stolen, and no modal focus trap is installed. Complete real-device and screen-reader compatibility is not claimed.

Locale updates change captions and placeholders without document edits. Close/dispose cancel pending frames; editor destruction releases the UI, and retained stale controls cannot resurrect it.

```ts
preview.close();
preview.destroy();
editor.destroy();
```

Raw JS, gzip, Brotli, CSS and actual focused verification are reported separately. A working example does not establish a complete editor-suite pass or arbitrary print/Office layout fidelity.
