# Horizontal rule

[Try the homepage](/#editor) or [feature laboratory](/playground): open **Horizontal rule**, click **Load horizontal rule sample**, then **Horizontal rule in the formatting toolbar**. Loading replaces the document, resets history and places the caret inside the bold word. Continue typing immediately after insertion; one Undo restores the original block and selection.

## Installation

Ready `standard` and `extended` presets include the command by default. `horizontalRule: false` excludes it from the selected configuration; use selective imports to exclude its code rather than the ready preset's static import graph. `minimal` and core do not install the plugin.

For explicit composition:

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { horizontalRule, horizontalRuleCommands } from '@morfira-dev/wysiwyg/plugins/horizontal-rule';
import '@morfira-dev/wysiwyg/style.css';

const editor = createEditor(host, {
  plugins: [horizontalRule()],
  value: '<p>Alpha <strong>one</strong> tail</p>',
});
const rules = horizontalRuleCommands(editor);
editor.setSelection(7);
if (!rules.getState().disabled) rules.insert();
```

This independent plugin has zero runtime dependencies and no mandatory CSS. Its imports are SSR-safe; create the editor in a browser. Core does not import it. The ready toolbar shows the button only when the plugin is installed. A custom external button must preserve and restore the editor's valid current selection.

## Behavior and API

`horizontalRuleCommands(editor)` provides `insert(): void` and `getState(range?: Range): HorizontalRuleState`. State is a fresh `{ disabled: boolean }` snapshot; read-only, composition, missing or unsupported selection disables insertion. A disabled command leaves content, selection and history unchanged. Resolving the API without installation or using retained handles after destruction throws.

External UI can use `getState(savedRange)` to read eligibility against a remembered native Range. Reading changes neither the live selection, DOM, history nor notifications; read-only and composition guards still apply. This is not execution authority: `insert()` always checks the current native selection. Restore a valid remembered range before activating a custom button. The ready toolbar handles this itself.

A caret or range wholly inside **one ordinary `p` or `h1`–`h6` directly under the editor surface** is supported. Selected content is replaced with: original prefix → ordinary `<hr>` → suffix. Both edge blocks retain the source tag, attributes and remaining inline formatting; an empty edge receives an editable `<br>`. Neighboring blocks remain in place.

**A heading remains a heading on both sides**, including an empty suffix. Choose Paragraph in the formatting toolbar to continue as ordinary text. The post-insertion caret starts in the actual suffix block, after the HR rather than on the separator itself. An initially collapsed caret retains its effective typing formats. Replacing a selected range does not restore stale formats from an earlier caret, even when the text offset matches.

Successful insertion is one transaction, one change notification and one Undo step. Undo restores content and selection direction; Redo restores the separator and suffix caret. External document replacement follows the existing API contract.

## Format and limits

Persisted content is an ordinary schema-v1 HR without attributes, roles, a custom marker or UI nodes. HTML/JSON retain it without this plugin. The Markdown HR shortcut remains independently selectable.

Cross-block ranges, root-level boundary positions, lists, quotes, tables, captions, `pre` and blocks containing owning `data-mw-node` markers are unsupported. A source block containing any `img` is also disabled, even if the image is outside the selection: this first slice does not clone retained resource-bearing nodes merely to split text. Any owning semantic descendant likewise disables the entire source block, even outside the selection. This is a bounded structural command; the example does not promise equivalent behavior for arbitrary `insertHTML('<hr>')`.

Content color and vertical spacing use scoped CSS variables `--mw-horizontal-rule-color` and `--mw-horizontal-rule-spacing`, falling back to the editor border color and `1em`. These core styles also apply to HR produced by Markdown shortcuts.

Native HR provides separator semantics; the command adds no focusability or interactive decorations. Complete separator-navigation accessibility is not claimed. See the [roadmap](/roadmap#verification-and-limits) for actual executed checks and sizes.
