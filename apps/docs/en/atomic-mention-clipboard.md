# Copying atomic mention references

With `mentions({ persistent: true, atomic: true })`, copy, cut and paste retain IDs through `text/html`. The `text/plain` representation contains visible text only. This slice is implemented locally; browser and RU/EN regressions are authored but have not run under the current user policy. Synthetic ClipboardEvents do not prove OS clipboard behavior across platforms.

## API

```ts
import { mentionClipboardCommands } from '@morfira-dev/wysiwyg/plugins/mentions';
import type {
  MentionClipboardCommands,
  MentionClipboardData,
  MentionClipboardInput,
} from '@morfira-dev/wysiwyg/plugins/mentions';

const clipboard = mentionClipboardCommands(editor);
const copied = clipboard.copy(); // { html, text } | undefined; current selection
const cut = clipboard.cut(); // returns data and deletes the selection
// After choosing a new paste position:
if (copied) clipboard.paste(copied); // boolean
if (cut) clipboard.paste({ text: cut.text }); // label only, no ID
```

`MentionClipboardData` holds `html` and `text` strings; `MentionClipboardInput` accepts optional `html` and `text`. Commands use the editor's current native selection. The getter rejects when the atomic profile is not installed. The API requests no permissions and does not read or write the OS clipboard: the application owns the returned object. Preserve native selection for external buttons; `copy()` itself changes neither focus, selection, document nor history.

| Command | Contract |
| --- | --- |
| `copy()` | Nonempty selection touching a mention within one ordinary text flow; partial tokens are copied whole. Returns `undefined` when unavailable |
| `cut()` | Same boundaries; returns data and deletes content in one transaction. Returns `undefined` read-only |
| `paste(input)` | Inserts allowed inline content or the body of one ordinary paragraph at a caret/over a same-flow selection. Returns `false` on refusal, including read-only |

Copy works read-only. Paste replaces selected tokens whole and leaves the caret outside the inserted mention. Following ordinary input does not modify the token label. Each successful cut/paste creates one Undo/Redo revision restoring IDs and selection; refusal creates none.

## Formats and boundaries

HTML carries registered `data-mw-node="morfira:mention"` and `data-mention-id`, the label and supported surrounding `strong/em/u/s/sub/sup/span/br` formatting. Runtime `contenteditable`, classes and unchecked attributes are not exported. Plain text contains visible labels, ordinary text and BR newlines; a plain `@Anna` never invents an ID reference.

Ordinary paragraph/heading, list, quote and cell-paragraph flows are supported, including a merged cell without grid changes. Multiblock selections, container crossings, images, incoming table fragments, links/code and other semantic owners refuse. This is a bounded mention contract, not a universal rich clipboard engine. Explicit table selections and file pastes retain their existing owners.

Nonempty HTML takes precedence over text. An invalid registered mention rejects without silently falling back to its plain-text label. The receiver validates the ID and text-only label through the [atomic schema](/en/atomic-mentions). A missing-schema HTML reader may keep text and drop IDs; an editable persistent reader retains IDs without atomic behavior.

## Native events and safety

Handlers use cancelable `copy/cut/paste` events and their `clipboardData`; there is no `navigator.clipboard`, network or new dependency. Paste is intercepted for incoming mentions or a touched token; unrelated pastes remain with existing handlers. Previously handled events, IME and file data do not start a second synthetic edit.

Native cut writes both formats successfully before deleting the selection. A write failure preserves document/history; rollback of a partially modified OS clipboard is not promised. Handlers revalidate document/selection after application callbacks and focus to avoid deleting a replacement document. Input is schema-checked before active rendering; active resource subtrees are not cloned just for serialization.

An ID is an untrusted entity reference. Schema validation proves neither user existence, tenant membership nor permission: those checks, upload/notification authorization and CSP remain application/backend responsibilities. Frontend filtering is not a server trust boundary.

## Demo

On the [homepage](/en/#editor) and [playground](/en/playground), expand “Mention clipboard: IDs and plain text”. Load the sample, select `@Anna`, copy to memory and choose the position after the token. “Paste with ID” creates another `anna` reference; “Paste plain text” inserts only the label. HTML/text and `{id,text}` snapshots expose the difference. Buttons never access the OS clipboard; loading the example replaces the document. Native shortcuts require separate target-browser/OS verification when checks resume.
