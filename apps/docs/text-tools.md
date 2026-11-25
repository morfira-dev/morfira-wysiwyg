<script setup>
import TextToolsExample from './.vitepress/theme/TextToolsExample.vue';
</script>

# Text layout and format painter

Two independent plugins extend everyday formatting: `textLayout()` manages line
height and paragraph spacing; `formatPainter()` copies inline formatting. Neither
is installed by presets, and neither has runtime dependencies. UI and CSS are
separate imports.

<TextToolsExample />

## Setup

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { textLayout, textLayoutCommands } from '@morfira-dev/wysiwyg/plugins/text-layout';
import { formatPainter, formatPainterCommands } from '@morfira-dev/wysiwyg/plugins/format-painter';
import { createTextLayoutUI } from '@morfira-dev/wysiwyg/ui/text-layout';
import { createFormatPainterUI } from '@morfira-dev/wysiwyg/ui/format-painter';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/ui/text-layout.css';
import '@morfira-dev/wysiwyg/ui/format-painter.css';

const editor = createEditor(host, { plugins: [textLayout(), formatPainter()] });
const spacing = textLayoutCommands(editor);
const painter = formatPainterCommands(editor);
const layoutUI = createTextLayoutUI(layoutHost, editor);
const painterUI = createFormatPainterUI(painterHost, editor);
// Hosts are empty connected elements outside the editor document.
// On unmount: layoutUI.destroy(); painterUI.destroy(); editor.destroy();
```

## Spacing

| Method | Value |
| --- | --- |
| `setLineHeight(value)` | Number 0.5–4, at most three decimals; `false` resets |
| `setSpaceBefore(value)` | Integer 0–96 px before the paragraph; `false` resets |
| `setSpaceAfter(value)` | Integer 0–96 px after the paragraph; `false` resets |
| `getState()` | `disabled`, `lineHeight`, `spaceBefore`, `spaceAfter` and three `*Mixed` flags |

State reports explicit values, not computed theme styles. Absent and mixed values
return `false`, with separate mixed flags. A safe imported value outside the
predefined UI choices is shown as “Current”. Reset restores inheritance/application
CSS. Adjacent paragraph margins can collapse under ordinary CSS rules; this is
not a promise of a fixed pixel gap.

The target is an ordinary P/H1–H6 at a caret or a sibling interval sharing one
parent and table cell. Paragraphs/headings inside list items and quotes work.
Cross-item, cross-cell, intervening list branches, PRE, semantic nodes and blocks
containing images refuse. An endpoint at the next block's start includes that
block. Commands retain actual nodes and selection direction; one change is one
Undo. Read-only and composition block mutations.

`line-height`, `margin-top`, and `margin-bottom` round-trip through HTML/JSON even
without the plugin, only on P/H1–H6 and within the stated bounds. Arbitrary CSS,
percentages, functions and negative spacing are rejected. Schema v1 is retained;
older readers may lose these styles.

## Format painter

`capture(): boolean` remembers uniform formatting at a caret or within a selected
range **inside one ordinary paragraph/heading**. It copies bold, italic, underline,
strike, code, subscript, superscript, color, background, font family and font size.
Absent properties become resets. A mixed source refuses without replacing a
previous snapshot.

`apply(): boolean` replaces these formats only on selected text inside one ordinary
block. Links, unselected text, structure, mention IDs, paragraph spacing and heading
type are not copied. Semantic/image-containing blocks and structural selections
are unsupported. Apply is one history transaction. The snapshot remains available
for subsequent applications; `clear()` removes it. `getState()` returns `captured`,
`canCapture`, and `canApply`.

Snapshots are per editor; external API replacement and destroy clear them. Capture
is observational, allowed in read-only and refused during composition. Apply is
blocked in read-only/composition and rechecks exact target points after focus so
an application callback cannot redirect the old command onto a new selection.
External UI uses revision-bound selection handles and refuses stale targets. UI
responds to RU/EN locale, read-only and destroy; controller disposal removes all
owned listeners.

This example does not establish physical-device or screen-reader coverage.

Both optional UI stylesheets use native CSS nesting: Chrome 112+, Firefox 117+,
Safari 16.5+. This applies only to these styles, not headless commands or core.
Applications supporting older CSS engines can transform them in their CSS toolchain.
