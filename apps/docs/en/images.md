# Images

The optional `createImageForm` is available through `@morfira-dev/wysiwyg/ui/images` and requires `images()`. It provides URL/alt/dimensions/caption, insertion/update/removal and cancellable file upload. [Standalone integration example](/en/ui#images-and-application-owned-upload). The application still owns transport and storage.

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

`ImageValue` contains `src: string` and optional `alt`, `caption`, `width`, `height`. `ImagePatch` accepts partial metadata and `null` to remove dimensions. Dimensions are integers from 1 to 1000; captions are literal text up to 5000 characters; alt accepts up to 20000. URLs use http/https or relative references; data/blob/script URLs are rejected. Invalid options throw before document mutation.

Update/remove require one selected image or a caret in its caption. Adding a caption to a legacy inline image promotes it to a figure while preserving surrounding text. Removing a simple image figure removes the image and caption; other content in a complex imported figure is retained. Captions can be edited in the document. Each command participates in undo/redo and respects read-only. Empty dimensions restore natural sizing; automatic aspect-ratio locking and drag resizing are not implemented.

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
    // Display the error; the document remains unchanged.
  }
};
api.isUploading();
api.cancelUpload();
```

The client accepts nonempty PNG/JPEG/GIF/WebP/AVIF files by MIME and enforces a size limit (10 MiB by default). This is a preliminary gate; the server must validate files independently. SVG file uploads are rejected; existing safe SVG image URLs are allowed.

Upload captures the DOM insertion position. Moving the caret does not relocate insertion. A new upload cancels the previous one. Any document edit, external replacement, composition start, read-only transition or editor destruction aborts the request via AbortSignal. Late results after cancellation are ignored; no temporary nodes or blob URLs are persisted. Editing while uploading requires restarting at a new position. Commands become unavailable after disposal; cancelUpload remains safe.

Calling `upload()` during composition returns `false` without starting transport or restoring selection. Starting composition aborts an existing upload; its eventual result cannot restore the saved range. See [security and server responsibilities](/en/security).

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

This signal cancels only its associated upload. Aborting an old signal cannot interrupt a newer upload; an already aborted signal starts no request and does not cancel the current one. `cancelUpload()` still cancels the editor's current upload regardless of its owner. The [ready image form](/en/ui#images-and-application-owned-upload) owns a dedicated signal and aborts it on disposal.

## Demo and appearance

On the [homepage](/en/#editor) and [playground](/en/playground), choose “Images”. Alt/dimension/caption fields populate on image selection; commands preserve selection through form focus. The demo upload returns a local logo instead of the selected file. **Files are not uploaded or stored**: this demonstrates the callback and cancellation rather than previewing file contents.

```css
.my-editor {
  --mw-image-margin: 1.2em 0;
  --mw-caption-gap: .5em;
  --mw-caption-color: #64748b;
  --mw-caption-size: .9em;
}
```

Schema v1 adds figure/figcaption: older readers may discard wrapper semantics during import. Existing HTML is not upgraded automatically. Cropping, drag/drop, drag resizing, clipboard file uploads and storage management are not implemented yet.

Inserting with an image selected in a simple figure replaces the whole figure and old caption. Figures are never nested. Insertion inside a complex imported figure is rejected.

HTML/JSON img dimensions are mirrored into validated inline pixel styles so host CSS such as height: auto cannot ignore the configured height. Dimension attributes take precedence; commands update/remove both representations together.


The optional [contextual image properties](/en/contextual-images) show on exact IMG node selection, reuse the public image form in `mode: 'edit'`, and apply existing metadata/remove commands with Undo. No second IMG thumbnail is created. Caption-carets, whole-figure ranges and complex figures are not eligible for that first UI slice; the underlying command support above is unchanged.
