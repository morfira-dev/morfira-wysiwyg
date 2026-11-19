<script setup>
import PluginSDKExample from '../.vitepress/theme/PluginSDKExample.vue';
</script>

# Plugin SDK and extensible schema

SDK phase 1 adds typed commands and declarative semantic document extensions for one editor instance. Core imports no plugins and needs no UI. All examples use the public `@morfira-dev/wysiwyg` facade without third-party runtime dependencies.

This extends the existing `EditorDocument` v1 format. It does not replace the editing engine or yet provide custom node views, atomic selection, decorations or arbitrary new HTML tags.

## Live example

The plugin declares a block callout on `blockquote` and an inline reference on `span`. Both appear in the initial document: the schema is compiled **before HTML import and `setup`**. Buttons deliberately insert at the document end, ignoring the current editor selection. That placement belongs to this example rather than the command SDK.

<PluginSDKExample />

The reference retains `data-id`, while its label stays ordinary editable text. This is not a complete atomic mention implementation. Example appearance styles are not persisted in the document.

## Declarative schema

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import type { EditorPlugin, SchemaNodeSpec } from '@morfira-dev/wysiwyg';
import '@morfira-dev/wysiwyg/style.css';

const nodes: readonly SchemaNodeSpec[] = [
  {
    name: 'app:callout', kind: 'block', tag: 'blockquote',
    attributes: {
      'data-tone': { type: 'enum', values: ['note', 'warning'], required: true },
    },
  },
  {
    name: 'app:reference', kind: 'inline', tag: 'span',
    attributes: {
      'data-id': { type: 'text', maxLength: 64, required: true },
    },
  },
];
const plugin: EditorPlugin = {
  name: 'app:notes',
  schema: nodes,
  setup: (editor) => {
    // The schema already participated in initial import.
    const stop = editor.subscribe((change) => console.log(change.html));
    return stop;
  },
};
const editor = createEditor(host, {
  plugins: [plugin],
  value: '<blockquote data-mw-node="app:callout" data-tone="note">Note</blockquote>',
});
// editor.destroy() disposes the plugin and its subscription.
```

`host` is an empty browser `HTMLElement`. Pass the same array through `EditorOptions.schema` when the extension belongs to the application without a separate plugin. Contributions from `options.schema` and every `plugins[].schema` compile together. Duplicate names fail even when definitions are identical. Invalid definitions fail before mounting and `setup`; definitions are copied, so later mutation of the input array does not reconfigure the instance.

Names are namespaced identifiers using lowercase letters, digits and hyphens, such as `app:callout`. Each segment begins with a letter; at least two segments separated by `:` are required. Limits are 128 characters and 128 definitions per instance.

| `kind` | Supported phase-1 HTML wrappers |
| --- | --- |
| `block` | `p`, `h1`–`h6`, `blockquote`, `pre`, `figure`, `figcaption` |
| `inline` | `span`, `strong`, `em`, `u`, `s`, `sub`, `sup`, `code` |

`data-mw-node` persists the semantic type name. Additional rules accept lowercase `data-*` attributes only; `data-mw-*` is reserved. Definitions cannot allow `onclick`, `style`, arbitrary URL attributes or foreign namespaces. Ordinary HTML, URL and style validation still applies.

## Attribute rules

Every persisted attribute value is a string. A node definition may add at most 64 attribute rules.

| Rule | Contract |
| --- | --- |
| `{ type: 'text', minLength?, maxLength?, singleLine?, required? }` | String: minimum defaults to 0, maximum to 256 (up to 20000). `singleLine: true` rejects C0/DEL and Unicode line/paragraph separators |
| `{ type: 'enum', values, required? }` | One of 1–64 declared string values |
| `{ type: 'integer', min, max, required? }` | An integer string within safe-integer bounds, normalized to its canonical representation |
| `{ type: 'url', required? }` | A safe URL using core link rules: `http`, `https`, `mailto`, `tel` or a permitted relative reference |

`required` checks attribute presence. Use `minLength: 1` for nonempty strings; the minimum must be an integer from 0 through `maxLength`. Application commands may additionally validate formats and permissions. Undeclared extra attributes are not retained. Every string is bounded to 20000 characters. Definitions with unknown fields, incompatible tag/kind or unsafe names fail.

## HTML, JSON and a standalone codec

```ts
import { createDocumentSchema, sanitizeHTML } from '@morfira-dev/wysiwyg';

