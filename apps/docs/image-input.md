# Image clipboard and drop input

Optional `imageInput()` adds paste and drop of **one raster file**. It is a separate import with no runtime dependencies, UI or transport. Presets do not install it automatically.

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { images } from '@morfira-dev/wysiwyg/plugins/images';
import { imageInput } from '@morfira-dev/wysiwyg/plugins/image-input';

const editor = createEditor(host, {
  plugins: [
    images({
      maxFileSize: 10 * 1024 * 1024,
      upload: async (file, { signal }) => {
        const body = new FormData();
        body.append('image', file);
        const response = await fetch('/api/images', { method: 'POST', body, signal });
        if (!response.ok) throw new Error('Image upload failed');
        return response.json(); // validated ImageValue, e.g. { src: '/uploads/photo.png' }
      },
    }),
    imageInput({ onError: (error) => console.error(error) }),
  ],
});
```

Install `images({ upload })` before `imageInput()`. For standard/extended, supply `images: { upload }` and add `imageInput()` to `plugins`: application plugins run after built-ins. `ImageInputOptions` contains only optional `onError(error: unknown)`. Invalid files and transport failures reach this callback; cancellation is not an error.

## Insertion target

Paste uses one current native range in this editor. Drop resolves a caret from pointer coordinates through the browser API and never falls back to the previous caret. Supported targets are ordinary positions within one paragraph/heading or simple inline list-item, cell, pre or blockquote. Cross-block selections, another editor, figures/captions, protected and semantic nodes are rejected before transport starts. A browser without a caret-at-point API cannot insert drops. Moving existing images is outside this module.

Accepted files are nonempty PNG, JPEG, GIF, WebP and AVIF. Multiple files, SVG and unsupported types are rejected. Every operation advertising files is consumed: accompanying HTML, URLs and text are ignored even when the file fails validation. Transfers without files retain ordinary HTML/text paste. Read-only and IME cannot mutate the document.

Upload captures the target before awaiting the callback; moving the selection does not relocate insertion. A successful insert is one Undo step. Document edits/replacement, read-only, IME and destruction reject late results. The plugin removes its listeners and cancels only its own request; see the remaining [image upload guarantees](/images).

## Local demo

On the [homepage](/#editor) or [playground](/playground), choose an empty document, click “Load sample”, then click inside its paragraph, then paste a copied raster file or drop one onto the text. **After a short delay, the local callback returns `/logo.svg` instead of the selected file contents. Files are not uploaded, stored or decoded.** This demonstrates input routing and cancellation rather than a file preview.

Client MIME and size checks are usability gates, not content security guarantees. Your backend must validate actual bytes, bound resources and authorize upload/access. The application owns CSP and storage. The plugin never fetches URLs, reads file paths or persists data/blob URLs. See [security boundaries](/security).

An accepted drop places its caret before calling upload. If `images` then rejects the file size or missing callback, document content and history stay unchanged, but focus/caret may move. `onError` may return `void` or `Promise<void>`; errors in the callback itself are contained.

A surface-boundary caret in a document containing exactly one empty ordinary paragraph or heading resolves inside that block. Arbitrary boundaries around multiple or nonempty blocks remain unsupported.
