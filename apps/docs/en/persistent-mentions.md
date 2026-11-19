# Persistent mentions with IDs

`mentions({ persistent: true })` stores the chosen ID in an ordinary schema-v1 semantic `span`. This is a separate option of the existing plugin: without it, mentions and ready presets continue inserting plain text. The code uses TypeScript with no new runtime dependencies. New browser regressions have not run yet; earlier plain-text mention results do not validate this slice.

## Setup

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import {
  mentions, mentionCommands, getMentions,
} from '@morfira-dev/wysiwyg/plugins/mentions';
import { createSuggestionMenu } from '@morfira-dev/wysiwyg/plugins/suggestions';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/plugins/suggestions.css';

const editor = createEditor(host, {
  plugins: [mentions({
    persistent: true,
    provide: ({ query }) => [
      { id: 'user:42', label: 'Anna Smith' },
    ].filter((person) => person.label.toLocaleLowerCase('en').includes(query.toLocaleLowerCase('en'))),
  })],
});
const stopMenu = createSuggestionMenu(editor, mentionCommands(editor));

const references = getMentions(editor); // fresh { id, text } array
const value = editor.getJSON();

const dispose = () => {
  stopMenu();
  editor.destroy();
};
```

`persistent` must be boolean; configuration is copied when creating the plugin. Providers, asynchronous cancellation, menus and controllers retain their [existing contract](/en/suggestions). Choosing a result inserts `@Label` in a separate span and a space **outside** it. The choice is one user operation and one Undo; subsequent ordinary input starts after the mention. Redo does not refetch the provider.

## Format and reference inspection

```html
<span data-mw-node="morfira:mention" data-mention-id="user:42">@Anna Smith</span>
```

`getMentions(editor)` returns independent `{ id, text }` records in document order, including repeated references to the same ID. `text` is the span's current visible content including `@`, not a verified user name. It is an explicit read available read-only, without changing the document, selection or history; a live installed mentions plugin is required. It does not continually scan the document on every keystroke.

An ID is an opaque string of 1–256 UTF-16 units without C0/DEL or Unicode line/paragraph separators. It does not become an HTML `id`, URL or CSS selector. Provider labels remain literal text under their existing 1–200-unit bound. Markup-looking characters never execute.

Chip styling is enabled only by explicitly importing `/plugins/suggestions.css`. Without it, IDs and text persist identically, with no special appearance. Variables are scoped to the editor:

| Variable | Purpose |
| --- | --- |
| `--mw-mention-color` | Mention text color |
| `--mw-mention-background` | Background |
| `--mw-mention-radius` | Border radius |
| `--mw-mention-padding` | Inline-axis inset (`padding-inline`) |

Styling targets the registered span through `data-mw-node`, without persisting class or contenteditable attributes. Statistics count visible text normally; the ID attribute adds no hidden characters.

The schema is registered **before** importing initial content. HTML/JSON, history and HTML clipboard paste retain registered IDs. A fresh independent definition supports validation without a provider:

```ts
import { createDocumentSchema } from '@morfira-dev/wysiwyg';
import { createMentionSchema } from '@morfira-dev/wysiwyg/plugins/mentions';

const schema = createDocumentSchema([createMentionSchema()]);
const checked = schema.validateDocument(storedDocument);
```

`createMentionSchema()` installs no menu, provider, transport or atomic behavior. Invalid/empty/missing IDs on registered nodes reject import before editor mutation. An HTML reader without the schema retains visible text but removes identity metadata. A JSON reader without the schema rejects an unregistered `data-mw-node`; install the same definition to retain IDs. The [Markdown codec](/en/markdown-codec) explicitly rejects these semantic nodes instead of silently discarding IDs.

## Editing and security

**This is an editable entity reference, not an atomic token.** Character edits to its display text can retain the original ID. Generic formatting may retain, split or duplicate inline wrappers under its existing rules; identity metadata does not prove immutable display text. Indivisible deletion, caret snapping, immutable labels and a full atom model are not claimed.

Suggestions do not open inside semantic spans or collect a query across their boundaries. Read-only, composition, external replacement, stale asynchronous responses and destruction retain the current choice guards. Search/replacement and structural editing keep their existing semantic-content boundaries.

IDs from providers, HTML, JSON or clipboard are **untrusted identity claims**. Applications must verify entity existence, tenant, access rights and notification authorization on the server. Edited display text does not authorize a new recipient. The plugin performs no lookup, sends no notifications and grants no entity permissions. Backend validation and CSP remain application responsibilities.

## Demo

On the [homepage](/en/#editor) and [playground](/en/playground), expand “Persistent mentions with IDs”. Choose “Choose an @an mention”, select a person in the actual menu, then “Show mention IDs”. HTML/JSON round-trip controls validate and resubmit the current value, displaying retained references. An unchanged normalized value preserves history and selection. Loading a sample replaces the document and clears history; ordinary menu selection remains one Undo operation.

The demo explicitly passes `persistent: true` in its own configuration. Ready preset defaults do not change. ID snapshot inspection remains available read-only; insertion and reloading are blocked. Actual browser outcomes for this stage still require executing the authored regressions.
