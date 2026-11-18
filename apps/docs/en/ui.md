# Reusable UI forms

Link, image and search forms are ready optional UI over the editor's public commands. They do not depend on Vue/React/Angular/Svelte or documentation-site CSS. The homepage and playground use these same factories.

Import each JS entry separately. CSS is explicit; importing UI registers no global elements and is server-safe. Mounting a form requires a browser DOM.

| Factory | Public entry | Required plugin |
| --- | --- | --- |
| `createLinkForm` | `@morfira-dev/wysiwyg/ui/links` | None: uses core commands |
| `createImageForm` | `@morfira-dev/wysiwyg/ui/images` | `images()` |
| `createSearchForm` | `@morfira-dev/wysiwyg/ui/search` | `search()` |

Shared CSS: `@morfira-dev/wysiwyg/ui/forms.css`. A missing required plugin is detected before mounting a view. No UI module is required to use core.

Hosts for image and search forms must be outside `editor.surface`: the surface itself or any descendant is rejected before mounting or installing listeners. Use a separate sibling container. See [security boundaries](/en/security).

## Links without a framework

Add two empty containers:

```html
<div id="link-editor"></div>
<div id="link-controls"></div>
```

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { createLinkForm } from '@morfira-dev/wysiwyg/ui/links';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/ui/forms.css';

const editor = createEditor(document.querySelector<HTMLElement>('#link-editor')!, {
  locale: 'en', value: '<p>Select text for a link.</p>',
});
const form = createLinkForm(document.querySelector<HTMLElement>('#link-controls')!, editor, {
  initialValues: { href: 'https://example.com', newTab: true },
  onError: (error) => console.error('Link command failed', error),
});

editor.setSelection(0, 6);
form.refresh();

const dispose = () => {
  form.destroy();
  editor.destroy();
};
// Call dispose() when removing the screen.
```

The form creates/updates links and unlinks them, retaining selection while the user enters fields. Title, new-tab and URL use existing command validation. `text` creates a new link without selection; it does not replace an existing link's text. Core supplies safe `rel` values for `_blank`.

## Images and application-owned upload

Containers: `<div id="image-editor"></div>` and `<div id="image-controls"></div>`.

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { images } from '@morfira-dev/wysiwyg/plugins/images';
import type { ImageValue } from '@morfira-dev/wysiwyg/plugins/images';
import { createImageForm } from '@morfira-dev/wysiwyg/ui/images';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/ui/forms.css';

const editor = createEditor(document.querySelector<HTMLElement>('#image-editor')!, {
  locale: 'en', value: '<p>An image insertion position.</p>',
  plugins: [images({
    maxFileSize: 5 * 1024 * 1024,
    upload: async (file, { signal }) => {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch('/api/uploads', { method: 'POST', body, signal });
      if (!response.ok) throw new Error('Upload endpoint rejected the file.');
      return await response.json() as ImageValue;
    },
  })],
});
const form = createImageForm(document.querySelector<HTMLElement>('#image-controls')!, editor, {
  initialValues: { src: '/assets/photo.png', alt: 'Description', width: '320' },
});
editor.setSelection(0);

const dispose = () => {
  form.destroy();
  editor.destroy();
};
```

`/api/uploads` is an example application API, not a supplied server. Return `ImageValue` with a URL and optional alt/dimensions/caption. The plugin validates returned metadata. Choosing a file does not upload it to any external Morfira storage: the application owns transport.

The form supports URL, alt, caption, dimensions, insertion, selected-image update/removal, file selection and cancellation. With aspect-ratio locking disabled, empty dimension fields remove those constraints on update. Destroying the form cancels only its own upload; late results are ignored. This module does not add drag resizing, cropping or drag/drop.

Custom UI can pass a separate signal to `imageCommands(editor).upload(file, { signal })`; its option type is `ImageUploadOptions`. This cancels that specific request. `cancelUpload()` remains the editor-wide current-upload cancellation command. [Image details](/en/images).

### Upload progress and retry

In `all` mode, the form shows a native **Image upload progress** indicator: a percentage when total bytes are known, otherwise indeterminate progress. The application callback supplies values through `ImageUploadContext.reportProgress({ loaded, total? })`; no upload transport is added. Custom UI can use the optional `ImageUploadOptions.onProgress` observer. Reaching 100% transfer does not mean the result has passed validation and been inserted.

