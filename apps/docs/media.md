# Video and media

The optional plugin persists a public YouTube or Vimeo reference as a safe semantic block. Core and ready presets do not install it automatically. The plugin and UI have no external runtime dependencies.

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { media, mediaCommands, parseMediaURL } from '@morfira-dev/wysiwyg/plugins/media';
import { createMediaForm, createMediaView } from '@morfira-dev/wysiwyg/ui/media';
import '@morfira-dev/wysiwyg/ui/media.css';

const editor = createEditor(editorHost, { plugins: [media()], locale: 'en' });
const form = createMediaForm(formHost, editor);
const view = createMediaView(previewHost, editor);
// formHost and previewHost are separate elements outside the editor.
insertButton.addEventListener('click', () => form.open());

const reference = parseMediaURL('https://youtu.be/dQw4w9WgXcQ');
mediaCommands(editor).insert({ url: reference.url, title: 'Example video' });

// When disposing the application interface:
form.destroy();
view.destroy();
editor.destroy();
```

The [live media and formula example](/media-formula) provides a separate form and preview. An external player appears only after the load button is activated.

## Format and commands

Schema-v1 HTML/JSON persists a `figure` with `data-mw-node="morfira:media"`, `data-provider`, `data-video-id` and a literal text title. URLs, iframes, event handlers and foreign attributes are not persisted. Install `media()` when creating the editor **before** initial document import: extension schemas are compiled in advance.

`parseMediaURL(url)` returns `{ provider, id, url }` with a canonical URL and throws `TypeError` for unsupported input. Supported forms are ordinary HTTPS YouTube watch, youtu.be, embed/shorts/live, youtube-nocookie embed and public Vimeo links. Arbitrary iframes, HTTP, URL credentials, nonstandard ports, unrelated hosts, extra path segments, ambiguous `v` parameters and private Vimeo `h` references are rejected. Time parameters and other user-supplied player configuration are not persisted.

| API | Behavior |
| --- | --- |
| `mediaCommands(editor).insert({ url, title? })` | Inserts a block at the current selection as one history operation. |
| `.get(target)` | Returns `{ provider, id, url, title }` for an actual block owned by this editor, or `undefined`. |
| `.update(target, { url, title? })` | Updates the actual block; detached, foreign and stale targets are refused. |
| `.remove(target)` | Removes a block with undo/redo support. |

Commands return `boolean`; invalid insertion/update values throw `TypeError`. Read-only blocks document changes. Titles are bounded to 256 single-line characters; IDs follow provider-specific formats. Playback failures and availability of individual videos depend on the provider, region and application CSP.

## Form and external player

`createMediaForm(host, editor, { presentation: 'dialog', onError? })` creates a compact modal form. `open()` captures the current selection; a caret inside a media block enables updating and removal. `setValues({ url?, title? })` and `getValues()` manage the draft. `close()`, `refresh()` and `destroy()` close or refresh the lifecycle. Use `presentation: 'inline'` when an application needs a permanently visible form; explicitly refresh the captured position with `refresh()`.

The selection capture is document-revision bound. Document replacement, composition, target changes and read-only prevent applying a stale draft. The form does not map positions through edits. An invalid URL can be corrected without closing the dialog.

`createMediaView(host, editor)` displays cards in an external host. Module import, document parsing and initial card rendering create no iframe and make no video-provider requests. “Load external video” creates a player with a fixed HTTPS URL, `autoplay=0`, `sandbox`, restricted `allow` and `referrerpolicy`. “Unload external video”, block replacement and `destroy()` remove the iframe. Playback remains available in read-only and never changes the document.

Loading consent gates the network request; it is not an anonymity guarantee. YouTube uses youtube-nocookie; Vimeo receives `dnt=1`. After loading, the provider processes network data under its own terms. [YouTube parameters](https://developers.google.com/youtube/player_parameters), [Vimeo parameters and DNT limitations](https://help.vimeo.com/hc/en-us/articles/12426260232977-About-Player-Parameters).

The application owns the external host, user consent and CSP `frame-src` for its chosen providers. Both controllers remove only their own nodes and subscriptions. When publishing outside the editor, the application must render persisted semantic data with equivalent provider validation and consent. The plugin does not provide arbitrary embed codes, private Vimeo videos, file uploads, transcoding or playback guarantees.

## Styling

Import CSS explicitly. Available variables include `--mw-media-gap`, `--mw-media-padding`, `--mw-media-aspect-ratio` and shared `--mw-border`, `--mw-radius`, `--mw-surface`, `--mw-text`. Form and cards use the editor locale, with Russian and English messages.

The editing form refuses opening in read-only or during composition. Composition start closes an active editing dialog without applying its draft. After an external value replacement or a read-only cancellation, a fresh selection can open a new session without waiting for a missing native composition-end event. This does not restrict the separate viewer's explicit read-only playback.

Plain Enter in the URL or title field applies. Modifier shortcuts, already-handled keys and IME confirmation are left to their owner; invalid values remain correctable in the open dialog.
