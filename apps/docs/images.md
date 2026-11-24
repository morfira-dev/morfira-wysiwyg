# Images

The optional `createImageForm` is available through `@morfira-dev/wysiwyg/ui/images` and requires `images()`. It provides URL/alt/dimensions/caption, insertion/update/removal and cancellable file upload. [Standalone integration example](/ui#images-and-application-owned-upload). The application still owns transport and storage.

## Insert and edit dialog

The compatible default remains an embedded form (`presentation: 'inline'`).
Explicitly select `presentation: 'dialog'` for a separate window: the form mounts
closed inside a native `dialog`, and the application opens it from its own button.
Its fields do not expand the page layout.

```ts
import { createImageForm } from '@morfira-dev/wysiwyg/ui/images';
import '@morfira-dev/wysiwyg/ui/forms.css';

const form = createImageForm(formHost, editor, { presentation: 'dialog' });
const openImage = () => form.open();
openButton.addEventListener('click', openImage);

const disposeImageDialog = () => {
  openButton.removeEventListener('click', openImage);
  form.destroy();
};
```

`open()` captures the editor's current position and inspects the selected image;
`close()` dismisses the window, and `isOpen()` reports its state. Escape and the
close button cancel the form's owned upload and restore focus to the originating
button. Successful insert, update, removal or upload closes the dialog; an error
keeps it open for correction or explicit retry. Alignment buttons apply placement
immediately and keep the dialog and other drafts open. This form creates no upload
server and does not change the document format.

On the homepage and playground, **Insert image…** above the editor opens the
dialog. Select an existing image in the document first to edit it. Enable the
inspector's **Fail next upload** setting before opening the dialog.

Images are an optional module with no runtime dependencies. Core understands HTML `img`, `figure` and `figcaption`; the module adds selection, editing and upload commands. Import it separately:

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { images, imageCommands } from '@morfira-dev/wysiwyg/plugins/images';
import '@morfira-dev/wysiwyg/style.css';

const editor = createEditor(host, { plugins: [images()] });
const api = imageCommands(editor);
api.insert({
  src: '/photo.jpg', alt: 'Photo description',
  width: 640, height: 480, caption: 'A caption beneath the image',
});
```

Insertion creates a figure with an image and optional caption, splits the current paragraph and places the caret after the image. In lists and tables the figure stays inside the item/cell, including merged cells. A selection within one block can be replaced; selections across paragraphs, items or cells are rejected. Insertion inside captions is also rejected.

Clicking an image selects it. Programmatic selection is available too:

```ts
const image = editor.surface.querySelector('img');
if (image) api.select(image);
const selected = api.getSelected(); // ImageValue | undefined
api.update({ alt: 'New description', width: 320, height: null });
api.update({ caption: '' }); // remove caption
api.remove();
```

`ImageValue` contains `src: string` and optional `alt`, `caption`, `width`, `height`, `alignment`. `ImagePatch` accepts partial metadata and `null` to remove dimensions. Dimensions are integers from 1 to 1000; captions are literal text up to 5000 characters; alt accepts up to 20000. URLs use http/https or relative references; data/blob/script URLs are rejected. Invalid options throw before document mutation.

Update/remove require one selected image or a caret in its caption. Adding a caption to a legacy inline image promotes it to a figure while preserving surrounding text. Removing a simple image figure removes the image and caption; other content in a complex imported figure is retained. Captions can be edited in the document. Each command participates in undo/redo and respects read-only. With aspect-ratio locking disabled, empty dimensions restore natural sizing.

## Image alignment

`ImageAlignment` is `'left' | 'center' | 'right'`. The command acts on the selected image; `false` resets explicit alignment:

```ts
import type { ImageAlignment } from '@morfira-dev/wysiwyg/plugins/images';

const image = editor.surface.querySelector<HTMLImageElement>('img');
if (image) {
  api.select(image);
  const alignment: ImageAlignment = 'center';
  api.align(alignment);
  api.align('right');
  api.align('left');
  api.align(false); // remove explicit placement
}
// During insertion or metadata updates:
api.insert({ src: '/photo.jpg', width: 320, height: 240, alignment: 'center' });
```

`api.update({ alignment: 'right' })` changes placement together with other metadata in one operation; omitting the field preserves existing alignment. `getSelected()` includes `alignment` for recognized explicit placement and omits it otherwise. Repeating `align` with the same canonical value adds no Undo entry.

The IMG receives `display: block` and a validated `margin-left`/`margin-right` pair: left `0px/auto`, center `auto/auto`, right `auto/0px`. Reset removes these three inline properties. HTML/JSON persists placement without the plugin installed; older readers may discard the new styles. Other display values, arbitrary margins, shorthand and executable CSS are not allowed by this extension.

Only the image moves: dimensions, URL, figure, rich caption and neighboring nodes survive. Caption text has independent alignment and does not move with this command. A legacy inline image stays in its paragraph but renders as a block; neighboring nodes are not moved into new wrappers. Left/right are physical positions even in RTL. Placement may be visually neutral for a full-width image. Text wrapping, floats and cropping are not included.

One ordinary image is supported, including lists and merged table cells; complex figures, protected semantic nodes and foreign targets reject atomically. Each successful change is one Undo step with image selection retained. Read-only and active IME composition block changes; document or selection replacement during focus cannot redirect the operation to another image.

The ready form and its contextual edit mode expose separate left/center/right/reset buttons: they apply placement immediately without submitting other draft fields. Try the **Images** sample on the homepage or in the [playground](/playground): click the image and open **Insert image…**. These actions keep the dialog open; close it with Escape before using Undo in the main toolbar. Current verification results are recorded separately from this capability description.

## Proportional dimensions

Select an image and provide **one** side. The other is calculated automatically:

```ts
import type { ImageResize } from '@morfira-dev/wysiwyg/plugins/images';

const image = editor.surface.querySelector<HTMLImageElement>('img');
if (image) {
  api.select(image);
  const size: ImageResize = { width: 320 };
  api.resize(size); // for example, 640 × 480 → 320 × 240
  api.resize({ height: 180 }); // 320 × 240 → 240 × 180
}
```

`ImageResize` is `{ width: number; height?: never } | { height: number; width?: never }`. The command accepts exactly one width or height, an integer from 1 to 1000. It first uses the stored width/height pair, otherwise the selected image's already available natural dimensions. CSS sizing does not define the ratio; the command creates no preview, decodes no file and starts no separate image request. Unknown proportions, invalid arguments or a calculated side outside 1–1000 throw before document mutation. A fractional calculated side rounds to the nearest pixel, so repeated separately committed resizes do not guarantee exact preservation of the original rational ratio.

One ordinary inline image or an image directly inside a simple single-image figure is supported, including list and merged-cell placement. Complex figures, foreign nodes and protected semantic ownership are rejected. Dimensions and pixel styles persist in HTML/JSON; rich caption children, the IMG and neighboring nodes survive. One change is one Undo step with restored selection. Identical dimensions add no history; read-only and active IME composition leave the document unchanged. Commands are unavailable after editor disposal.

In the [ready form](/ui#preserving-proportions), enable **Keep aspect ratio**, edit width or height, and choose **Update image**. The linked field changes only in the draft until Apply. The checkbox defaults to off for compatibility; applications can pass `keepAspectRatio: true` when creating the form. Dragging uses the separate UI below; cropping remains unsupported.

## Drag resize handles

`createImageResizeUI` adds four aspect-locked corner handles. It is independent of forms and contextual properties and is not installed automatically by presets:

```ts
import { createImageResizeUI } from '@morfira-dev/wysiwyg/ui/image-resize';
import '@morfira-dev/wysiwyg/ui/image-resize.css';

const resizeHost = document.createElement('div');
document.body.append(resizeHost); // empty connected viewport overlay host
const resizeUI = createImageResizeUI(resizeHost, editor);

const disposeResize = () => {
  resizeUI.destroy();
  resizeHost.remove();
};
// Call disposeResize when your application unmounts.
```

Click the IMG itself, then drag a visible corner with a mouse or pointer. Only the external outline and dimension text change during the gesture: HTML, selection, history and document-change callbacks stay untouched. Releasing the pointer applies both dimensions through one command and one Undo/Redo step. Dimensions stay within an allowed integer pair of 1–1000; the ratio is fixed at gesture start. The image, figure, rich caption and neighboring nodes survive, with no extra fetch or IMG clone.

**Escape**, pointer cancellation/lost capture, window blur, scrolling or a viewport change during the gesture cancels the preview. External document edits, a new selection, read-only, IME or UI disposal also cancel the old gesture; it cannot transfer to a different IMG. On a focused handle, arrow keys change the size by 1 px; Shift+arrow uses 10 px. Each keyboard step is a separate history operation; Enter/Space do not apply an unfinished drag.

An exact node Range selecting one ordinary IMG is required, as after `api.select(image)` or clicking it. Caption carets, whole figures, multiple images, protected/foreign ownership and complex figures are ineligible. Unknown proportions hide handles without an extra request. Corners outside the visible clipped region are hidden. Use a normal viewport-overlay host without transformed/paint-containing/clipping ancestors; transformed images/editors and materially distorted CSS aspect ratios are unsupported. Responsive CSS may constrain actual display after stored pixel dimensions are applied. [UI contract and appearance](/ui#image-resize-handles).

## Upload callback

The editor does not choose your server, authentication or storage. The application provides a callback:

```ts
const editor = createEditor(host, {
  plugins: [images({
    maxFileSize: 10 * 1024 * 1024,
    upload: async (file, { signal }) => {
      const body = new FormData();
      body.append('image', file);
      const response = await fetch('/api/images', { method: 'POST', body, signal });
      if (!response.ok) throw new Error('Image upload failed');
      // Server returns ImageValue, e.g. { src: '/uploads/photo.jpg', alt: '...' }.
      return response.json();
    },
  })],
});
const api = imageCommands(editor);
const upload = async (file: File) => {
  try {
    const inserted = await api.upload(file);
    // false means cancelled; true means one completed insertion in history.
  } catch (error) {
    // Display a generic localized error; keep raw diagnostics outside rendered content.
  }
};
api.isUploading();
api.cancelUpload();
```

The client accepts nonempty PNG/JPEG/GIF/WebP/AVIF files by MIME and enforces a size limit (10 MiB by default). This is a preliminary gate; the server must validate files independently. SVG file uploads are rejected; existing safe SVG image URLs are allowed.

Upload captures the DOM insertion position. Moving the caret does not relocate insertion. A new upload cancels the previous one. Any document edit, external replacement, composition start, read-only transition or editor destruction aborts the request via AbortSignal. Late results after cancellation are ignored; no temporary nodes or blob URLs are persisted. Editing while uploading requires restarting at a new position. Commands become unavailable after disposal; cancelUpload remains safe.

Calling `upload()` during composition returns `false` without starting transport or restoring selection. Starting composition aborts an existing upload; its eventual result cannot restore the saved range. See [security and server responsibilities](/security).

### Progress, errors and retry

The callback receives `ImageUploadContext`: `{ signal, reportProgress }`. Existing callbacks using only `signal` still work. Report byte counts from your application's upload transport; for example, inside an `XMLHttpRequest` upload-progress listener:

```ts
// Install/remove this listener with your own request's transport lifecycle.
xhr.upload.addEventListener('progress', (event) => {
  reportProgress({
    loaded: event.loaded,
    ...(event.lengthComputable ? { total: event.total } : {}),
  });
});
```

`reportProgress` is the callback context member; `xhr` belongs to your application. The editor does not supply or start this transport. The `fetch` example above supplies no transfer-progress reports, so the ready form displays indeterminate progress. Do not invent percentages from elapsed time in a production integration.

For a custom UI, pass a request-scoped observer:

```ts
import type { ImageUploadOptions } from '@morfira-dev/wysiwyg/plugins/images';

const options: ImageUploadOptions = {
  onProgress: ({ loaded, total }) => {
    if (total === undefined) progressElement.removeAttribute('value');
    else {
      progressElement.max = total;
      progressElement.value = loaded;
    }
  },
};
const inserted = await api.upload(file, options);
```

`progressElement` is your native `HTMLProgressElement`. `ImageUploadProgress` contains nonnegative safe-integer `loaded` and optional positive safe-integer `total`, with `loaded <= total`. Invalid reports and decreasing `loaded` are ignored. Accepted values are frozen snapshots. Observer exceptions/rejections do not fail the upload. Reports after cancellation, completion, document changes or disposal cannot revive an old attempt. **100% means reported transfer progress, not successful insertion**: the returned image URL and metadata must still pass validation.

The ready image form shows a labeled native progress bar and generic localized errors. After a failed attempt, **Retry upload** starts a fresh request with the same File and original insertion range. Moving the caret alone does not relocate it. Success inserts once and is one Undo step; failures add no document history. Retry is explicit, never automatic, and every attempt repeats file/result validation. It may be offered after validation failures as well as transport failures; an invalid file or unsafe result still cannot pass validation.

Choosing another file, cancellation, any document edit/Undo/API replacement, read-only activation, composition start or form destruction clears the retained File and retry authority. Start a new upload at a fresh position after such a change. The form only owns its own request and never retries or cancels another form's upload. Progress/retry are absent in edit-only mode; `ImageFormValues` is unchanged. Raw exception messages, server HTML and file paths are not rendered as error markup.

Your backend remains responsible for upload authorization, content/MIME/size checks, safe storage, resource limits and orphan cleanup. Configure CSP for allowed image sources and keep server credentials outside persisted editor data. [Security responsibilities](/security).

### Owner-scoped upload cancellation

The optional second `upload` argument has type `ImageUploadOptions`. Pass a dedicated `AbortSignal` when a particular panel or component owns the request:

```ts
import type { ImageUploadOptions } from '@morfira-dev/wysiwyg/plugins/images';

const controller = new AbortController();
const options: ImageUploadOptions = { signal: controller.signal };
const pending = api.upload(file, options);
controller.abort();
const inserted = await pending; // false after cancellation
```

This signal cancels only its associated upload. Aborting an old signal cannot interrupt a newer upload; an already aborted signal starts no request and does not cancel the current one. `cancelUpload()` still cancels the editor's current upload regardless of its owner. The [ready image form](/ui#images-and-application-owned-upload) owns a dedicated signal and aborts it on disposal.

## Demo and appearance

On the [homepage](/#editor) and [playground](/playground), choose “Images”. Open **Insert image…** for numeric input: enable Keep aspect ratio and edit one side; its counterpart updates before Apply. A successful update closes the dialog. For dragging, leave **Image resize handles** enabled, click the image and drag a corner; Escape cancels, releasing applies, and Undo restores the size. Turning off the demo toggle destroys only this UI. Alt/dimension/caption fields populate on image selection; commands preserve selection through form focus. To demonstrate an error, first enable **Fail next upload** in **Links and images**, then open the dialog and choose an accepted raster file. After one simulated error, use **Retry upload**. The checkbox resets when that attempt starts, allowing the retry to succeed. The demo returns a local logo instead of the chosen file. **Files are never read, uploaded or stored**: progress is simulated locally, not measured network transfer. Current verification results are recorded separately.

```css
.my-editor {
  --mw-image-margin: 1.2em 0;
  --mw-caption-gap: .5em;
  --mw-caption-color: #64748b;
  --mw-caption-size: .9em;
}
```

Schema v1 adds figure/figcaption: older readers may discard wrapper semantics during import. Existing HTML is not upgraded automatically. Cropping and storage management are not implemented. Optional [raster clipboard/drop input](/image-input) is available through a separate plugin.

Inserting with an image selected in a simple figure replaces the whole figure and old caption. Figures are never nested. Insertion inside a complex imported figure is rejected.

HTML/JSON img dimensions are mirrored into validated inline pixel styles so host CSS such as height: auto cannot ignore the configured height. Dimension attributes take precedence; commands update/remove both representations together.


The optional [contextual image properties](/contextual-images) show on exact IMG node selection, reuse the public image form in `mode: 'edit'`, and apply existing metadata/remove commands with Undo. No second IMG thumbnail is created. Caption-carets, whole-figure ranges and complex figures are not eligible for that first UI slice; the underlying command support above is unchanged.