Errors use generic localized text, without rendering response HTML or raw exception messages. **Retry upload** starts a fresh attempt with the same File and original insertion position. Other form drafts are not submitted. Moving the caret does not relocate retry; any document edit/Undo/API replacement, read-only, IME, another file, cancellation or form destruction clears retry and releases the file. Every attempt validates again; success is one insertion and one Undo. Retries are never automatic and do not affect another owner's upload. Progress/retry are absent in `edit` mode; `ImageFormValues` stays unchanged.

On the homepage and playground, **Fail next upload** demonstrates one error followed by successful retry. The percentage is simulated with a timer; the file is never read or uploaded. [Progress API and backend responsibilities](/en/images#progress-errors-and-retry).

### Preserving proportions

The **Keep aspect ratio** checkbox is available for an already selected image. Enable it and edit width or height: the other side is calculated from the inspected image's fixed ratio. Only drafts change until Update image. Enter applies an update in `edit` mode; `all` mode retains its existing Enter-to-insert behavior.

```ts
const form = createImageForm(formHost, editor, {
  mode: 'edit',
  keepAspectRatio: true,
});
```

`ImageFormOptions.keepAspectRatio` is an optional boolean, default `false`. It is validated and snapshotted at construction; checkbox state belongs to the form and is never document data. The stored pair takes precedence, otherwise already-loaded natural dimensions provide the ratio. Unknown proportions disable the checkbox; sizing starts no extra image request. The calculated side rounds to a pixel and must remain within 1–1000.

Invalid, blank or oversized locked dimensions are not applied; drafts remain available for correction. Uncheck to edit independent sides or remove dimensions. `setValues` preserves supplied string drafts without automatically recalculating; Apply validates that the final pair matches the fixed ratio. Changing src, switching images or external API replacement cannot apply the old ratio to a new target. Dimensions and other metadata use one Undo step; unchanged rich caption nodes survive. Locale changes translate the checkbox via `ui.images.keepAspectRatio` without resetting drafts. See the [resize command](/en/images#proportional-dimensions).

### Image alignment

The **Image alignment** group is available in both form modes and contextual properties. **Align image left**, **Center image**, **Align image right** and **Reset image alignment** apply a command to the selected image immediately. Other fields remain drafts and are not submitted. `aria-pressed` reflects explicit placement; reset is pressed when no placement is recognized. `ImageFormValues`, `getValues` and `setValues` keep their existing shape: alignment is not a draft field.

Buttons are unavailable without an eligible image, during read-only, IME composition or upload. Replacing the document/target while restoring focus cancels the action. Each placement change is one Undo step; repeating the same value adds no history. Dimensions and caption survive; placement belongs to the IMG rather than caption text. [Stored format and boundaries](/en/images#image-alignment).

### Edit-only image form

```ts
import { createImageForm } from '@morfira-dev/wysiwyg/ui/images';
import type { ImageFormMode } from '@morfira-dev/wysiwyg/ui/images';

const mode: ImageFormMode = 'edit';
const editForm = createImageForm(formHost, editor, { mode });
```

`mode` is a constructor option: `all` retains the existing Insert/upload/cancel controls and Enter-to-insert; `edit` shows only fields, Update and Remove, and Enter updates the selected image. Recreate the form to change mode. Insert/upload/cancel controls are absent and their handler paths refuse edit mode; it neither starts transport nor cancels another owner's upload. Missing selection cannot become an insertion point.

Edits recheck the same actual IMG after restoring the saved native Range. API replacement invalidates the old draft until a fresh editor selection; locale/field focus preserve drafts. Blank dimensions remove them with aspect-ratio locking off; explicit dimensions are integers 1–1000 and invalid metadata fails atomically. An unchanged caption is omitted from the patch so unrelated metadata edits preserve its rich children; an explicitly changed caption remains literal text. See [contextual image properties](/en/contextual-images) for the optional floating wrapper and exact IMG eligibility.

## Image resize handles

The independent `createImageResizeUI` displays four proportional handles around an exactly selected IMG. This module is not a form and is not installed automatically by presets or `createImageForm`. It requires `images()`:

```ts
import { createImageResizeUI } from '@morfira-dev/wysiwyg/ui/image-resize';
import type { ImageResizeUIController, ImageResizeUIOptions } from '@morfira-dev/wysiwyg/ui/image-resize';
import '@morfira-dev/wysiwyg/ui/image-resize.css';

const resizeHost = document.createElement('div');
document.body.append(resizeHost);
const options: ImageResizeUIOptions = {
  onError: (error) => console.error('Image resize failed', error),
};
const resizeUI: ImageResizeUIController = createImageResizeUI(resizeHost, editor, options);
const disposeResize = () => {
  resizeUI.destroy();
  resizeHost.remove();
};
```

The host must be an empty connected HTML element outside `editor.surface`, in the same document on a normal viewport-overlay layer. Do not place it inside a transformed/paint-containing/clipping container. `options` contains only optional `label` and `onError`; the controller exposes `element`, `refresh()` and idempotent `destroy()`. Disposal releases capture, listeners, observers/RAFs and external-host ownership without destroying the editor.

Clicking the image selects its exact IMG. A corner drag fixes the ratio and changes only the external outline/status until release: document content and history remain untouched. Releasing applies one resize command with one Undo step; unchanged dimensions create no history. Escape and pointer cancellation abandon the gesture. Scroll/resize/blur, document/target replacement, read-only and IME also cancel an unfinished gesture. Focused handles support arrow keys in 1 px steps and Shift+arrows in 10 px steps, with a separate history operation for each key action. Enter/Space do not apply an unfinished drag.

Labels, help and dimension text are localized through `imageResizeUIMessages` and `ImageResizeUIMessageKey` from the same entry; appearance uses scoped `--mw-*` variables and explicit CSS. The module does not depend on documentation-site styles, create thumbnails or fetch an image again. Unknown proportions, hidden/transformed or materially distorted images, caption carets, whole-figure ranges and protected/complex targets produce no handles. Corners outside clipped bounds are hidden. [Full example, boundaries and demo](/en/images#drag-resize-handles).

Set variables on the external host or its ancestor. For example, after `resizeHost.className = 'my-resize-overlay'`:

```css
.my-resize-overlay {
  --mw-image-resize-color: #2563eb;
  --mw-image-resize-handle-size: 28px;
  --mw-image-resize-radius: 4px;
  --mw-image-resize-preview: #2563eb12;
  --mw-image-resize-z-index: 1001;
}
```

## Find and replace

Containers: `<div id="search-editor"></div>` and `<div id="search-controls"></div>`.

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { search } from '@morfira-dev/wysiwyg/plugins/search';
import { createSearchForm } from '@morfira-dev/wysiwyg/ui/search';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/ui/forms.css';

const editor = createEditor(document.querySelector<HTMLElement>('#search-editor')!, {
  locale: 'en', value: '<p>One sample. Another sample.</p>', plugins: [search()],
});
const form = createSearchForm(document.querySelector<HTMLElement>('#search-controls')!, editor, {
  initialValues: { query: 'sample', wholeWord: true },
});

const draft = form.getValues();
form.setValues({ replacement: 'text' });

const dispose = () => {
  form.destroy();
  editor.destroy();
};
```

Query and options remain drafts until Find. If they differ from the indexed query, navigation/replacement buttons are disabled rather than accidentally acting on old results. Enter in the query searches from the first match. **Shift+Enter in the query** moves to the previous match with wrapping; for a new query, it first searches and selects the last match. The field hint is localized through `ui.search.queryKeys`. Enter in replacement performs the available current-match replacement. IME candidate confirmation is not intercepted.

Find/navigation/clear remain available read-only; replacement is blocked. Commands use indexed matches, not selection inside a form field. Replace all is one undo operation. Destroying UI does not clear the application's search state. [Literal-search boundaries](/en/search).

## Controller and values

All factories return a controller for one lifecycle:

| Property/method | Purpose |
| --- | --- |
| `element` | Owned root `HTMLElement`; add a class or reposition it |
| `getValues()` | Independent copy of current drafts |
| `setValues(partial)` | Partially update drafts without editing the document |
| `refresh()` | Refresh UI from current editor/plugin state |
| `destroy()` | Unsubscribe, remove handlers and delete only owned UI; idempotent |

Other controller methods reject after destruction; detached buttons do not run commands. Destroying the editor automatically removes its forms. Before manually removing a host, call `destroy()`—detaching an arbitrary DOM node is not an automatic lifecycle signal.

| Values | Fields |
| --- | --- |
| `LinkFormValues` | `href`, `title`, `text`: string; `newTab`: boolean |
| `ImageFormValues` | `src`, `alt`, `caption`, `width`, `height`: string |
| `SearchFormValues` | `query`, `replacement`: string; `caseSensitive`, `wholeWord`: boolean |

Image dimension drafts are strings, while `ImageValue` uses numbers. This retains empty/invalid fields for correction; only validated values enter the document. `initialValues`, optional `label` and `onError` belong to `LinkFormOptions`, `ImageFormOptions`, `SearchFormOptions` respectively.

## Selection, errors and embedding

Forms are embedded nonmodal panels with `role="form"`, not nested HTML `<form>` elements. They can live inside an application's form. Their buttons do not submit it; Enter in fields handles a local action.

Links and images remember real DOM Ranges before controls receive focus, including empty blocks and backward selections. External document replacement invalidates the old target: select a position in the new document first. Field input and locale changes preserve drafts. Search uses its recomputed plugin index rather than restoring a stale Range.

Invalid commands retain document content and field drafts. Users receive localized messages; `onError` receives the original diagnostic error. Do not render it with `innerHTML`. These forms do not claim a complete accessibility audit or support for every system IME.

## Localization and appearance

```ts
editor.setLocale('ru', {
  'ui.links.href': 'Адрес назначения',
  'ui.images.caption': 'Подпись',
  'ui.search.find': 'Найти сейчас',
});
```

Dictionary exports are `linkFormMessages`, `imageFormMessages`, `searchFormMessages` from their UI entries; key types are `LinkFormMessageKey`, `ImageFormMessageKey`, `SearchFormMessageKey`. Fallback/override precedence follows [editor localization](/en/localization). Explicit `options.label` wins over dictionary labels.

CSS is scoped to `.mw-form`. It uses common `--mw-text`, `--mw-muted`, `--mw-surface`, `--mw-border`, `--mw-accent` plus optional `--mw-form-font-size`, `--mw-form-gap`, `--mw-form-padding`, `--mw-form-radius`, `--mw-form-control-radius`, `--mw-form-error`. The homepage and [playground](/en/playground) demonstrate the same public modules; no separate demo engine is required.

Nonempty selections can use the separate [contextual UI](/en/contextual-toolbar), rather than a behavior plugin: `/ui/contextual` plus explicit `/ui/contextual.css`. Presets do not install it; it reuses existing commands/history.

A caret inside a text link can use separate [contextual link actions](/en/contextual-links): `/ui/contextual-link`, explicit core/forms/contextual-link CSS, validated Open, the existing edit form and Undoable unlinking. Expanded selections remain the text toolbar’s scope; presets do not install this UI.

## Contextual table actions

The independent [table properties form](/en/table-properties), imported from `/ui/table-properties`, edits width/placement, selected-cell styles, the first header row/column and a literal caption. It requires `tables()` and `tableProperties()` plus explicit forms CSS. Header row, Header column and Table caption share the draft: Apply sends only dirty fields in one Undo. A merge crossing a header boundary rejects the whole patch. New string fields `headerRow`, `headerColumn`, `caption` are included in `getValues()`; headers use `"true"` / empty string and caption whitespace is retained. The homepage and playground show this form beside table commands; the contextual toolbar does not install it automatically.

The explicit [contextual table toolbar](/en/contextual-tables) adds row/column insertion and deletion, merge/split over the existing logical grid, native Range restoration and one-command Undo. Install `/ui/contextual-table` and its CSS alongside `tables()` and table CSS; presets are unchanged. `getTableSelection(editor, range?)` returns observational `TableSelectionState`, `registerSelectionHost(host)` owns external controls, and `tableSelectionChange` is a typed per-editor notification, not RPC. The guide documents spans, disabled states, keyboard/lifecycle restrictions and independent gzip budgets.
