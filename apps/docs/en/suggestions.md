# Mentions and slash suggestions

Asynchronous suggestions support keyboard/menu selection and optional structural commands. These optional modules add no external runtime dependencies:

- `/plugins/mentions` inserts ordinary editable `@label ` text.
- `/plugins/slash` replaces `/query` with a text snippet or runs a registered structural command.
- `/plugins/suggestions` exports shared types and an optional menu; its CSS is opt-in.

**By default, result IDs are not persisted in the document.** These mentions can be edited and deleted character by character. They are not atomic nodes and send no notifications. Slash snippets do not execute formatting: `# Heading` remains text even with Markdown shortcuts installed. Document schema v1 stays unchanged.

Persistent editable references are enabled separately with `mentions({ persistent: true })`; see [mention ID storage and boundaries](/en/persistent-mentions) for IDs, HTML/JSON and limits. Ready presets keep their current default.

## Installation

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { mentions, mentionCommands } from '@morfira-dev/wysiwyg/plugins/mentions';
import { slash, slashCommands } from '@morfira-dev/wysiwyg/plugins/slash';
import { createSuggestionMenu } from '@morfira-dev/wysiwyg/plugins/suggestions';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/plugins/suggestions.css';

const editor = createEditor(host, {
  plugins: [
    mentions({
      provide: async ({ query, signal, limit }) => {
        const response = await fetch(
          `/api/people?q=${encodeURIComponent(query)}&limit=${limit}`,
          { signal },
        );
        if (!response.ok) throw new Error('Could not load suggestions');
        return response.json();
      },
    }),
    slash({
      provide: ({ query }) => [
        { id: 'signature', label: 'Signature', text: 'Best regards, the team' },
      ].filter((item) => item.label.toLocaleLowerCase('en').includes(query.toLocaleLowerCase('en'))),
    }),
  ],
});
const people = mentionCommands(editor);
const snippets = slashCommands(editor);
const disposePeopleMenu = createSuggestionMenu(editor, people, { locale: 'en' });
const disposeSlashMenu = createSuggestionMenu(editor, snippets, { locale: 'en' });
```

Applications own transport, authentication, allowed results and storage. Providers receive only `{ query, signal, limit }`, never DOM nodes or a Range. They can return arrays synchronously or through a Promise. Responses are validated before display; request failures become menu state rather than document edits. The modules contain no fetch client, storage backend or polyfills.

The view is optional: use headless controllers with your own panel. The provided menu lives under editor.element, outside persisted content. Provider IDs select results but are never used as HTML IDs or CSS selectors.

## Options and results

Common `SuggestionOptions<T>`:

| Option | Default | Bound |
| --- | --- | --- |
| `provide` | required callback | array or Promise of an array |
| `minQueryLength` | mentions: 1, slash: 0 | integer 0–100 |
| `maxItems` | 20 | integer 1–100 |
| `debounceMs` | 120 | integer 0–1000 ms |

`MentionOption` contains id, label and optional description strings. `SlashOption` additionally requires a text string.

IDs accept 1–256 UTF-16 units, labels 1–200, descriptions up to 500, snippets 1–20000. C0/DEL control characters are rejected; labels/snippets cannot contain line breaks. Markup-looking characters remain literal. Unknown fields are discarded. Duplicate IDs or invalid fields reject the **entire** response. At most 1000 objects are inspected; a longer response is invalid. Valid results are displayed in provider order up to maxItems. Hidden results beyond that display limit are still validated, including duplicate IDs.

## Trigger boundaries

On ordinary typing/deletion, mentions recognizes @query at the start of an eligible text flow, after whitespace, or after `(`, `[` and `{`. An @ in a word/email or after a URL separator stays literal. Queries allow Unicode letters/numbers/marks/connector punctuation and `-`, up to 100 UTF-16 units. Labels may contain spaces even though this first query grammar does not.

Slash opens at the start of a plain paragraph, including one in a table cell. It does not open in headings, existing list items, quotes, links, code/pre or image captions. Mentions supports headings/items/quotes; both modules exclude links, code/pre and figure/figcaption. Blocks, cells and br/img/hr split flows rather than joining adjacent text.

The caret must be collapsed and at the query token's end. A selection or a caret inside `@an|na` does not create a replacement target. Loading, pasting and undo do not automatically open suggestions; use open() explicitly for an existing eligible token.

## Controller

```ts
const state = people.getState();
// { status, query, items, activeIndex, anchor?, error? }
const stop = people.subscribe((next) => {
  // Render loading, ready/empty, error or closed.
});
people.open();       // boolean: does the current caret have an eligible token?
people.move(1);      // -1 or 1; wraps through results
people.choose('id'); // boolean: was a current choice inserted?
people.close();
stop();
```

Statuses are closed/loading/ready/error. A valid empty response is ready with empty items and activeIndex -1. Error is provider-error or invalid-results; stale results cannot be chosen during loading/error. Snapshots are independent and contain no DOM, Range, AbortController or references to application objects. Subscribe does not invoke immediately; get initial state via getState.

open() rescans the real caret rather than inventing a target. choose() revalidates token, caret and session; a stale/unknown ID returns false without mutation. Invalid argument types throw. A successful choice replaces only trigger/query, inherits formatting at the trigger start and retains surrounding text and table geometry. It is one user revision and undo step. Undo restores the trigger and caret; redo restores inserted text. History does not reopen/refetch the menu.

## Keyboard and cancellation

Up/Down wrap the active result without moving DOM selection. Enter accepts only a valid ready option and does not also insert a paragraph/list item. Escape dismisses without deleting the query. Tab dismisses and falls through to existing editor/browser behavior, including table navigation and list indentation. Left/Right/Home/End/Page and modified shortcuts dismiss and keep their normal behavior. Loading/error/empty-result Enter performs ordinary editing. The menu never traps focus or accepts with Tab.

A new query aborts its predecessor. Close, read-only, external replacement, caret movement, compositionstart and destroy clear timers and abort the signal. Late responses/rejections are handled and ignored. IME suspends choice; compositionend does not automatically reopen. Same-value controlled feedback with unchanged DOM preserves the session without refetching. Identical-HTML DOM reconstruction by formatting may close a session; a choice must never use detached text nodes.

```ts
const stopDisposal = people.onDispose(() => {
  // Release your custom view resources.
});
stopDisposal(); // unregister; repeated calls are safe
```

Controller methods become unavailable after destroy; existing unsubscribe functions remain safe. The provided menu cleans up automatically through onDispose; its returned disposer is also idempotent. Every instance owns its resources even when one plugin object is reused across editors.

## View and appearance

SuggestionMenuOptions accepts locale ru/en (default en) and labels with label/loading/empty/error/results strings. One {count} in results is replaced by the result count. Labels/descriptions use textContent. Scoped variables:

```css
.my-editor {
  --mw-suggestion-bg: #fff;
  --mw-suggestion-text: #263043;
  --mw-suggestion-muted: #64748b;
  --mw-suggestion-border: #e2e8f0;
  --mw-suggestion-active-bg: #eeeaff;
  --mw-suggestion-radius: 10px;
  --mw-suggestion-shadow: 0 10px 30px #0002;
  --mw-suggestion-max-height: 240px;
  --mw-suggestion-z-index: 30;
}
```

The menu anchors to the caret Range without inserting measurement spans, clamps to the viewport and flips above when needed. Scroll/resize repositions without repeating providers. Arbitrary portals and transformed/clipping ancestors are outside phase-1 support. A menu cannot use another editor's controller or attach twice to the same controller.

Listbox/status semantics and keyboard/browser checks are not accessibility certification. Screen-reader, touch, zoom and real IME evidence still need separate testing. On the [homepage](/en/#editor) and [playground](/en/playground), local asynchronous providers demonstrate ready/loading/empty/error/cancellation without sending document text to a server.

Structural slash actions have their separate contract below; [persistent editable ID references](/en/persistent-mentions) are explicitly enabled. Neither slice adds atomic mention selection or indivisible deletion, which remain future SDK work.

## Structural slash commands

The ready-made `createSlashActions()` registry includes `paragraph`, `heading1`–`heading6`, `bulletList`, `orderedList`, `blockquote` and `codeBlock`. It is explicitly installed; text snippets still work without it.

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import type { Editor } from '@morfira-dev/wysiwyg';
import { slash, createSlashActions } from '@morfira-dev/wysiwyg/plugins/slash';
import { tables, tableCommands } from '@morfira-dev/wysiwyg/plugins/tables';

const actions = {
  ...createSlashActions(),
  table: (editor: Editor) => tableCommands(editor).insert(3, 3),
};
const editor = createEditor(host, {
  plugins: [tables(), slash({
    actions,
    provide: ({ query }) => [
      { id: 'heading', label: 'Heading 2', action: 'heading2' },
      { id: 'table', label: 'Table', action: 'table' },
      { id: 'signature', label: 'Signature', text: 'Best regards, team' },
    ].filter((item) => item.id.includes(query)),
  })],
});
```

The complete example also imports `createEditor` and `type Editor` from the root package. Provider results contain **either** `text` **or** `action: string`. Action keys must exist in the configured registry; unknown keys, response callbacks, simultaneous text/action or invalid results reject the entire response. The factory copies the registry: later changes to its source object cannot change the installed plugin. Names match `[A-Za-z][A-Za-z0-9_:.-]{0,127}`.

Choosing revalidates the caret/token, removes `/query` and executes the command in one composed transaction. One Undo restores the token and caret; there is no intermediate change. Suffixes and adjacent blocks remain intact. Lists/headings inside cells preserve grid geometry. The table command requires an installed table plugin and rejects nested tables with complete rollback.

`SlashAction = (editor: Editor) => void` is trusted **synchronous** application code using public commands. Providers never deliver executable code. Actions may call a custom plugin API through `getPlugin`; slash does not import its implementation. Events are not an implicit dispatcher. Even a no-op action consumes the token; failures roll back both the action and token removal. Async callbacks/thenables are rejected; do not schedule mutations after returning. See [events and transactions](/en/events).

The homepage offers `/h2`, `/bullet`, `/ordered`, `/quote`, `/code`, `/table` and the complete list after `/`. New-example buttons replace the document; the provider remains local with delay/error/empty response controls.
