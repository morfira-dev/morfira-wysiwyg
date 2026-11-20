# Optional browser print UI

Public `/ui/print` exports createPrintUI(host, editor, options?), printUIMessages
and owned types PrintUIOptions/PrintUIController/PrintUIMessageKey. Explicit
`/ui/print.css` is required; presets/core do not install printing. No runtime
dependency, external renderer, popup, iframe, HTML-string sink or PDF conversion.

Options are copied/validated: label?: bounded literal <=160 with no controls,
onError?: (error: unknown)=>void. Controller exposes readonly element,
print():boolean (request accepted, not proof of actual printing), cancel():void,
isPrinting():boolean and idempotent destroy(). Other methods throw after disposal.
Use native localized Print/Cancel buttons and polite generic status. Readonly
allows printing; IME provisional content does not (composition guards reset on
external replacement/readonly cancellation). Valid connected empty external HTML
host must share the editor's document. Imports/factory definitions are DOM-free.

On explicit invocation validate a detached getJSON snapshot through the editor
schema, then reuse the safe preview DOM builder with images always omitted and
localized alt placeholders. Links/navigation/resources remain inert. Never clone
the live editor, create IMG nodes, load fonts/images or insert raw HTML. Printing
does not mutate source content, source DOM, Selection, pending formats or history.
One requested snapshot remains immutable while later source editing continues.
The bounded print profile deliberately uses system fonts: remove persisted
font-family declarations from the detached fragment before attachment and use
system-ui/monospace in print CSS. Preserve other safe formatting. Application-owned
global CSS/resource rules are trusted and remain outside this loading guarantee;
the module does not promise a style-isolated or pixel-identical rendering engine.

Create one owned noneditable surface as a direct body child, hidden on screen.
Required external CSS supplies a private computed custom-property sentinel; if
absent refuse with generic error before calling window.print, never silently
print the application's whole page. In print media, a lease-marked body hides its
other direct children and displays only the owned surface. Scoped print rules
style headings, lists/checklists, tables/merged cells/captions and preformatted
text; no global @page or persistent page styles. Application print CSS can affect
layout; page size, pagination, printer selection and PDF saving belong to browser/OS.

A per-document WeakMap lease permits one pending module print. Refuse an existing
foreign data-mw-print-active attribute; never overwrite it. Assign an opaque owned
value before native print. Release afterprint, observed print-media exit, explicit
cancel, synchronous exception, ownership loss or disposal. No polling/timers.
Keep the snapshot until a real completion signal/cancel; browsers may return from
print before the dialog closes. Without signals callers use cancel/destroy.
Remove only the exact owned surface and owned body marker value; preserve later
application changes. Install lifecycle/event/observer cleanup before trusted
callbacks; reentrant print/cancel/destroy or failed diagnostics cannot leak a lease
or resurrect state. Observe only actual removal paths, not document subtrees.

Acceptance uses real browsers with a stubbed native print boundary to inspect the
snapshot/media CSS and emit completion; this is not printer-dialog/physical-output
verification. Cover source identity/backward selection/history, zero additional
image requests, missing stylesheet refusal, competing instances, stale/disposed
callbacks/host adoption, print throw, composition/readonly and localized controls.
Add RU/EN examples and main demo without replacing real window.print in product.
Standalone public closure <=12000 gzip JS; CSS <=4000 raw bytes. A selected
standard-print-ready profile keeps 80000 gzip JS/20000 raw CSS. Run only focused
checks, no CI observation or Git writes without explicit request.
