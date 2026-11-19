# Atomic mentions with IDs

`mentions({ persistent: true, atomic: true })` enables whole-mention navigation and deletion. Both flags are explicit: the default plugin inserts plain text, while `persistent: true` alone stores an editable reference with an ID. This slice is implemented locally; browser regressions are authored but have not run. Earlier editable-reference results do not validate atomic behavior.

## Setup

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { mentions, getMentions } from '@morfira-dev/wysiwyg/plugins/mentions';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/plugins/suggestions.css';

const editor = createEditor(host, {
  plugins: [mentions({
    persistent: true,
    atomic: true,
    provide: ({ query }) => [
      { id: 'user:42', label: 'Anna' },
    ].filter((person) => person.label.toLowerCase().includes(query.toLowerCase())),
  })],
});

const references = getMentions(editor); // { id, text }[]
const dispose = () => editor.destroy();
```

The factory validates boolean options and rejects `atomic: true` without `persistent: true`. There is no extra package, network provider, implicit CSS or new dependency. Menus retain the [existing contract](/en/suggestions). Styling uses the same `--mw-mention-color`, `--mw-mention-background`, `--mw-mention-radius` and `--mw-mention-padding` as [persistent references](/en/persistent-mentions).

## Caret, selection and deletion

| Action | Behavior within a supported ordinary text flow |
| --- | --- |
| ArrowLeft / ArrowRight at an edge | The caret crosses the complete mention, respecting the block's LTR/RTL direction |
| Shift with an arrow | Extends selection across the entire token |
| Clicking the token | Can select the whole mention |
| An interior caret, including an API selection | Normalizes to the nearest outer boundary |
| Partial forward/backward label selection | Expands to the complete mention boundaries while retaining direction |
| Backspace immediately after / Delete immediately before | Removes the whole ID-bearing span in one Undo operation |

The space after an inserted token is **outside** the mention and remains ordinary text. If the caret follows that space, the first Backspace removes the space; deleting the token is the next action. Removing the last content leaves an editable caret host. Undo/Redo restores ID, label, selection and atomic rendering without refetching the provider.

Supported flows include ordinary paragraphs/headings, list bodies, quotes and cell paragraphs, including merged cells without grid edits. Operations touching unsupported structure or another semantic owner refuse without partially deleting IDs. This is not a universal editing model across arbitrary containers. Home/End, vertical and modified navigation remain native with boundary normalization; exact mixed-bidi visual navigation is not promised.

Read-only blocks user changes but allows external value synchronization. Composition and `isComposing` do not authorize token deletion during IME confirmation. This slice does not certify complete mobile input or screen-reader compatibility.

## Format, validation and migration

The persisted representation is unchanged:

```html
<span data-mw-node="morfira:mention" data-mention-id="user:42">@Anna</span>
```

In the live editor, trusted configuration derives `contenteditable="false"` for registered mentions. This annotation is excluded from `editor.getHTML()` / `getJSON()` and does not admit arbitrary input `contenteditable`. Rendering is rederived after external loading and Undo/Redo. Destruction releases owned handlers, observer and annotations without affecting another editor.

Every reader requiring atomic behavior must opt into `atomic: true`. A reader with the ordinary registered schema retains IDs but leaves labels editable. Missing-schema HTML retains text and drops identity metadata, while JSON rejects the unregistered marker. The Markdown codec still rejects ID references rather than silently losing them.

Atomic labels contain only text children: **1–201 UTF-16 units**, without C0/DEL controls or Unicode line/paragraph separators. IDs retain their 1–256-unit limits. Rich child elements, empty or oversized labels reject at HTML/JSON validation before document changes. This deliberately differs from persistent editable mode.

```ts
import { createDocumentSchema } from '@morfira-dev/wysiwyg';
import { createMentionSchema } from '@morfira-dev/wysiwyg/plugins/mentions';

const schema = createDocumentSchema([createMentionSchema({ atomic: true })]);
const checked = schema.validateDocument(storedDocument);
```

`createMentionSchema({ atomic: true })` validates content without a provider; the declaration alone installs no navigation handlers. Check existing labels before enabling this mode. Keep editable mode or deliberately migrate labels to bounded literal text in application code. There is no automatic child/format removal, new DocumentNode variant or schema-version migration.

An ID remains an untrusted entity reference. The application validates existence, tenant, permissions and notification authorization on the backend. Preventing user label editing does not prove identity or sandbox trusted application JavaScript changing DOM/values directly. The plugin performs no lookup or notifications.

## Try it

On the [homepage](/en/#editor) and [playground](/en/playground), expand “Atomic mentions: navigation and deletion”. Loading the sample replaces the document. Buttons place the caret before/after `@Anna` or select the whole token without history changes. Try ArrowRight, Shift+ArrowRight, Backspace/Delete and Undo. The adjacent persistent-reference section exposes IDs and HTML/JSON round trips. The full demo explicitly enables both flags; preset defaults are unchanged.

## Copy and paste

[Atomic mention clipboard](/en/atomic-mention-clipboard) retains IDs through HTML within one ordinary text flow. Plain text keeps labels only. The additional `mentionClipboardCommands(editor)` API exposes copy/cut/paste without OS clipboard access. Native events use clipboardData; stored representation and defaults stay unchanged.
