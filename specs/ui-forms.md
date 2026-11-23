# Reusable optional editing forms

Status: implementation contract. Persisted schema and existing command behavior stay unchanged.

Image upload feedback follows [image-upload-feedback.md](image-upload-feedback.md): native localized progress from application byte reports, generic errors and explicit retained-File retry at the original insertion range in all mode. Clear retry authority on document changes, readonly, IME, another file, cancellation and destroy. Do not change ImageFormValues or expose upload controls in edit-only mode. This new behavior has authored browser definitions, not a newly executed runtime validation.

Public facade entries are `/ui/links`, `/ui/images`, `/ui/search` with `createLinkForm`, `createImageForm`, `createSearchForm`. They live in feature-owned folders under the optional plugins package, never the core graph. CSS is explicit via `/ui/forms.css`; JS entries import no CSS/framework and retain only their required feature. Core/plugins retain zero third-party runtime dependencies.

Each factory takes `(host, editor, options?)` and returns a typed controller with `element`, `refresh`, copied `getValues`/partial `setValues`, and idempotent `destroy`. Form values are drafts, not persisted editor data. Options include initial values, an explicit accessible label and an optional diagnostic error callback. Image forms additionally accept the validated, snapshotted optional boolean `keepAspectRatio`, default false, under [image-resize.md](image-resize.md). It configures the transient selected-image checkbox, not persisted data or an ImageFormValues string field. Built-in labels/status/error text use RU/EN feature dictionaries and editor locale/overrides; custom application labels remain explicit. Render text through DOM APIs, never executable HTML. Missing required plugin fails before mounting a view.

Standard table insertion additionally supports explicit
`table.presentation: 'popover'` under [table-picker.md](table-picker.md): the entire
insertion panel is compact and anchored outside page flow, preserving numeric
dimensions, optional picker composition and existing selection/history/focus
ownership. Its default stays inline; standalone forms/picker APIs are unchanged.

Forms use embedded nonmodal UI by default; image forms additionally support the explicit dialog presentation below. Every form host must be outside the persisted editor surface; reject the surface itself or a descendant before creating view DOM, listeners or subscriptions, preserving document, selection and history. Preserve real DOM Range selection including empty blocks and backwards ranges before focus enters controls; restore only a still-valid target when executing a command. External document replacement invalidates remembered targets and does not apply old drafts to a new document until a fresh editor selection. Native/editor changes refresh inspected metadata without replacing in-progress field drafts while the form is focused. Language/read-only updates do not mutate content, history or drafts. Search/navigation remain usable read-only; edit actions are disabled and guarded.

Link UI creates/updates/unlinks using existing core link commands, including safe URL, title, new-tab and optional new-label insertion. Image UI inserts/selects/updates/removes via the image plugin, supports alt/dimensions/caption and application-owned upload/cancel; dispose must cancel only the form's own upload and ignore late results. A scoped AbortSignal extension to image upload may be added with its own specification/tests, preserving existing callers. Search UI provides query, case/whole-word, previous/next, replace current/all and clear, using the search plugin's result/error state and single-step replacement history. Destroying a search form does not clear application-owned search state.

LinkFormOptions.scope is an optional 'selection' (compatible default) or 'anchor'.
The anchor scope is edit-only: one ordinary actual anchor must own both endpoints
of the saved range; expanded ranges need selected text and cannot include images,
foreign namespaces or protected semantic descendants. Updates/unlink apply to the
whole anchor using the existing caret command inside one outer transaction, with
the original selection and direction restored before commit. Rich children are
retained. Removed anchor-container endpoints map to equivalent parent boundaries.
Do not silently retarget an anchor-scoped draft after selection change, replacement,
read-only/composition or application focus callbacks. The default selection scope
keeps existing partial-range link formatting and new-link insertion behavior.

All subscriptions, DOM listeners, pending operations and selection state have cleanup, including editor destruction; detached controls become inert. Multiple forms/editors have independent drafts and state. Factories are import-safe without DOM; mounting needs a browser. Styling is scoped to `mw-form` and `--mw-*` variables and must not depend on documentation CSS.

