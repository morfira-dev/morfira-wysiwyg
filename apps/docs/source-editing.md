<script setup>
import SourceEditingExample from './.vitepress/theme/SourceEditingExample.vue'
</script>

# HTML source

This optional module edits the supported HTML of the whole document. The draft and normalized preview are literal text: they execute no code and fetch no resources.

<ClientOnly><SourceEditingExample /></ClientOnly>

## Installation

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { createSourceEditor } from '@morfira-dev/wysiwyg/ui/source';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/ui/source.css';

const editor = createEditor(editorHost, { value: '<p>Hello</p>' });
const source = createSourceEditor(emptyExternalHost, editor);
openButton.addEventListener('click', () => source.open());

// On application unmount:
source.destroy();
editor.destroy();
```

The modal host must stay connected and outside the editor document, and be empty at creation. No preset or core import includes this UI. Its explicit stylesheet uses native nesting: Chrome 112+, Firefox 117+, Safari 16.5+.

## API

`createSourceEditor(host, editor, { label?, onError? })` returns `SourceEditorController`:

| Method | Result |
| --- | --- |
| `open()` | `boolean`: whether a new current-document draft opened |
| `close()` / `isOpen()` | Cancel without a document edit / modal state |
| `getValue()` / `setValue(html)` | Literal draft, bounded to 5,000,000 UTF-16 units |
| `preview()` | `{ html, changed }`, or `undefined` on refusal |
| `destroy()` | Close and release subscriptions, captures and only owned UI |

`changed` means parsing/serialization changed the source. This is **not a complete diff**: unsupported tags, attributes and styles can disappear, aliases can become canonical tags, and serialization can change. Validation is explicit rather than parsing a large draft on every keystroke.

## Apply and history

Apply revalidates the latest draft with this editor instance's schema and replaces the whole document in one user transaction. The caret starts inside the first ordinary P/H before its children; protected or non-body first nodes use the root-start gap instead. An empty document receives the ordinary P/BR placeholder before caret placement, avoiding an extra paragraph on subsequent typing. Undo restores the old document and selection, and Redo restores the source edit. A canonical no-op adds no history entry. Core can additionally create its ordinary editable wrappers or trailing paragraph.

An external document change closes the stale modal. Its literal draft remains available through `getValue()`. New editor selection intent, focus-time redirection, read-only, composition and lost external-host ownership cannot redirect the old operation. Cancel does not restore a stale selection.

## Security boundaries

The preview is never rendered through `innerHTML`. Apply accepts only reconstructed content validated by the current schema and existing resource limits. Allowed images **after application to the document** may fetch resources: CSP, URL policy and server validation remain application responsibilities. Receiving editors need registered extensions to retain their metadata.

This is not arbitrary HTML roundtrip, Office fidelity, universal structural mapping or a bundled IDE. Physical-device and screen-reader environments remain unavailable evidence limitations, not a certification claim.
