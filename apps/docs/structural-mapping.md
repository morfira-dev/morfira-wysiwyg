<script setup>
import StructuralMappingExample from './.vitepress/theme/StructuralMappingExample.vue';
</script>

# Structural positions and operations

<ClientOnly><StructuralMappingExample /></ClientOnly>

A text offset cannot distinguish empty paragraphs or represent a moved nested
list branch. Additional node positions use a text-leaf path and UTF-16 offset.
Each path ordinal counts **element children**, not whitespace Text nodes or
comments. Positions are observations, never permission to mutate a document.

```ts
import { structuralCommands } from '@morfira-dev/wysiwyg/sdk';

const point = editor.positions.trackNode([0], 3, 1);
const changed = structuralCommands(editor).apply([
  { kind: 'split', path: [0], offset: 3 },
]);
const current = point && editor.positions.resolveNode(point);
if (current && !current.deleted) console.log(current.path, current.offset);
if (point) editor.positions.releaseNode(point);
```

The command requires a native selection owned by the editor. The helper rechecks
it after focus and performs actual DOM operations, retaining unaffected nodes and
moved branches. Undo/Redo map through the actual history entry; a deleted logical
position remains `deleted` rather than silently reviving.

| Step | Contract |
| --- | --- |
| `split` | Ordinary text-only P/H1–H6 at offset 0…length; the right leaf retains attributes |
| `join` | Two immediately adjacent text-only P/H1–H6; retain the left tag and attributes |
| `insert` | Validated whole blocks/list items under a supported parent |
| `remove` | Remove one supported whole block/item while retaining neighbours |
| `move` | Move a whole block/LI with its branch; read `parent` and `index` **after removing the source** |

Root accepts P/H and UL/OL; UL/OL accept LI; LI accepts P/H and nested lists;
ordinary blockquotes accept P/H. Tracking accepts text-only P/H and LI leaves.
An empty leaf with one BR placeholder supports offset 0; mixed BR/inline markup,
semantic leaves and internal BR coordinates are outside this profile.

A custom guarded DOM command can pass `structuralMapping` to `editor.transact`.
Plans are bounded to 32 steps, 64-deep paths and existing document resource limits.
Core replays the plan against validated model data before the callback, then checks
the exact normalized result. A mismatch rolls back atomically.

There is no automatic mapping for native input. Unknown edits expire positions.
Text-only plans expire node positions; structural-only plans expire global text
positions. Both valid plans can be supplied together. This is an SDK extension,
not OT/CRDT, universal structural selection or a replacement editing engine.


A plan with unchanged canonical HTML creates no history entry. Physically swapping
indistinguishable nodes may expire observations; this API does not invent persistent
model IDs. Structure changes with unchanged text, including paragraph splits and
moving distinct empty P/H leaves, remain supported.
