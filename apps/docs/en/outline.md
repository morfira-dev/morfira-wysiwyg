# Document outline

`createOutlineUI` lists ordinary `h1`–`h6` headings in document order and moves the caret to the chosen heading. It helps navigate long text without adding IDs, anchors or persisted nodes. On the homepage and [playground](/en/playground), open “Print and outline” and load the reading sample.

This is an independent UI module outside core and presets. The list observes actual headings in the current editor; it is not a mapped-position SDK or automatic section numbering.

## Setup

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { createOutlineUI } from '@morfira-dev/wysiwyg/ui/outline';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/ui/outline.css';

const editor = createEditor(editorHost, {
  locale: 'en',
  value: '<h2>Plan</h2><p>Overview</p><h3>Details</h3><p>Text</p>',
});
const outline = createOutlineUI(outlineHost, editor, {
  maxHeadings: 100,
  onError: (error) => console.error(error),
});
```

`outlineHost` is an empty connected HTML host in the same document, outside editor content. Place it in a sidebar or alongside the document. CSS is separate and uses scoped `--mw-*` theming without loading fonts.

## API and updates

| Option | Behavior |
| --- | --- |
| `label?: string` | Accessible navigation name, up to 160 characters without control codes |
| `maxHeadings?: number` | Integer 1–500, default 100 |
| `onError?: (error: unknown) => void` | Application diagnostics; arbitrary error text is not displayed |

`OutlineUIController` exposes `element`, `refresh()` and idempotent `destroy()`. `refresh()` rejects after disposal. The entry also exports `OutlineUIOptions`, `OutlineUIMessageKey` and `outlineUIMessages`.

The outline initializes on creation and follows committed changes, external value replacement, Undo/Redo and locale changes. Multiple changes coalesce into one animation frame. It does not capture complete document JSON on every keystroke. Applications can explicitly update the view with `refresh()`.

## Included headings

Ordinary headings are supported, including headings in supported lists, quotes and table cells. Semantic headings and protected semantic ancestors, `pre/code` and `figure/figcaption` are excluded; applications may supply a separate policy for their custom nodes.

Labels are literal text, never copied HTML. Empty headings receive a localized label; long labels are bounded to 300 code units with an ellipsis. When heading count exceeds the limit, the view lists the bounded entries and reports truncation. The limit does not remove headings from the document.

The list uses native buttons and shows heading level. Tab visits buttons, Enter/Space activate navigation. This is not an ARIA tree widget. `aria-current` may mark the heading containing the current caret; a selection spanning multiple headings does not claim one active section.

## Navigation and safety

Navigation intentionally changes focus, selection and scrolling. It sets a native collapsed Range at the beginning of the same actual heading without changing content, pending formats or history. Read-only permits navigation.

A button owns a concrete node and view generation, not a saved numeric offset or matching text. If a focus callback replaces content, destroys UI or removes the heading, stale navigation cannot select another node with a similar label. Scrolling uses no smooth animation. Complete screen-reader and mobile-device validation is not claimed.

## Lifecycle

```ts
outline.refresh();
outline.destroy();
editor.destroy();
```

Each instance owns its controls, retained node references, events and queued frame. Editor destruction releases the outline. Detached/adopted hosts and retained stale buttons do not gain navigation authority. Ownership observation follows removal paths rather than the whole document subtree.

Actual Chromium/Firefox/WebKit regressions, RU/EN demo results, sizes and public imports are recorded separately; an example does not prove every editor structure has been tested.
