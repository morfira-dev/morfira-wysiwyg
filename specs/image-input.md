# Optional raster image clipboard and drop input

Status: implementation slice; validation is reported separately. Public entry
`@morfira-dev/wysiwyg/plugins/image-input` exports `imageInput(options?)` and its
types. Install `images({ upload })` before this plugin. It has no transport,
framework dependency, UI or implicit preset installation.

## Ownership and placement

The plugin consumes every paste/drop advertising files, including multiple,
unsupported and invalid files, before native/core handling. Exactly one nonempty
PNG, JPEG, GIF, WebP or AVIF file is eligible for upload. Accompanying HTML, plain
text and URI data is ignored completely, allowing copied-image clipboards without
parsing their fallback markup. Transfers with no files retain existing paths.
Invalid files/targets report through onError without upload or mutation. It does not fetch URLs,
read file paths, decode images, persist object/data URLs or invent a storage API.
The existing images upload callback and configured file-size limit remain
authoritative. MIME filtering is a frontend usability gate, not file validation
or an upload authorization boundary; applications must validate actual bytes and
authorize storage on their backend.

Paste uses exactly one current connected native range in this editor. A collapsed surface boundary in a document containing exactly one empty ordinary P/H (only empty text nodes and attribute-free HTML BR placeholders) resolves to that block start. This also applies to a freshly resolved drop point. Nonempty/multiple blocks, semantic/protected wrappers and other root boundaries keep their refusal. Drop uses
the browser's caret-at-client-point API and never falls back to a stale caret.
Accept only ordinary same-block paragraph/heading or simple direct-inline
list/cell/pre/blockquote positions. Reject figures/captions, images in the
replacement range, protected content, semantic plugin wrappers, foreign
namespaces, cross-block and foreign editor ranges before starting transport or
changing selection. Accepted drop places a collapsed caret at the resolved
point. Browsers without a caret-at-point API do not insert drops.

Capture-phase handlers on the editor host ancestor, restricted to targets inside
its surface, prevent the owned native operation before earlier surface capture
handlers such as table clipboard. Already-cancelled file events are consumed
without starting upload, preserving application cancellation. No-file events are
untouched. These handlers run before core paste
handling; ordinary HTML/plain-text paste remains unchanged. Any file dragover
over this editor is prevented, including protected-mode transfers whose file list
is empty but whose types/items advertise files. Read-only/composition transfers
are consumed without mutation. No reorder/move behavior is supplied.

## Async lifetime and errors

`imageInput({ onError?: (error: unknown) => void | Promise<void> })` validates its
options at creation: reject null, arrays, unknown keys and non-callable callbacks.
It delegates to
`imageCommands(editor).upload(file, { signal })`. That API validates the insertion
range and captures a DOM bookmark synchronously, before awaiting application
transport. Moving the selection while transport runs does not relocate the image.
One successful upload is one undo transaction. Existing document replacement,
user edits, read-only, composition, latest-request and destroy guards remain
owned by images. The input plugin separately blocks composition/read-only events
before moving the caret and aborts only its own request on disposal or replacement
by another owned input request; it never calls global `cancelUpload()`.

Upload failures are caught and delivered to `onError` when configured; the
callback cannot cause an unhandled event-handler rejection. Cancellation is not
an error. The plugin owns and removes every surface listener/subscription. No
late result or rejection may mutate a destroyed/replaced/read-only document.
Composition-start events received while already read-only do not activate an
input composition lock; editing may resume after read-only is disabled without
requiring a synthetic composition-end event.

Before upload, focus the surface and revalidate the intended range, document,
read-only/composition/lifetime state after synchronous focus callbacks. Restore
that intended range only when it remains valid and the surface retains focus;
the second focus inside images.upload then cannot redirect insertion via a new
native focus event. A focus callback changing only selection does not relocate
the intended target. A focus callback replacing/editing the document, toggling
read-only, starting composition, disposing or transferring focus cancels input.
A valid drop may move focus/caret even when images subsequently rejects its
file-size limit or missing upload configuration; no document/history mutation is
made for those failures. Async onError rejection is contained as well.

## Acceptance

Exercise raster paste at a same-block selection with exact content and one-step
undo/redo; pointer-position drop independently of the prior caret; image plus
HTML ignores the markup; multiple/unsupported files fail closed; foreign/protected/semantic/cross-block and
missing drop targets; transport failure and unsafe response; read-only and
composition; late result after replacement/disposal; selection movement during
upload. Reuse existing images tests for its independent exhaustive race contract.
Run the focused scenarios in Chromium, Firefox and WebKit. Measure this optional
entry closure separately with an 8000-byte gzip JS guard, counting shared chunks
once. Preserve no default-preset growth; update RU/EN examples.
