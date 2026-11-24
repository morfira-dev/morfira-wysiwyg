<script setup>
import ListQuoteInputExample from './.vitepress/theme/ListQuoteInputExample.vue';
</script>

# Deletion at list quote boundaries

Within one list item, Backspace at the start of the right paragraph/heading and Delete at the end of the left join neighboring ordinary text blocks. Supported pairs are two blocks inside one quote, quote → direct item body, direct body → quote, and neighboring quotes. This is core behavior; no separate plugin is required. Enter and paste retain their existing contracts.

<ListQuoteInputExample />

## Try the boundaries

Choose a scenario. **“Right block start — Backspace”** places a real native caret at the beginning of the right block and focuses the editor; then press Backspace. For the symmetric action, choose **“Left block end — Delete”** and press Delete. Buttons do not synthesize input events or call a separate deletion command.

The left block retains its tag and attributes, receiving the right contents with inline marks. For example, `p: Alpha one` + `h3: Beta tail` become the original `p` containing `Alpha oneBeta tail`; no space is automatically inserted. The caret stays at the join. Remaining blocks and nonempty quote fragments preserve their order and formatting; an emptied quote wrapper is removed. The outer list, other items and nested branches are never flattened.

**“Undo”** restores previous contents and selection in one operation; **“Redo”** restores the result. Read-only keeps boundary navigation available while blocking keyboard mutation. Resetting/changing a sample uses external `setHTML()` replacement, which clears history.

## Supported boundaries

| Boundary | Result |
| --- | --- |
| `blockquote > p` → `blockquote > h3` within one quote | The left `p` stays in its quote; the right `h3` is removed after moving its contents |
| Last quote block → direct `p/h1–h6` in the item | Join in the left block inside the quote |
| Direct item `p/h1–h6` → first quote block | Join in the direct left block; remaining quote blocks survive |
| Last block of the first quote → first block of its neighbor | The left quote/block survive; a nonempty remainder of the right quote stays separate |
| A nested `ul/ol` lies between the text blocks | Barrier: deletion does not join across that branch |

Inline-only quotes can also be leaf blocks. Ordinary neighboring paragraphs/headings in an item containing a direct quote are supported too; all other barriers remain.

This slice requires a collapsed caret at an actual boundary of ordinary paragraphs/headings owned by one `li`. It does not extend editing to arbitrary semantic nodes, atoms, tables or crossing list items/levels. Read-only, composition and protected-owner guards retain their existing rules. A live example is not proof of passing browser scenarios: actual execution results belong in the [verification record](/testing).

## Composition

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import '@morfira-dev/wysiwyg/style.css';

const editor = createEditor(host, {
  locale: 'en',
  value: '<ul><li><blockquote><p>Left</p><h3>Right</h3></blockquote></li></ul>',
});
// Core handles input; history and read-only use the ordinary API.
editor.undo();
editor.redo();
editor.setReadOnly(true);
// On unmount:
editor.destroy();
```

The example uses only public APIs and Selection/Range to place the caret. Controls/instructions never enter persisted content. HTML/JSON validation, forbidden executable markup and document limits retain the ordinary [security boundaries](/security).
