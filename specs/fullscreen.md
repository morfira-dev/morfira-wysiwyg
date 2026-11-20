# Optional fullscreen workspace UI

Status: accepted next everyday-authoring slice. Validation belongs to verification-backlog.md.

## Composition and scope

Expose `/ui/fullscreen` and explicit `/ui/fullscreen.css` through the public facade.
`createFullscreenUI(host, editor, options)` requires `options.target: HTMLElement`,
an application-owned connected same-document HTML wrapper containing both
`editor.element` and the empty control host. Host must be outside persisted editor
content. Options additionally accept `label?`, `onChange?: (active:boolean)=>void`
and `onError?`. Export adjacent FullscreenUIOptions, FullscreenUIController and
FullscreenUIMessageKey types plus RU/EN fullscreenUIMessages.

Controller: readonly element (native button), enter():boolean, exit():void,
toggle():boolean (resulting active state), isActive():boolean, refresh():void and
idempotent destroy(). Public methods except destroy reject after disposal.
No core/plugin/preset installation, framework/runtime dependency, fonts, document
schema or format change. This is an in-place CSS viewport mode, not the browser
Fullscreen API: browser chrome stays visible. Do not move/clone/remount editor,
framework wrappers, toolbar or content. Preview/printing remain separate future work.

## Mode and ownership

Explicit target wrapper receives only an owned mw-fullscreen class; the optional
scoped stylesheet supplies fixed inset viewport layout, scrolling and --mw-*
variables. Required host/target/options failures leave DOM/styles untouched.
Target must be outside persisted content, contain the actual editor container and
host, and remain connected to its original document light DOM. Shadow-root/slot
workspaces are rejected in this first slice; the existing Web Component uses light
DOM and remains compatible. Reject unsupported transformed,
filtered, perspective, paint/layout-contained ancestor chains rather than silently
claim viewport coverage. Existing application modal/overlay/layout policy remains
application-owned. No global overlay manager, inert mutation or modal focus trap.
Only one module-owned active workspace per document: another controller's enter
returns false without exiting or changing the current owner. Inactive controllers
can coexist; state and callbacks remain instance-owned. Do not remove preexisting
application classes or replace whole style attributes.

While active, suppress background document scrolling with owned body overflow-x/y
inline values. Snapshot each value/priority and restore each only if still owned;
application updates to either axis must survive exit. Since fixed layout removes
the workspace from page flow, snapshot page scroll coordinates at entry and the
effective locked coordinates after layout. Restore the entry coordinates on exit
only while the page still has that locked position and original body; preserve
application-driven background scrolling. Do not add spacer nodes or reparent DOM. Release document ownership,
owned class, observers/listeners and scroll styles on exit/destroy/editor disposal,
setup failure, target/ancestor detachment or adoption. Observe relevant ancestor
child-list changes and target ownership only while active; no document-subtree
input observer or polling. Moving an active connected target must refresh/revalidate
its ancestor chain. Restoring view mode does not change document, undo/redo,
selection direction or current caret. Never restore the stale selection from entry
after the user has edited/replaced the document while fullscreen.

Entry declines during editor IME composition; readonly remains viewable/toggleable.
Composition state recovers after API replacement/readonly cancellation without
requiring a native compositionend. Normal API document synchronization while active
keeps the mode. Escape exits only when unhandled, not composing/229, with focus/event
inside the owned workspace; nested menus/forms get their first Escape. No global
F11 interception. Keep a still-valid current native editor selection when controls
own focus, without retargeting stale API ranges or stealing unrelated external focus.
Locale refresh updates the same control in place, preserving focus. Native button
has localized Enter/Exit labels and aria-pressed; diagnostics/callbacks cannot
prevent required cleanup. Callback exceptions are reported after stable state.

## Documentation and acceptance

RU/EN homepage/playground expose the control in the same actual workspace as
editor and toolbar, with a short guide and explicit CSS/setup recipe. Explain
browser chrome, ancestor limitations, external contextual-overlay host ownership,
nonmodal keyboard scope and unverified mobile/screen-reader limitations honestly.
Do not implicitly enlarge every preset or make optional CSS required by core.

Add representative three-browser tests: actual viewport geometry and unchanged
node identity/HTML/history/exact current selection; typing/Undo while expanded;
button/Escape/nested Escape/locale/readonly; composition cancellation; two owners;
cleanup/detach/adopt/style ownership and trusted callback/focus races. Keep case
count proportional, no browser-by-feature Cartesian expansion. Add two localized
docs smokes and public types/selective import/package boundaries. Use focused
local checks by default; complete local suites require the user's fresh command.

Measure raw JS/gzip/Brotli/CSS and a deduplicated
standard-fullscreen-ready profile. Standalone selected public factory (including
retained core helpers) guard: 8000 gzip JS bytes; optional CSS: 2000 raw bytes.
Standard selection retains 80000 gzip JS / 20000 raw CSS. No new runtime deps or
budget increases. Packaging smoke must use actual archives rather than source aliases;
complete installed-consumer matrices are not automatic local validation.