The RU/EN homepage and playground use the same public form factories. Remove their duplicate form logic from EditorDemo.vue; keep only application-owned upload transport and sample controls. Standalone examples document imports, CSS, lifecycle and plugin requirements.

Acceptance Chromium/Firefox/WebKit: selected text/empty blocks/caret editing, focus and backwards selections, one-step undo/redo, external replacement invalidation, read-only, language switching and overrides, invalid input/error recovery with draft preservation, two instances, unmount/destroy and detached controls, scoped upload cancellation/late callbacks, search navigation/replacement. Build declarations, verify actual tarballs/selective imports/CSS budgets and exercise both language demos.

## Additive image edit-only mode

ImageFormOptions.mode?: ImageFormMode accepts 'all' | 'edit', default 'all'; export the named type from existing image-form public entries. Validate mode before mounting/listening and snapshot it: mutating the caller options object cannot enable excluded operations. Existing all-mode Insert/Upload/Cancel and Enter-to-insert remain compatible.

Edit mode renders only selected-image fields, Update and Remove. Insert/file-upload/cancel controls are absent; every insert/upload handler path also refuses edit mode, including synthetic events. Enter in a normal text field updates the selected image, never inserts/replaces it. No selected target means disabled guarded Update/Remove; drafts cannot create a new image. Constructing or disposing edit mode does not start transport or cancel application-owned uploads. An actual document mutation, read-only or composition still follows the existing images-plugin cancellation contract.

Bind edits to an actual selected IMG and saved native Range; after restoring focus recheck identity, disposal, API revision, read-only and composition before command execution. An API replacement invalidates the old target; a fresh editor selection can start a new inspected draft. Input focus/locale refresh must preserve in-progress drafts. Do not apply a draft to a different/recreated image during a focus callback or lost selection. Unchanged caption text omits caption replacement so rich caption children survive unrelated metadata updates; an explicitly edited caption uses the existing literal-text image command. Invalid URLs/dimensions/caption fail atomically and retain the draft. All mode keeps its existing behavior; regressions verify default Enter/upload compatibility.

Cover edit-mode Enter/update/remove + exact node selection/history, absence/inertness of insert/upload and no transport callback, missing/changed/API-replaced targets, focus-time replacement/read-only/composition/destruction, rich-caption preservation, unsafe metadata, and locale/draft/disposal. Keep distinct risk cases instead of every field×engine×selection combination.

Edit-only image forms reject owning semantic/foreign ancestors and semantic/foreign descendants of a containing figure inside the editor before applying a command. This protects caption siblings that Update/Remove may replace; an application-owned figure outside the editor surface is not treated as document ownership. The existing all-mode contract is unchanged.

## Additive image proportions

Both image-form modes expose localized `ui.images.keepAspectRatio` under image-resize.md. The checkbox is default-off and applies to the already selected ordinary image. A known stored pair takes precedence over already-loaded natural dimensions; unknown proportions disable the checkbox without triggering a request. With locking on, input in one dimension updates the other draft from a fixed inspected ratio, rounded to an integer pixel. Apply/Update commits metadata once; `edit` Enter updates and `all` Enter preserves insertion behavior. Programmatic setValues remains literal, and locked Apply rejects a mismatched pair, blank/out-of-range dimensions, changed src or stale target without losing the draft. Uncheck for independent dimensions or dimension removal. Preserve unchanged rich caption children and existing API/read-only/IME/disposal/focus guards. Locale changes keep drafts and lock state. Do not treat earlier image-form validation as evidence for this new sizing implementation.

## Opt-in native image dialog (2026-11-20)

ImageFormOptions.presentation?: 'inline' | 'dialog' defaults to inline and is
validated/snapshotted before mounting. ImageFormController adds open(), close()
and isOpen(). Its element remains the actual form section in both modes. Inline
open focuses its first enabled input, close is a no-op and isOpen is true while
mounted. Dialog mode mounts a closed, separately owned HTML dialog around that
section; open captures the current editor range before showModal and field focus.
The host must be connected and the browser must support showModal; there is no
nonmodal fallback advertised as a modal. No implicit global dialog registration,
framework dependency, document node or preset inclusion is added.

