# Text drag and drop

`textDrop()` adds rich selection moves/copies within an editor and copying external text or safe inline HTML at the drop point. It is a separate `/plugins/text-drop` plugin: core blocks drop by default, and presets do not install this plugin automatically. No additional CSS is required.

On the homepage and in the [playground](/en/playground), open “Text drag and drop” and load the sample. **Move _this_** is already selected: drag the selection into Destination, an ordinary list item or a cell. “Select Move this” prepares another attempt after Undo.

## Setup and API

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { textDrop, textDropCommands } from '@morfira-dev/wysiwyg/plugins/text-drop';
import '@morfira-dev/wysiwyg/style.css';

const editor = createEditor(host, {
  value: '<p>First <strong>fragment</strong></p><p>Destination</p>',
  plugins: [textDrop({
    enabled: true,
    onError: (error) => console.error(error),
  })],
});
const drop = textDropCommands(editor);
drop.setEnabled(false);
drop.setEnabled(true);
const preference = drop.getState(); // { enabled: true }, a fresh object
```

`enabled` defaults to `true`. `setEnabled` changes a preference without a document operation and remains available read-only. Actual drops are blocked read-only and during composition. Retained commands reject after editor destruction. Editor disposal releases listeners and gesture state; imports and factory creation do not need DOM globals. Do not log transferred document content: the example callback receives diagnostics rather than the transfer text.

## Supported source and destination

The source selection must stay within one ordinary inline flow: a paragraph, heading, direct-inline list item, quote or cell. A paragraph or heading inside a list item is its own flow. Text, BR breaks, ordinary inline marks and validated links are supported. The destination may be another supported flow while retaining its container and neighbors, including cell rowspan/colspan.

| Action | Result |
| --- | --- |
| Ordinary drop within the same editor | Source removal and insertion in one transaction |
| Ctrl, Meta or Alt during drop | Copy while retaining the source |
| External transfer or another editor | Always copy |
| Drop inside or on an edge of the source range | Consumed no-op with no new Undo |
| Document change before drop | Stale gesture never deletes the source |

One Undo restores content and the pre-gesture source selection; Redo restores the result and post-insertion caret. Next typing continues at the destination. An emptied source stays editable. The browser resolves an actual DOM Range from event coordinates rather than the plugin guessing positions through global text offsets.

## External text and HTML

Each original representation is limited to 20,000 UTF-16 units. Plain text stays literal: CRLF/CR normalize to LF, newlines become BR, and a plain-text `<script>` stays text. Nonempty HTML is parsed inertly and validated; inline nodes or one ordinary P/H wrapper are accepted, with the wrapper unwrapped to inline content. Rejected HTML does not silently fall back to plain text.

The plugin does not claim file transfers; those stay with [image input](/en/image-input). Tables, multi-block sources, images/figures/captions, pre/code, foreign namespaces, semantic nodes, mentions and `contenteditable=false` are outside supported text gestures. Their separate commands and clipboard contracts still apply. Preparing a representation does not fetch resources or expand the document schema.

## Keyboard alternative and validation limits

Use the normal Cut/Copy shortcuts, place the caret and Paste for keyboard operation. These are existing clipboard operations, not a promise of one drag gesture or a shared history step. Native drag behavior and modifier conventions depend on browser and OS. Focused browser scenarios with `DragEvent`/`DataTransfer` exercise handlers, coordinates and document results; they do not certify real OS drag/drop, touch or assistive technology.

`onError` is trusted application code, not a sandbox boundary. Read-only, IME, focus-time document replacement, canceled events and instance disposal are revalidated before mutation; the plugin is not a server security policy.
