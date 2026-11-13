# Markdown shortcuts

The optional `/plugins/markdown` module converts **keyboard-typed** markers into normal semantic editor nodes. These are typing shortcuts, not a Markdown parser: HTML/JSON loading, programmatic HTML insertion and paste do not trigger conversion. Documents retain schema v1, without source markers or invisible sentinel characters.

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { markdownShortcuts, markdownCommands } from '@morfira-dev/wysiwyg/plugins/markdown';

const editor = createEditor(host, {
  plugins: [markdownShortcuts({ enabled: true, blocks: true, inline: true })],
});
const shortcuts = markdownCommands(editor);
shortcuts.setEnabled(false); // literal input
shortcuts.setEnabled(true);
const state = shortcuts.getState(); // { enabled, blocks, inline }
```

All flags default to true; invalid values reject before installation. Options are copied. Configure blocks/inline at creation, then toggle enabled at runtime. This is an instance preference: toggling changes no content/history and is allowed in read-only mode. getState returns an independent snapshot. Commands become unavailable and handlers are removed after destroy.

## Block markers

At the beginning of an ordinary paragraph, type a marker followed by **Space**:

| Marker | Result |
| --- | --- |
| `#` … `######` | H1 … H6 |
| `>` | `blockquote` |
| `-`, `*`, `+` | One-item bullet list |
| `1.`, `1)` | One-item numbered list |
| Three backticks | Plain `pre` block without a syntax language |
| `---`, `***`, `___` | Horizontal rule and a following typing paragraph |

Three backticks and horizontal-rule markers also support **Enter** when the marker occupies the whole paragraph. Enter after `#` and other markers remains ordinary input. Space conversion retains rich suffix content after the caret and places the caret before it. For example, put the caret after `##` in `##Tail`, then press Space: Tail becomes H2 content.

Rules apply to ordinary p nodes, including paragraphs in merged table cells without altering rowspan/colspan. Existing headings, list items, quotes, pre/code, links and figure/captions are not reinterpreted as block shortcuts. Other starting numbers (2., 10.) and language fences such as three backticks followed by ts stay literal. Adjacent lists may remain separate; list structure belongs to existing list commands.

## Inline markers

Conversion happens when the **last closing character** is typed:

| Input | Result |
| --- | --- |
| `**text**`, `__text__` | `strong` |
| `*text*`, `_text_` | `em` |
| `~~text~~` | `s` |
| A single pair of backticks | `code` |

Bodies must be nonempty, without leading/trailing whitespace, newlines or the active delimiter character; maximum 2000 UTF-16 units. Existing ordinary inline styles and neighboring nodes remain intact. The caret ends after the new fragment; subsequent input continues outside the newly created format.

Rules stay within one paragraph/heading/item/quote text flow. They never cross br, images, hr, links, code/pre, figures/captions or nested blocks. Markers spanning an image therefore remain literal. An existing wrapper of the same format is not wrapped again.

An opener must start the flow or follow a character other than a Unicode letter/number/combining mark/connector punctuation. Thus name_word_ does not turn part of an identifier into italic. For underscores, the character after the closing marker is checked too. An odd number of backslashes escapes the opener; ambiguous triple markers remain literal. Nested Markdown syntax is not parsed recursively. While a backtick opener is unmatched, inner inline markers remain literal: typing backticks around `**x**` creates code containing `**x**`, without strong. An escaped backtick does not open that protected range.

## Undo and events

Each conversion is one transaction and one user change. **Undo restores the literal document and caret before the trigger key**, rather than the fully completed Markdown:

- `##` + Space → H2; Undo → `##` without the space.
- `**bold*` + the final `*` → strong; Undo → `**bold*` without the last asterisk.
- Three backticks + Enter → pre; Undo → the literal fence without Enter.

Redo restores the converted result. Text typed afterwards follows normal history. Pending inline formatting may change without another document revision so subsequent input does not continue the newly applied mark.

Read-only, IME composition, noncollapsed selections, multi-character insertText, paste/drop and programmatic replacement are skipped. compositionend does not retroactively convert text. Unmatched events stay native; list keyboard behavior and table Tab navigation continue to work.

On the [homepage](/en/#editor) and [playground](/en/playground), choose Markdown shortcuts and use the enable switch. Sample loading remains literal: place the caret after a marker and type Space/the final delimiter to try conversion. Full Markdown import/export, language fences, regex settings, paste conversion and arbitrary custom rules are not implemented in this version. Core never requires this module; it adds no runtime dependencies.
