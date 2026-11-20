# Optional read-only document preview

Status: accepted large-block slice; executed evidence belongs to verification-backlog.md.

Expose `/ui/preview` and explicit `/ui/preview.css` with
`createPreviewUI(host, editor, options?)`, `previewUIMessages` and adjacent public
PreviewUIOptions/Controller/MessageKey types. Options: label?, live?:boolean
(default true), images?:'omit'|'load' (default omit), onError?. Controller has
readonly element, open():void, close():void, toggle():boolean (resulting state),
isOpen():boolean, refresh():void and idempotent destroy(). Other public methods
reject after disposal. Host is an empty connected same-document external HTML
element outside persisted editor content. No plugin or preset installation,
framework/runtime dependency, new schema, popup window, iframe, print engine,
DOM reparenting or editor remount. Preview is a separate inline nonmodal region.

## Safe rendering and resource policy

Render the current instance's validated schema-v1 JSON through an owned DOM
builder, retaining supported formatting/lists/tables/captions/semantic text.
Do not clone the live editor or read unsanitized innerHTML. Do not render live
resource nodes and filter them afterwards: that can fetch even while detached.
Default image policy creates literal localized placeholder spans (alt when
available), never IMG/source nodes or src attributes. Explicit images:'load'
permits the snapshot's validated image URLs and native loading. Applications own
URL/auth/CSP policy; this is opt-in resource loading, not a domain allowlist.
Links are always inert: no href/target/ping/download/navigation attributes, native
navigation or executable HTML. Keep ordinary link text/formatting, readonly
checklist appearance and opaque mention labels; no interactive editing handlers
or persisted preview metadata. Use textContent/DOM construction, no HTML sinks.

Snapshot/validation/resource bounds apply before live view replacement. Build
replacement off-view and swap atomically; failed refresh reports a generic
localized error and cannot mutate editor, selection, history or value callbacks.
No source mutation or focus/selection restoration is needed to show a view.
Pointer activation of controls preserves current editor selection when possible;
keyboard users keep native control focus. Preview content is focusable/readable,
not contenteditable. Native unhandled Escape inside the preview closes it before
outer fullscreen handlers, without stealing external focus. No focus trap or
unverified modal/screen-reader claim.

Closed preview contains no document snapshot and performs no render on changes.
Opening/explicit refresh renders current content. While open with live:true,
coalesce committed user/API changes into one owned RAF. live:false requires
explicit refresh (include a localized Refresh button). Locale refresh updates
controls/placeholders with current content without document mutation. Readonly
is fully usable. Close/destroy/editor disposal cancel frames, release listeners,
remove owned content/resources and reject retained controls. Guard callbacks,
disconnection/adoption and reentrant lifecycle changes; never resurrect a closed
or disposed view from a queued refresh. Do not observe the whole document.

## Acceptance and size

Add bounded three-browser cases: rich structure, real node/document/history/
selection observation, image default zero-request guarantee plus explicit opt-in,
inert unsafe-looking labels/links, live/manual updates, RAF cancellation,
readonly/locale/Escape and instance/disposal/error isolation. About 6–9 cases,
not every format-by-every-action matrix. RU/EN guide and live homepage/playground
example; focused docs smokes. Public types/package/selective-import checks and
actual focused archive smoke, never automatic broad local suites.

Standalone public preview factory (retained selected core helpers included):
12000 gzip JS bytes; optional CSS 3000 raw bytes. Add measured standard-preview-ready
under existing 80000 gzip JS / 20000 raw CSS. Core and presets remain unchanged.
Report raw/gzip/Brotli/CSS separately; no new fonts or runtime dependencies.
