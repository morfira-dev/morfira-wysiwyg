# Browser print

`createPrintUI` adds a separate browser-print control. An explicit user action prepares a validated snapshot of the current document and shows it in print media, without editor toolbars or the documentation site. On the homepage and [playground](/playground), open “Print and outline” and load the reading sample.

The module is independently imported. It is outside core and preset defaults, opens no popup/iframe and contains no PDF engine. The browser and OS own the dialog, page size, pagination and availability of “Save as PDF”. Office layout fidelity is not promised.

## Setup

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { createPrintUI } from '@morfira-dev/wysiwyg/ui/print';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/ui/print.css';

const editor = createEditor(editorHost, {
  locale: 'en',
  value: '<h2>Report</h2><p>Document to print</p>',
});
const printUI = createPrintUI(printHost, editor, {
  onError: (error) => console.error(error),
});
```

`printHost` is an empty connected HTML host in the same document, outside persisted editor content. The print stylesheet is required: without it, the module refuses to call `window.print()` instead of accidentally printing the entire application page. CSS is explicit and loads no fonts.

The module's native button requests printing through user interaction. Applications with their own button can call `printUI.print()` from its handler; browsers may restrict calls without user activation.

## API

| Option | Behavior |
| --- | --- |
| `label?: string` | Explicit accessible label, up to 160 characters without control codes |
| `onError?: (error: unknown) => void` | Application diagnostics; UI displays a generic localized message |

`PrintUIController` exposes `element`, `print(): boolean`, `cancel()`, `isPrinting()` and `destroy()`. A `true` result means the request was accepted, not proof of printing or PDF saving. An active print, lost host, missing CSS or provisional IME composition does not start another session. Read-only permits printing committed content.

`destroy()` is idempotent. Other methods reject after disposal. The entry also exports `PrintUIOptions`, `PrintUIMessageKey` and `printUIMessages`.

## Snapshot and resources

The module reads instance JSON, validates it through the schema and creates new permitted DOM nodes. It does not clone or move the live editor. The source document, actual DOM nodes, selection, pending formats and Undo remain unchanged. Later edits do not rewrite the requested snapshot.

Images are **always** replaced by alt text or a localized placeholder before creating live DOM. Printing creates no `img` and makes no additional image requests. Links retain text without navigation attributes; ordinary tables, merged cells, captions, lists and text styling survive within schema limits. There is no `images: 'load'` option here. Persisted `font-family` is omitted too: the print profile uses system fonts and monospace for code, so the module does not request a custom webfont. Sizes and other allowed styles remain within schema limits; matching the editor's font family is not promised.

The temporary snapshot is a direct child of `body`, hidden on screen and shown only in print media. While the module owns a print session, its stylesheet hides other direct `body` children in print media. The regular screen application stays in place. Application-owned print CSS can still affect the output.

## Completion and lifecycle

Only one module print session may own a browser document, so two editors cannot overwrite one another's snapshot. An existing foreign `data-mw-print-active` marker is refused. Applications should not change this private attribute to control printing.

`afterprint`, observed print-media exit, `cancel()`, exceptions, ownership loss or disposal release the owned snapshot and marker. Returning from `window.print()` alone is not completion: some browsers return before the dialog closes. If no completion signal arrives, use Cancel or `cancel()` to release the local session.

```ts
printUI.cancel(); // releases the local snapshot; does not control the OS dialog
printUI.destroy();
editor.destroy();
```

Canceling the module is not confirmation that a printer job was canceled. The module performs no timer polling and does not inspect the system dialog result. Destroying the editor releases the UI too; retained stale controls cannot start a new session.

Browser-boundary tests stub `window.print()` only in tests. They verify snapshot, CSS and cleanup, not physical output, every driver or complete system-dialog accessibility. Actual builds, focused test outcomes and size measurements are recorded separately.
