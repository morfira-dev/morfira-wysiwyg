# Optional visual node views in the editing area

Status: accepted bounded implementation contract — 2026-11-23. Public factory
`createInlineNodeViews(editor, { name, create, onError? })` is exported through
`/sdk`, with no implicit preset import, dependency or stylesheet.

## Canonical document and supported owners

Support registered atomic inline SPAN nodes and registered text-only block nodes.
The current editor schema validates each actual target before invoking callbacks.
Editable inline extensions, unknown semantic identities, nested semantic owners,
foreign namespaces and malformed targets are not visualized.

Views form a positioned overlay layer inside editor.element and outside the
persisted editor.surface. They occupy the actual target's existing geometry;
application-owned CSS can reserve additional target size. The ordinary editor
stylesheet already positions .mw-editor; a custom theme must retain a positioned
editor container. Overlay content is clipped to the editing area. There is no
editable contentDOM, persisted callback DOM or intrinsic resizing of model nodes.

Callback output remains trusted application UI, not sanitized untrusted HTML.
It must be a fresh detached HTML element. SDK ownership makes it inert and
aria-hidden, with no editable controls in the document. Resources requested by
trusted callback DOM remain application-owned; the SDK itself loads no resources.
Canonical HTML/JSON, clipboard, text/search, mapped positions and history retain
only the semantic source. No wrappers/attributes/styles are written into surface.

## Geometry, selection and lifecycle

ResizeObserver (when available), window resize, captured scroll and editor
notifications schedule coalesced geometry refresh. Transformed container scaling
is accounted for; wrapped/multirect targets are hidden rather than stretched.
Targets without visible bounds are hidden. Geometry does not confer authority.
Pointer activation selects the actual current semantic node with native Range,
after rechecking ownership, read-only/composition and synchronous focus callbacks.
Keyboard/deletion remain owned by the existing atom/block editing contracts.
Only the rendered view is made inert; text-only block source does not acquire a
new generic atomic editing model. Its owning block plugin retains that policy.
Read-only retains visual presentation but blocks SDK selection actions.

Each returned element has optional update/destroy lifecycle callbacks, called for
its actual target identity. Unknown document changes can rebuild nodes; old views
are disposed and newly validated nodes create new views. Loss of layer/container
ownership stops the controller without inserting views into surface. Failed setup
cleans every partial view/listener/observer. Later callback errors dispose owned
views; optional onError observes errors without unhandled async rejection.
Controller destroy is idempotent and removes only its own layer and subscriptions.

## Acceptance

Focused three-engine cases cover visual placement, scaled geometry, source/text/
HTML/JSON/history invariance, native node selection, atom navigation/Undo, update/
replacement/dispose, callback rejection, readonly/composition, focus replacement,
foreign/stale/malformed targets, controller isolation and geometry scheduling.
RU/EN guides and a lazy homepage example show safe application-owned atoms,
canonical source output and explicit limits. Actual validation and size evidence
are recorded separately; no physical-device/AT certification is implied.
