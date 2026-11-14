# Checklists

[Try the homepage](/en/#editor) or [feature laboratory](/en/playground): open **Checklists**, click **Load checklist** and place the caret in one item. Loading replaces the document and resets history.

This optional plugin has zero runtime dependencies. It uses ordinary `ul`/`ol` and `li`: task and ordinary items may share the same list. Ready presets **do not install it automatically** yet.

## Installation

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { checklists, checklistCommands } from '@morfira-dev/wysiwyg/plugins/checklists';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/plugins/checklists.css';

const editor = createEditor(host, {
  plugins: [checklists()],
  value: '<ul><li data-checklist-checked="false">Write an idea</li><li data-checklist-checked="true">Save the result</li><li>Ordinary item</li></ul>',
});
const tasks = checklistCommands(editor);
```

Install the plugin before parsing the initial document. With a preset, use its existing `plugins` option:

```ts
const options = createStandardPreset({ plugins: [checklists()] });
const editor = createEditor(host, options);
```

Import `createStandardPreset` from `@morfira-dev/wysiwyg/presets/standard`; this is explicit composition, not a change to the preset's built-in feature set. CSS is explicit and loads no fonts or icon library.

## Commands and state

Commands use the actual browser selection inside the editor. A caret or range wholly inside **one** ordinary `li` of a `ul`/`ol` is supported. `insert()` also accepts one ordinary paragraph or heading directly under the editor surface.

| Method | Result |
| --- | --- |
| `insert()` | Marks an ordinary item incomplete; converts a root paragraph/heading into a bullet task item. Preserves an existing task's checked state |
| `setChecked(true)` / `setChecked(false)` | Sets the selected task's state |
| `toggle()` | Toggles the selected task's state |
| `remove()` | Removes task metadata while keeping the ordinary item, its content and list structure |
| `getState()` | Returns a fresh `{ disabled, active, checked }` snapshot |

`disabled` reflects `insert()` eligibility, including read-only, composition and unsupported selection. `active` identifies a selected task, while `checked` is its state or `undefined`. A task can remain active in read-only, but commands cannot mutate it. `setChecked`/`toggle`/`remove` also require `active: true`. Disabled commands are no-ops; an enabled `setChecked` validates a boolean argument. Retained command handles throw after editor destruction.

An actual change is one ordinary transaction, Undo step and change notification; a no-op adds no history. Refresh external controls through existing editor events rather than a separate global task model. Read-only does not block external HTML/JSON synchronization.

## Input and persisted format

Enter preserves the source item's state and makes the new task incomplete. Shift+Enter keeps the state. Indent/outdent moves the actual `li` with its metadata. Joins retain the surviving first item's state; exiting into an ordinary paragraph drops LI metadata. Existing bounded list-editing profiles apply rather than arbitrary tree transformation.

State is stored only as `data-checklist-checked="false"` or `"true"` on `li`, without a container marker, `input` or persisted UI nodes. With the plugin installed, metadata survives HTML/JSON, paste, external replacements and Undo/Redo. An invalid registered value is rejected before live mutation.

**Without the plugin or equivalent schema, task metadata is removed from both HTML and JSON.** Ordinary text and list content remain; preserving task semantics through such a reader is not guaranteed. This is not owning `data-mw-node` identity or a promise of plugin-free round trips.

## UI and limits

In this slice, optional CSS draws a visual marker; ordinary external demo buttons perform actions. These buttons preserve selection, have accessible labels and respect read-only. The marker **is not a native checkbox**: gutter clicks, a custom shortcut, atoms and node views are not added; complete checklist accessibility is not claimed. Do not persist `input` elements as a substitute for this contract.

Bulk commands spanning multiple items, endpoints inside owning `data-mw-node` elements (including inline nodes), foreign namespaces and cross-block ranges are unsupported. Destroying the editor releases its handlers. New plugin sizes and executed checks are recorded separately from the preceding editor slice in the [roadmap](/en/roadmap#verification-and-limits).
