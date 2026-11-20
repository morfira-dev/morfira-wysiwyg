# Contextual link actions — U3c

## Mixed ordinary linked-text ranges — 2026-11-20

This addendum supersedes rejection of mixed/cross-anchor ordinary text ranges
below, without a new factory/option, dependency, persisted format or preset.
Keep caret and ranges wholly inside one ordinary anchor in their current
whole-anchor mode. Add a range mode only for noncollapsed nonempty text selections
that intersect at least one ordinary safe anchor but are not wholly in one anchor.
Pure unlinked selections remain owned by contextual text formatting.

Both endpoints must share one closest ordinary inline flow P/H/LI/blockquote/TD/TH.
Reject any selected structural/image/figure/pre/code/semantic/foreign/hidden or
noneditable content, cross-block endpoints and unsafe anchors. Inspect actual
selected nodes before any cloning; do not render resources for eligibility.
Track concrete range direction, relevant actual nodes and revision. Revalidate
before/after focus so document edits or replacements cannot redirect old actions.
No generic structural selection SDK or mapped positions are introduced.

Range mode shows localized selected-link actions and no Open URL (no ambiguous
navigation target). Edit opens the existing link form with scope:'selection' and
empty metadata drafts for mixed links, not a guessed first URL. Applying writes
one safe link patch to exactly selected text; remove unlinks only selected parts.
Preserve rich marks, unselected anchor prefixes/suffixes/metadata, text, logical
selection and backward direction with one Undo/Redo. Existing whole-anchor mode,
safe Open, Escape/Alt+F10, suppression, readonly/IME, locale and stale draft rules
remain compatible. Context preference claims only this eligible linked range,
never every unlinked selection; no competing text/link panels for the same range.

Reusable selection-scope link form enables unlink when its valid remembered
noncollapsed range contains linked text, even if neither endpoint is inside an
anchor. Keep existing broader form creation scope; do not narrow it to contextual
single-flow eligibility. Anchor scope remains whole-anchor, and mixed removal
must not run against a stale or replacement document. Backward range restoration
belongs inside the same document transaction so history captures it.

Add risk-oriented three-browser regressions for partial multi-anchor patch/unlink,
backward/history and exact outside metadata, safe Open absence, pure text preference,
readonly/IME, focus/API/Undo/disposal and invalid payload. Add RU/EN examples/docs,
preserve existing anchor behavior tests. Keep current 16000 gzip JS/3000 raw CSS
and selected standard guards; run only focused checks, no Git writes implicitly.

Status: accepted first implementation contract; actual runs belong to verification-backlog.md.

## Independent composition

Expose `@morfira-dev/wysiwyg/ui/contextual-link` and `/ui/contextual-link.css`. `createContextualLinkUI(host, editor, options?)` returns readonly element, refresh() and idempotent destroy(). Options are optional label, onError and finite gap (0–32 CSS px, default 8). Export adjacent named controller/options/message-key types and a RU/EN message catalog. Reuse createLinkForm for editing and native saved-selection support. No implicit preset installation, core imports, framework/runtime dependencies, network assets or new persisted schema. Explicit styles are core + ui/forms.css + ui/contextual-link.css.

The empty connected HTML host is outside the editor surface in its owner document, on an application-owned viewport overlay layer. Transformed/filtered/perspective/paint-contained or clipping host ancestors are unsupported. Controls use scoped --mw-* variables; no global overlay manager or DOM relocation.

## Eligibility and behavior

Show a plain-text URL preview and Open, Edit, Remove actions automatically for a collapsed native caret inside one actual ordinary HTML anchor with nonempty text, wholly inside the focused editor. Reject foreign namespaces and owning semantic-node ancestors. The original caret profile excludes root/parent boundary carets and image-only anchors; expanded text ranges follow the extension below. Mixed text/image link children remain untouched. This deliberately complements the noncollapsed contextual text toolbar. Geometry may inspect a separate anchor-content Range without changing native selection, cloning content, focusing or mutating the document.

The expanded-selection extension accepts one noncollapsed native range with both
endpoints wholly inside the same ordinary anchor and at least one selected text
character. Reject selected images and any foreign/protected/hidden/noneditable descendants
inside an expanded target anchor, including semantic descendants outside the selected
substring; also reject outside-to-link, cross-link, plain-text and parent-boundary
selections. Unselected ordinary images may remain untouched.
Open uses that anchor's safe URL. Edit and Remove act on the entire existing
anchor, preserving its rich children and the original expanded selection/direction;
they do not split a link around a selected substring. The independent text toolbar
continues to offer selection formatting/new-link actions. When both controllers
are mounted, a private per-editor ownership registration lets the text toolbar
yield eligible same-anchor selections and Alt+F10 to the link controller. Disposal
releases that preference; the text toolbar remains standalone without link UI.
No implicit module imports or global overlay manager are introduced.