Use native modal focus containment, an accessible localized label, a visible
localized Close button and native Escape/cancel dismissal. Closing restores the
still-connected opening control (or the editor when it was the origin), without
executing a mutation or applying drafts. Invalid drafts remain available in the
open dialog. Applying a successful insert/update/remove closes the dialog. The
existing selection restoration and focus-time revalidation run with the modal
temporarily suspended so the editor is not inert during commands; rejected actions
reopen only the same still-owned dialog session. Alignment and upload progress
remain available without replacing the draft. An upload's successful insertion
closes the dialog; cancellation/dismissal aborts only this form's own pending upload
and revokes its retry authority. Read-only, external API replacement and disposal
close/invalidate an active dialog; late callbacks cannot reopen it or steal focus.
During native close suspension, suppress incidental focus-time range recapture
and target inspection: the browser may automatically focus the editor before the
command restores its remembered range. This guard leaves API/revision invalidation
and application focus callbacks active; they still invalidate stale operations.
Destroy removes its dialog and listeners and is idempotent. Inline behavior stays
compatible. Both all/edit modes can opt into dialog presentation; contextual-image
UI retains its existing embedded edit form unless separately configured in future.

Acceptance covers selected insertion and Undo, modal focus and Escape, retained
invalid draft, API/read-only invalidation, stale focus callbacks, independently
owned instances, closed/detached controls and own-upload cancellation. Focused
three-browser results and actual JS/CSS costs are recorded separately.

## Search query backward keyboard navigation

Shift+Enter in the query field navigates to the previous indexed match with wrapping. If the query/options draft differs from the indexed state, apply that draft first and select its last match. Empty/no-result queries do not create a selection or history entry. Search remains available read-only. Existing plain Enter continues to submit from the first match, and Enter in the replacement field retains its current behavior. Ctrl/Meta/Alt-modified Enter, composition candidate confirmation (`isComposing` or legacy keyCode 229), already-handled events and events outside these fields do not trigger the new backward action. Handled query Shift+Enter prevents an enclosing application form submission. Navigation uses the existing search commands and their disposal/validation boundaries; invalid drafts preserve the existing query error and never navigate stale results.

The query field advertises `aria-keyshortcuts="Enter Shift+Enter"` and a localized, overrideable `ui.search.queryKeys` title. Changing locale preserves drafts and history. Existing homepage/playground public forms inherit the behavior. Acceptance covers changed-query and repeated backward navigation, actual selected text and wrapping, read-only, unchanged HTML/history, invalid drafts and composition/modifier guards, localization and the RU/EN live examples. Validate through CI only for this user-authorized small release; local tests/builds remain disabled.

## Immediate image placement controls

The image form in all/edit modes exposes localized left/center/right/reset buttons under [image-alignment.md](image-alignment.md). They apply imageCommands.align immediately to the remembered ordinary image with post-focus revision/identity checks, independently of the string drafts and existing ImageFormValues shape. Read-only, composition, upload and missing/ineligible selection disable and guard actions. Preserve draft values, rich caption, target identity, one-step history and cleanup. Contextual image properties inherit the same controls by reusing the edit-only form; no independent engine or preset dependency is introduced.

## Link-form selection SDK adoption — 2026-11-23

The link form alone uses editor.selection revision-bound handles under
plugin-sdk-next.md instead of treating a remembered live Range as authority.
Keep the existing FormSelection internal shape, anchor/selected-text semantics,
focus-time intent checks, correctable invalid drafts and one-step history.
Synchronous document mutation/replacement with identical markup invalidates a
draft target before submission; getRange returns only an observational clone.
Release old captures on recapture, API invalidation and disposal. Stage and focus
restoration suppress incidental recapture, then revalidate before mutation.
Other forms retain their current ownership contracts.
