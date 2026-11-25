<script setup>
import PluginExtensionsExample from './.vitepress/theme/PluginExtensionsExample.vue';
</script>

# Nodes, atoms, views and decorations

The optional `@morfira-dev/wysiwyg/sdk` provides application extension tools. Core and ready presets do not import it automatically. It adds no framework runtime and does not change the persisted schema version.

<PluginExtensionsExample />

## Application-owned nodes

`nodeExtension(spec, options)` registers semantic nodes using existing safe schema-v1 wrappers. `nodeCommands(editor, name)` exposes `insert(text, attributes)`, `update(target, attributes, text?)` and `remove(target)`. The instance codec validates attributes and literal text before editing; commands participate in history and honor read-only/composition.

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { nodeExtension, nodeCommands } from '@morfira-dev/wysiwyg/sdk';

const editor = createEditor(host, {
  plugins: [nodeExtension({
    name: 'app:issue', kind: 'inline', tag: 'span',
    attributes: {
      'data-id': { type: 'text', minLength: 1, maxLength: 64, required: true },
    },
    content: { type: 'text', minLength: 1, maxLength: 64, singleLine: true },
  }, { atomic: true })],
});
const issues = nodeCommands(editor, 'app:issue');
issues.insert('ISSUE-42', { 'data-id': '42' });
```

This does not permit arbitrary tags, iframes, event attributes, styles or foreign namespaces. The schema validates data; plugin registration and executable callbacks remain trusted application code. Node IDs do not establish backend authorization.

## Atomic nodes

`atomic: true` supports inline spans with bounded, nonempty, single-line literal text. Navigation and Backspace/Delete treat the token as a unit within a supported ordinary text flow. HTML/JSON retain semantic identity and attributes; runtime `contenteditable=false` is not persisted. The receiving editor also needs the registered schema.

Unsupported structural crossings refuse rather than flattening lists or tables. Arbitrary block-widget selection and mixed-bidi visual navigation are not promised. [Atomic mentions](/atomic-mentions) retain their independent tested contract.

## Node views

`createNodeViews(host, editor, { name, create })` manages views **in an external host**, alongside persisted content. `create(context)` returns `{ element, update?, destroy? }`. Context includes the actual `node`, validated `attributes`, `text`, `editor` and observational `getRect()`.

Each actual target has an owned lifecycle. Changes update context; removal and editor destruction dispose its view. Hosts inside `editor.surface` reject. Callback failures must clean up partially created UI and subscriptions.

This supports cards, inspectors and custom controls beside a node. It is **not** an arbitrary in-document renderer with editable `contentDOM`. View HTML never enters `getHTML()` / `getJSON()`; applications own placement. Use `nodeCommands` and guarded editor commands to change data.

## Text positions and transactions

`editor.positions` tracks UTF-16 offsets in `surface.textContent`. BR, empty blocks and images can share an offset; use [selection handles](/plugin-sdk#remembered-selections-for-external-ui) for exact native DOM points.

```ts
const position = editor.positions.track(6, 1);
if (!position) throw new Error('The editor is not ready for position tracking.');
editor.transact((surface) => {
  const first = surface.querySelector('p')!.firstChild as Text;
  first.insertData(0, '++');
}, { mapping: [{ from: 0, to: 0, insert: '++' }] });
const result = editor.positions.resolve(position); // { index: 8, deleted: false }
editor.positions.release(position);
```

- `track(index, association?)`: an opaque per-editor position; `-1` associates before boundary insertion, `1` after it.
- `resolve(handle)`: a fresh `{ index, deleted }`, or `undefined` for an expired/foreign target. Deleted positions are not live command targets.
- `release(handle)`: idempotent cleanup.
- `subscribe(listener)`: mapped/invalidation notifications with an unsubscribe function.

A `mapping` is a bounded sequence of `{ from, to, insert }`; each step uses coordinates after preceding steps. Its result must exactly match the transaction's final text. Invalid declarations roll back the edit. The outermost transaction owns the plan. Supported undo/redo use inverse/forward history steps.

Undeclared native input, external replacement and unsupported changes expire positions. The editor does not guess identities from repeated strings or promise universal structural mapping. Even formatting that changes HTML needs explicit `mapping: []` when an application asserts text-coordinate compatibility. Ordinary commands still work without mapping but do not automatically preserve tracked targets.

For a registered literal-text atom, the SDK uses `editor.positions.setPresentation(node, false)`; `undefined` removes its annotation. This narrow API validates one actual schema span and accounts only for its own `contenteditable` change. It cannot change arbitrary attributes or hide prior unknown DOM mutations. Exact selection handles still expire after actual DOM changes.

## Decorations

`createDecorations(editor, { name })` owns one native CSS Highlight registry entry. `set([{ from, to }])` replaces ranges, `getState()` reports support/count, and `destroy()` removes only its own entry. Choose a safe unique name and provide CSS:

```css
::highlight(app-annotation) { background: #ffdf6e; color: #171717; }
```

Ranges follow supported mapped transactions. Expired/deleted targets disappear. Unsupported browsers report `unsupported`; there is no heavy fallback or persisted wrapper. This stage provides range decorations, not arbitrary inline widget decorations.

## Cleanup and security

Release tracked positions and destroy decorations/node views on unmount. Never transfer handles between editors or persist them in backend storage. View callbacks are not sandboxed: do not insert untrusted HTML or execute untrusted code. Frontend checks do not replace backend data, upload or authorization validation.

APIs and examples alone do not establish complete device coverage, accessibility or Office compatibility.