The link form uses explicit scope='anchor' for these actions. Exact native range,
anchor identity and API revision are revalidated after focus callbacks; a changed
range in the same anchor invalidates an active draft rather than retargeting it.
The edit/unlink transaction captures the original range before temporarily using
the existing whole-anchor caret command and restores the interval before commit.
Native boundaries follow the existing text normalization; the selected text interval
and backward direction survive. Anchor-container endpoints removed by unlink become
equivalent boundaries in the retained children/parent.

Open is an explicit native anchor action, never automatic navigation. Revalidate the actual current href through the editor codec before displaying and immediately before activation; additionally resolve against document.baseURI and allow only http/https/mailto/tel. Relative URLs resolving to unsupported protocols, protocol-relative URLs, control/space-obfuscated values and unsafe schemes are ineligible. The codec normalizes outer whitespace around an otherwise safe URL; internal control/space obfuscation remains rejected. Use target=_blank and rel=noopener noreferrer. Prevent editable unmodified primary clicks on eligible content links from navigating away while allowing native caret placement; preserve modified/auxiliary/context-menu and read-only native navigation.

Edit explicitly restores the saved caret and rechecks the same current anchor, then lazily mounts createLinkForm and focuses its URL input. Reuse existing validated whole-anchor caret commands: metadata edits preserve children/caret and one Undo; Remove unlinks the whole anchor preserving children and its normal single Undo. Never retarget a draft to a different anchor. Read-only may retain preview/Open but blocks Edit/Remove and closes active forms. Composition hides all controls. Ordinary locale updates refresh localized labels without resetting a draft.

Keep the saved exact caret when focus enters owned controls, including WebKit losing native Selection. API replacement invalidates synchronously; stale retained controls/queued callbacks cannot edit or open replacement content. Outside pointer/focus departure dismiss without stealing focus. Escape closes an edit form or preview and returns the saved caret once; queued selectionchange/refresh must not reopen a dismissed session. A genuine new editor selection action or Alt+F10 at an eligible caret can reopen. Alt+F10 focuses the first enabled preview action; it only consumes supported caret or same-anchor text-range contexts in its own editor. No automatic focus stealing.

## Geometry, lifecycle and security

Use finite clipped anchor rectangles and fixed above/below placement clamped to viewport/VisualViewport with small margins; narrow panels wrap/scroll. Observe relevant scrolling/resizing only during an eligible session and coalesce in one owned animation frame. Geometry-only hiding can retain observation to reveal the same current anchor after scrolling; dismissal/ineligibility/destroy cancels observers and queued work. No polling or document-wide traversal.

All listeners, forms, subscriptions and observers are per instance and released on destruction and setup rollback. Destroy is idempotent, refresh after destruction throws, editor remains usable. Malformed options/host fail before mounting. Custom text/error handlers are trusted application code; URL/label/status rendering is textContent, never executable HTML. A failed focus recheck or external replacement must abort the action rather than editing a new document.

## Acceptance and measurement

Cover representative Chromium/Firefox/WebKit behavior: caret-only preview without focus/selection mutation; metadata edit/unlink with rich children and Undo; explicit safe Open and no automatic navigation; bad href/base URI; keyboard and dismissal; replacement/read-only/composition races; lost native Selection, two instances, disposal/stale controls and setup rollback. Avoid duplicating the full link-form/core matrix. Add public type, facade/selective-import and actual installed-tarball coverage. Add RU/EN API docs and live homepage/playground examples through public controls.

Measure raw/gzip/Brotli and CSS independently, selected shared chunks once. Add an entry guard of 16000 gzip JS bytes and 3000 raw extra CSS bytes; preserve core and all existing profile guards. Measure a selected standard-contextual-link-ready closure under the existing 80000 gzip JS / 20000 raw CSS profile budget; do not imply an unmeasured combination of every optional module fits that budget. Full check, docs build/tests and installed consumers are required before claiming completion.

## CI regressions — 2026-11-19

Explicit refresh resolves initial eligibility and placement before returning; scroll/resize updates remain animation-frame coalesced. If changing to readonly blurs the contenteditable surface to the document body, an already visible preview may retain ownership only while the exact native range and anchor still match; unrelated focus is not eligible. The anchor-scoped form intentionally disables its new-link-text field: stale-draft regressions exercise its enabled URL field and still require refusal after the bound anchor is removed.