const schema = createDocumentSchema(nodes);
const document = schema.parseHTML(
  '<span data-mw-node="app:reference" data-id="TASK-42">Task</span>',
);
const html = schema.documentHTML(document);
const checked = schema.validateDocument(document);
const fragment = schema.renderDocument(checked);
const clean = schema.sanitizeHTML(html);

// The plain sanitizer loads no application/plugin schema and drops marker metadata.
const fallback = sanitizeHTML(html);
```

An editor exposes readonly `editor.schema` with the same five methods. Its schema applies to initial HTML, `setHTML`, `setJSON`, `getHTML`, `getJSON`, insertion, transactions, native input and history. Later edits must not erase registered metadata.

- HTML import removes an unknown marker and its extension metadata; the ordinary safe HTML wrapper/content follow default rules.
- Explicit JSON import rejects an unknown marker so a missing extension cannot silently lose data.
- A known marker with a mismatched tag, missing required attribute or invalid value fails at both boundaries.
- The persisted format stays v1. An older reader without extension support may lose metadata: use the same definitions for editing, importing and rendering.

Module imports and definition compilation are safe without DOM. HTML parse/render and editor creation require browser DOM. The codec registers no global plugins and loads no UI.

## Typed commands

```ts
import { createEditorCommand } from '@morfira-dev/wysiwyg';

const insertReference = createEditorCommand<{ id: string; label: string }>('app:insert-reference');
const unregister = editor.commands.register(insertReference, {
  validate: (payload) => {
    if (!payload || typeof payload !== 'object' ||
        !('id' in payload) || typeof payload.id !== 'string' ||
        !payload.id.trim() || payload.id.length > 64 ||
        !('label' in payload) || typeof payload.label !== 'string') {
      throw new TypeError('Invalid reference payload.');
    }
    return { id: payload.id, label: payload.label };
  },
  execute: (instance, payload) => {
    const span = instance.surface.ownerDocument.createElement('span');
    span.setAttribute('data-mw-node', 'app:reference');
    span.setAttribute('data-id', payload.id);
    span.textContent = payload.label;
    instance.insertHTML(span.outerHTML);
  },
  isEnabled: (instance) => instance.getSelection() !== undefined,
  isActive: () => false,
  isMixed: () => false,
});

const state = editor.commands.getState(insertReference);
const accepted = editor.commands.execute(insertReference, { id: 'TASK-42', label: 'Task' });
unregister();
unregister(); // Idempotent.
```

Tokens are immutable and selected by **object identity**; names are diagnostic. Two separately created tokens with the same name are different commands. Keep the token and export it from the owning plugin module. Payloads are typed at registration and invocation; network/form input still requires runtime validation.

| Method | Behavior |
| --- | --- |
| `register(token, definition)` | One registration per token/instance; returns idempotent unregister |
| `getState(token)` | A fresh `{ enabled, active, mixed }` snapshot; enabled includes read-only/composition guards |
| `execute(token, payload)` | Returns `false` when blocked; otherwise executes synchronously inside a transaction and returns `true` |

Missing registrations throw. An accepted no-op command may return `true` without adding history. Nested commands share one transaction/undo step; validation/execution failure rolls back content and history. Validators and state readers must be synchronous and side-effect-free; async/thenable callbacks are unsupported. Execution may call existing editor commands within the shared transaction.

Commands are trusted application code, not a sandbox. Complete external requests before opening a transaction; do not schedule DOM mutation after the callback returns. Events remain notifications rather than command substitutes. UI refreshes state using existing change/selection/read-only events.

Destroying the editor clears registrations. A plugin returns cleanup that calls its unregister functions and subscriptions; repeated unregister is safe and cannot remove a later registration. Other calls after editor destruction fail.

## Phase-1 limits and size

A semantic wrapper is not yet a separate renderer or atom: its children remain natively editable. The schema is fixed at instance creation; live re-registration is not provided. Mapped structural selection, decorations and node views belong to later SDK phases.

The core import loads no optional plugins/UI or framework runtime. CSS imports stay explicit. Measure selected core/plugin closures as minified/gzip/Brotli, with CSS separate and shared chunks counted once. See [architecture and size](/en/architecture), [events](/en/events) and [roadmap/limits](/en/roadmap).

Phase 1 validates node identity and attributes; arbitrary per-node child/content rules cannot yet be registered.

For post-input extension observers, see [controlled input commit receipts](/en/events#controlled-input-commit-receipts): `EditorInputCommit` covers only validated controlled Enter/clipboard paths, not arbitrary input or a cancellable transform. Follow-up commands remain separate history operations.
