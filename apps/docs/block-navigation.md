<script setup>
import BlockNavigationExample from './.vitepress/theme/BlockNavigationExample.vue';
</script>

# Navigating around non-text blocks

This separate plugin lets users move before/after an image or divider and type between adjacent objects. Supported objects are direct editor-root `hr`, `img`, an ordinary image figure with an optional caption, and a registered text-only semantic figure such as a media placeholder. The plugin does not load images or videos itself.

<BlockNavigationExample />

## Keyboard

| Action | Result |
| --- | --- |
| `→` at an ordinary paragraph end before an object | Select the adjacent object |
| `←` at a paragraph start after an object | Select the adjacent object |
| `←` / `↑` on a selected object | Place the caret immediately before it |
| `→` / `↓` on a selected object | Place the caret immediately after it |
| Arrow at a root gap | Select an adjacent object or enter an ordinary paragraph/heading |
| `Enter` / `Shift+Enter` on an object | Insert a paragraph after / before it |
| Typing at a gap | Create an ordinary paragraph containing the literal text |
| Typing over an exact object selection | Replace the object with an ordinary text paragraph |
| `Backspace` / `Delete` beside an object | Select it first; a subsequent deletion key removes it |

Navigation does not create history. Paragraph insertion and removal are individual Undo/Redo operations. Removing the only object leaves an editable empty paragraph. Image captions remain editable text; a caption caret does not become an object selection.

## Installation and application controls

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { blockNavigation, blockNavigationCommands } from '@morfira-dev/wysiwyg/plugins/block-navigation';

const editor = createEditor(host, {
  value: '<p>Before</p><hr><hr><p>After</p>',
  plugins: [blockNavigation()],
});
const navigation = blockNavigationCommands(editor);
const divider = editor.surface.querySelector('hr');
if (divider) navigation.select(divider);
navigation.insertParagraph('after');
// getSelected() observes the actual current selection; it is not saved authority.
const selected = navigation.getSelected();
editor.destroy();
```

No stylesheet or runtime dependency is required. Presets do not install the plugin automatically. `select()` and `insertParagraph()` return `false` for unsupported/stale targets, read-only, composition and disposal. Each editor owns its listeners and API, which are released on destruction.

## Limits

Tables, nested lists/quotes, complex figures, unknown semantic nodes and inline atoms keep their existing owners. No persisted cursor marker or HTML/JSON format change is introduced. Shift selections, OS shortcuts, clipboard/drop and editing inside objects retain existing behavior. This is not a universal structural cursor or evidence of real-device/OS IME support.
