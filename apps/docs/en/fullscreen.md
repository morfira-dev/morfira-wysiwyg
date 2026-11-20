# Fullscreen workspace

`createFullscreenUI` expands the existing editor workspace to the viewport. The editor, toolbar and adapter wrappers keep their actual DOM nodes: the document, current caret, selection and Undo are not recreated. On the homepage and in the [playground](/en/playground), “Enter fullscreen” sits above the workspace.

This optional CSS mode does not call the browser Fullscreen API. The address bar and browser chrome stay visible. The module is not implicitly installed by core or presets, adds no persisted node type, and has no framework/runtime dependency.

## Setup

The application-owned `workspace` must already contain the real editor, toolbar and empty button host. The module does not move the editor into another overlay or remount its adapter.

```html
<section id="workspace" class="editor-workspace">
  <div id="fullscreen-controls"></div>
  <div id="toolbar"></div>
  <div id="editor"></div>
</section>
```

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { createStandardPreset } from '@morfira-dev/wysiwyg/presets/standard';
import { createStandardEditorUI } from '@morfira-dev/wysiwyg/ui/standard';
import { createFullscreenUI } from '@morfira-dev/wysiwyg/ui/fullscreen';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/plugins/tables.css';
import '@morfira-dev/wysiwyg/ui/editor.css';
import '@morfira-dev/wysiwyg/ui/forms.css';
import '@morfira-dev/wysiwyg/ui/fullscreen.css';

const workspace = document.getElementById('workspace')!;
const fullscreenHost = document.getElementById('fullscreen-controls')!;
const toolbarHost = document.getElementById('toolbar')!;
const editorHost = document.getElementById('editor')!;
const editor = createEditor(editorHost, createStandardPreset({
  locale: 'en',
  value: '<p>The same document in a larger workspace.</p>',
}));
const toolbar = createStandardEditorUI(toolbarHost, editor);
const fullscreen = createFullscreenUI(fullscreenHost, editor, {
  target: workspace,
  onChange: (active) => console.log('Fullscreen workspace:', active),
  onError: (error) => console.error(error),
});

// workspace contains fullscreenHost, toolbarHost and editorHost.
// Dispose the UI owned by an adapter wrapper when that wrapper unmounts.
const dispose = () => {
  fullscreen.destroy();
  toolbar.destroy();
  editor.destroy();
};
```

`fullscreenHost` is an empty connected HTML element in the same document, outside persisted editor content. Both target and host must belong to that document’s light DOM: ShadowRoot and slotted wrappers are outside this first slice. The existing light-DOM Web Component can use an ordinary external workspace wrapper. `workspace` is a connected HTML ancestor of `editor.element` and the button host. Do not use persisted editor content or a wrapper nested inside editor content as `target`. Invalid configuration rejects without partially mounted controls or style changes.

## API

```ts
import type {
  FullscreenUIOptions,
  FullscreenUIController,
  FullscreenUIMessageKey,
} from '@morfira-dev/wysiwyg/ui/fullscreen';
import { fullscreenUIMessages } from '@morfira-dev/wysiwyg/ui/fullscreen';
```

| API | Behavior |
| --- | --- |
| `createFullscreenUI(host, editor, options)` | Creates an independent button for `options.target`. |
| `options.target` | Required workspace containing the editor and button host. |
| `options.label?` | Custom accessible button name; its visible Enter/Exit caption remains localized. |
| `options.onChange?` | `(active: boolean) => void` notification after a mode transition, not a document command. |
| `options.onError?` | Optional diagnostics supplied by trusted application code. |
| `controller.element` | The same native button, with localized text and `aria-pressed`. |
| `enter(): boolean` | Returns `true` when this workspace is active; declines owner conflicts or unsuitable state. |
| `exit(): void` | Restores normal layout and releases owned styles and observation. |
| `toggle(): boolean` | Toggles mode and returns the resulting active state. |
| `isActive(): boolean` | Reports this controller’s state. |
| `refresh(): void` | Updates state and localization on the existing control. |
| `destroy(): void` | Idempotently releases the mode, button and subscriptions. Other methods are unavailable after disposal. |

Only one module-owned workspace can be active per document. Entering a second controller does not close the first or change its styles. Search, formatting and editing continue through the existing editor operations. Mode transitions do not add history steps; leaving an edited fullscreen workspace retains the current position rather than the selection captured at entry.

## Keyboard and state

The native button works with the keyboard and displays “Enter fullscreen” or “Exit fullscreen”. An unhandled `Escape` inside the active workspace exits. A nested menu or form gets its own Escape first: the module does not consume an already handled action. `F11` remains browser-owned.

Read-only still allows expanding the workspace for reading. Entry declines during IME composition; cancellation through API replacement or readonly does not require a later artificial `compositionend`. Application document synchronization while active preserves the mode without restoring a stale selection. Locale updates change the same button instead of replacing it.

This is not a modal dialog: it does not set `inert` on the rest of the page or install a global focus trap. Application modal and external-control policies remain application-owned. This description does not establish complete accessibility, real screen-reader, mobile-browser or OS IME verification.

## CSS and external overlays

Import `/ui/fullscreen.css` explicitly. The module adds only its owned `mw-fullscreen` class to the workspace. It does not copy page styles into persisted content or clone the document.

The ancestor chain must not use transform/filter/perspective or paint/layout containment that changes fixed-element geometry; unsupported environments decline. The module does not move the workspace to `body` to bypass these limits or manage unrelated overlays.

Contextual panels and image resize handles may use external hosts. Their layer must remain above the expanded workspace and their positioning must match the viewport. The demo keeps contextual tool hosts outside the workspace. Applications coordinate z-index, modal layers and CSS containment themselves.

While active, separate body overflow-x/y inline properties suppress background scrolling. Each property is restored only while its value and priority are still module-owned; concurrent application changes survive. The page scroll position at entry is also recorded and restored on exit only while the window has kept the module-recorded locked position; intervening application/user window scrolling is preserved. Editor destruction, workspace detachment/adoption or loss of ownership releases the module’s resources.

## Validation and size

This mode does not change insertion, HTML/JSON or the document format. Focused regressions should exercise viewport geometry, DOM identity, history/current selection, Escape, readonly/IME, competing owners and style cleanup. The demo does not establish complete browser/device coverage; the project verification record reports actual executed checks separately.

Measure minified JS, gzip, Brotli and CSS separately. The standalone UI has an 8000-byte gzip JS guard and a 2000-byte raw CSS guard; `standard-fullscreen-ready` keeps standard’s 80000-byte gzip JS / 20000-byte raw CSS budget. These are budgets, not claimed current measurements. Framework runtimes, fonts, source maps and declarations are excluded. Preview and printing remain separate tasks.

Customization does not require editing core styles:

```css
.editor-workspace {
  --mw-fullscreen-z-index: 900;
  --mw-fullscreen-background: var(--mw-surface, #fff);
  --mw-fullscreen-padding: 16px;
  --mw-fullscreen-button-radius: 6px;
}
```

Additional variables are `--mw-fullscreen-button-color`, `--mw-fullscreen-button-background`, `--mw-fullscreen-button-border` and shared `--mw-focus`. Coordinate the layer with application-owned external contextual controls.
