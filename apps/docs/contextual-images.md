# Contextual image properties

The [homepage](/#editor) and [playground](/playground) enable a separate **Contextual image properties** switch. Load its sample and select the image itself by clicking it or using **Select sample image**. The panel shows alt, stored dimensions, **Image properties** and **Remove image**. Automatic showing changes neither document/history nor focus.

## Installation

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { images, imageCommands } from '@morfira-dev/wysiwyg/plugins/images';
import { createContextualImageUI } from '@morfira-dev/wysiwyg/ui/contextual-image';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/ui/forms.css';
import '@morfira-dev/wysiwyg/ui/contextual-image.css';

const editor = createEditor(editorHost, {
  plugins: [images()],
  value: '<figure><img src="/logo.svg" alt="Morfira" width="120" height="80"><figcaption>Caption</figcaption></figure>',
});
const properties = createContextualImageUI(overlayHost, editor, { gap: 8 });
const selectImage = () => {
  const image = editor.surface.querySelector<HTMLImageElement>('img');
  if (image) imageCommands(editor).select(image);
};
const dispose = () => {
  properties.destroy();
  editor.destroy();
};
```

The `images()` plugin is required; missing it fails before UI mounts. Presets and ready UI do not install this module automatically. There are no runtime dependencies, frameworks, implicit CSS, new document format or atom/node-view model. Imports are SSR-safe; creation needs a browser.

`overlayHost` is an empty connected application-owned HTML element in the editor document, outside `editor.surface`. Fixed placement requires an appropriate viewport layer: transformed/filtered/perspective/paint-contained or clipping ancestors are unsupported. UI neither creates a global overlay service nor moves application nodes.

The controller provides `element`, `refresh()` and idempotent `destroy()`. Refresh after destroy throws; the editor remains usable. Owned forms, listeners, subscriptions, observers and queued geometry are released, including setup failure. Options are optional `label`, `onError` and finite `gap` 0–32 CSS px, default 8. Exports include `ContextualImageUIOptions`, `ContextualImageUIController`, `ContextualImageUIMessageKey` and RU/EN `contextualImageUIMessages`.

## Selection and commands

The module accepts an IMG node Range, a whole simple figure Range or a caret in its ordinary caption. For an IMG node Range, both endpoints share its direct parent and span exactly one child. An ordinary inline image and an image in a simple single-image figure qualify. The images plugin already selects IMG on click; `imageCommands(editor).select(image)` lets an application do so explicitly, including through a keyboard-accessible button.

Expanded caption ranges, mixed text/image or multiple-image ranges, complex figures, foreign nodes and owning semantic ancestors do not qualify. Caption carets inside links/code remain with their existing owner. These ranges are not reinterpreted as a new selection model. Text and link contextual tools handle their own selection shapes.

**Image properties** restores the exact saved Range and opens the existing [image form](/ui#images-and-application-owned-upload) with `mode: 'edit'`, focusing its URL field. It edits src/alt, dimensions and literal caption text. Enter updates the selected object; insertion and upload are absent. Blank width/height remove a dimension with aspect-ratio locking off; explicit values are integers 1–1000. Unchanged caption text is not rewritten, preserving its rich nodes when other metadata changes. An explicitly changed caption follows the existing plain-text contract.

The form includes a **Keep aspect ratio** checkbox, off by default. Enable it, edit one side and choose Update image or press Enter: the other side updates in the draft using the stored pair or already-loaded natural dimensions. Unknown proportions disable the checkbox. Invalid/blank locked dimensions are not applied; uncheck for independent sides and dimension reset. Changing the target or src does not transfer old proportions to another image. [Form details](/ui#preserving-proportions).

Metadata uses an existing command and one Undo step. Invalid URLs/dimensions leave the document unchanged and retain drafts for correction. Adding a caption to an inline image uses existing promotion to figure. **Remove image** removes a simple figure with its caption, or the selected inline IMG, preserving surrounding content; Undo restores it. The numeric form does not create handles: import [`createImageResizeUI`](/images#drag-resize-handles) independently for them; cropping remains unsupported.

The demo's separate **Image resize handles** toggle controls dragging. It does not implicitly install the contextual form. Dragging a selected IMG shows only an external outline until release; Escape cancels, and successful completion adds one Undo step. Focused handles support arrows and Shift+arrows. Resize handles still require an exact IMG selection; contextual properties additionally accept simple figures and ordinary caption carets. Mount each module in its own empty external host; the handle host must belong to a normal viewport-overlay layer.

## Focus, read-only and disposal

**Alt+F10** from this editable editor with an eligible IMG opens/focuses Image properties. This enters tools for an already selected image; it does not add arrow-key selection of arbitrary objects. **Escape** closes the form/panel and restores the exact node Range once. Outside interaction/focus departure dismisses without stealing focus; queued refresh of the same range does not immediately reopen. A new selection action or Alt+F10 reopens.

Locale changes update labels without resetting drafts. Selecting another/recreated image closes the old form rather than retargeting its draft. External API replacement synchronously invalidates the old target. Read-only may retain summary while disabling mutation and closing forms; Alt+F10 is not intercepted read-only because there is no enabled mutating control; IME composition hides tools. Actions recheck the actual IMG, document revision and restrictions after focus restoration; detached controls cannot edit a different object.

Geometry follows visible bounds, clipping, scroll, resize and VisualViewport. Narrow controls wrap/scroll. There is no timer polling or document-wide traversal. Showing, placement and dismissal create no history.

## Security and resources

Alt, dimensions, localized labels and errors render as text. The panel **never creates a second IMG**, thumbnail or remote preview; it reads geometry from the actual node. A valid document image can already fetch its src. An explicit src update may fetch a new resource; this is not a claim of zero network requests.

Existing image codec/plugin validation owns URLs, dimensions and text limits. Trusted application callbacks are not sandboxed. Server validation, resource-host policy, upload authorization and CSP remain application responsibilities. Creating or disposing edit mode starts no transport and does not cancel another owner's upload. Document mutations, read-only and composition still cancel a pending upload under the existing images-plugin contract. Frontend filtering is neither a server trust boundary nor complete security/accessibility/mobile certification.

Actual checks and sizes are recorded in the [roadmap](/roadmap#verification-and-limits). JS and CSS are measured separately; combining every optional module is not automatically a measured standard profile.

## Whole figures and caption carets

The demo provides **Select whole figure** and **Place caret in caption** buttons. A simple figure has one direct IMG and at most one direct figcaption. Properties and removal target that same image without creating another IMG. Panel placement follows the image, while the retained Range stays at its original caption position or around the figure.

Alt+F10 enters the tools. Escape before applying a draft returns the exact caret/range without changing the document. Metadata changes preserve an unchanged rich caption; removal deletes the simple figure with its caption and supports Undo. Read-only retains preview and blocks mutation. Changed/removed captions may end the old context; drafts never retarget another or Undo-recreated image. A link, code or semantic owner on the caption caret path excludes this image context.

This does not expand resize-handle eligibility: select the IMG itself for handles. New scenarios have separate verification rather than inheriting historical results; actual checks are recorded in the project roadmap.
