<script setup>
import CodeBlocksExample from '../.vitepress/theme/CodeBlocksExample.vue';
</script>

# Code blocks

An optional plugin persists literal source, language, spaces, tabs and line breaks. A separate modal inserts or edits code, selects its language and copies the source. Application-owned highlighting is independent and never changes the persisted document.

<CodeBlocksExample />

## Installation

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { codeBlocks, codeBlockCommands } from '@morfira-dev/wysiwyg/plugins/code-blocks';
import { createCodeBlockForm, createCodeBlockView } from '@morfira-dev/wysiwyg/ui/code-blocks';
import '@morfira-dev/wysiwyg/ui/code-blocks.css';

const editor = createEditor(host, { plugins: [codeBlocks()] });
const commands = codeBlockCommands(editor);
const form = createCodeBlockForm(formHost, editor);
const view = createCodeBlockView(viewHost, editor); // Literal text without a provider.
editor.setSelection(0);
commands.insert({ source: 'const sum = (a, b) => a + b;\n', language: 'javascript' });
// formHost/viewHost are outside editor.surface in the same document.
```

## API and keyboard

`codeBlocks({ languages? })` accepts 1–32 unique language IDs matching `[a-z][a-z0-9-]{0,31}`; `plaintext` is always available and counts towards the limit. Defaults are plaintext, typescript, javascript, html, css, json and bash. No grammar is automatically loaded.

`commands.languages` is immutable. `insert({source, language?})` splits an ordinary root paragraph/heading at a collapsed caret and preserves both sides around PRE. Cross-block selections, lists and tables are outside this insertion command. `update(actualPRE, value)`, `remove(actualPRE)`, `get(actualPRE)` and `exit(actualPRE)` accept only current owned root PRE nodes; edits participate in Undo/Redo.

Inside PRE, Enter/Shift+Enter insert LF, Tab inserts a literal tab and Ctrl/⌘+Enter creates an ordinary following paragraph. Backspace at the start and Delete at the end do not merge code with neighboring blocks. Ordinary interior typing/deletion and IME remain native; commands do not interfere during composition. Paste accepts plain text only, without interpreting HTML or files. Shift+Tab retains standard focus navigation.

`form.open()` captures the current insertion position; `form.open(actualPRE)` edits a target. `getValue()`/`setValue({source,language?})` read/change the draft, `close()` cancels and `destroy()` cleans up. Ordinary Enter in the textarea preserves LF; Ctrl/⌘+Enter applies. Copy uses Clipboard API on an explicit click; denial does not change the document. Call `form.destroy()`, `view.destroy()` and `editor.destroy()` on unmount.

## Optional highlighting

```ts
const view = createCodeBlockView(viewHost, editor, {
  highlight: async ({ source, language, signal }) => {
    // The application chooses and optionally lazy-loads its own provider.
    // Return UTF-16 ranges, never HTML.
    return source.startsWith('const')
      ? [{ from: 0, to: 5, kind: 'keyword' as const }]
      : [];
  },
});
```

Allowed kinds are `keyword`, `string`, `number`, `comment`, `operator`, `punctuation`, `type`; at most 4096 ordered nonoverlapping ranges within the source. Rendering uses text nodes and spans with fixed CSS classes. Invalid responses/errors retain literal text. Source updates and destroy abort requests through `AbortSignal` and ignore late results. UI/CSS are explicit; customize through `--mw-code-*` and `--mw-*` variables.

## Limits and security

Persistence uses a schema-v1 PRE with `data-mw-node="morfira:code-block"`, an allowed `data-language` and text bounded to 20000 UTF-16 units. CRLF/CR normalize to LF; other spaces and trailing LF survive. HTML/JSON retain the shared validation boundary; receiving editors need this plugin to preserve language metadata. Older readers may retain PRE text and lose metadata.

Source is never executed. No bundled code IDE, compiler, network grammar loader or arbitrary-HTML highlighting exists. Real-device/IME behavior is not separately certified. Providers are trusted application code; CSP and server validation retain their own responsibilities.

The optional form/preview stylesheet uses native CSS nesting: Chrome 112+, Firefox 117+, Safari 16.5+. This is a requirement of that separate UI stylesheet; behavior commands and the persisted format do not depend on it.
