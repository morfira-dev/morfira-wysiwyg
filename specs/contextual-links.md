# Contextual link actions — U3c

Status: accepted first implementation contract; actual runs belong to verification-backlog.md.

## Independent composition

Expose `@morfira-dev/wysiwyg/ui/contextual-link` and `/ui/contextual-link.css`. `createContextualLinkUI(host, editor, options?)` returns readonly element, refresh() and idempotent destroy(). Options are optional label, onError and finite gap (0–32 CSS px, default 8). Export adjacent named controller/options/message-key types and a RU/EN message catalog. Reuse createLinkForm for editing and native saved-selection support. No implicit preset installation, core imports, framework/runtime dependencies, network assets or new persisted schema. Explicit styles are core + ui/forms.css + ui/contextual-link.css.

The empty connected HTML host is outside the editor surface in its owner document, on an application-owned viewport overlay layer. Transformed/filtered/perspective/paint-contained or clipping host ancestors are unsupported. Controls use scoped --mw-* variables; no global overlay manager or DOM relocation.

## Eligibility and behavior

Show a plain-text URL preview and Open, Edit, Remove actions automatically for a collapsed native caret inside one actual ordinary HTML anchor with nonempty text, wholly inside the focused editor. Reject foreign namespaces and owning semantic-node ancestors. Root/parent boundary carets, expanded ranges and image-only anchors are outside this first slice. Mixed text/image link children remain untouched. This deliberately complements the noncollapsed contextual text toolbar. Geometry may inspect a separate anchor-content Range without changing native selection, cloning content, focusing or mutating the document.

Open is an explicit native anchor action, never automatic navigation. Revalidate the actual current href through the editor codec before displaying and immediately before activation; additionally resolve against document.baseURI and allow only http/https/mailto/tel. Relative URLs resolving to unsupported protocols, protocol-relative URLs, control/space-obfuscated values and unsafe schemes are ineligible. The codec normalizes outer whitespace around an otherwise safe URL; internal control/space obfuscation remains rejected. Use target=_blank and rel=noopener noreferrer. Prevent editable unmodified primary clicks on eligible content links from navigating away while allowing native caret placement; preserve modified/auxiliary/context-menu and read-only native navigation.

Edit explicitly restores the saved caret and rechecks the same current anchor, then lazily mounts createLinkForm and focuses its URL input. Reuse existing validated whole-anchor caret commands: metadata edits preserve children/caret and one Undo; Remove unlinks the whole anchor preserving children and its normal single Undo. Never retarget a draft to a different anchor. Read-only may retain preview/Open but blocks Edit/Remove and closes active forms. Composition hides all controls. Ordinary locale updates refresh localized labels without resetting a draft.

Keep the saved exact caret when focus enters owned controls, including WebKit losing native Selection. API replacement invalidates synchronously; stale retained controls/queued callbacks cannot edit or open replacement content. Outside pointer/focus departure dismiss without stealing focus. Escape closes an edit form or preview and returns the saved caret once; queued selectionchange/refresh must not reopen a dismissed session. A genuine new editor selection action or Alt+F10 at an eligible caret can reopen. Alt+F10 focuses the first enabled preview action; it does not consume expanded-selection or other-editor shortcuts. No automatic focus stealing.

## Geometry, lifecycle and security

Use finite clipped anchor rectangles and fixed above/below placement clamped to viewport/VisualViewport with small margins; narrow panels wrap/scroll. Observe relevant scrolling/resizing only during an eligible session and coalesce in one owned animation frame. Geometry-only hiding can retain observation to reveal the same current anchor after scrolling; dismissal/ineligibility/destroy cancels observers and queued work. No polling or document-wide traversal.

All listeners, forms, subscriptions and observers are per instance and released on destruction and setup rollback. Destroy is idempotent, refresh after destruction throws, editor remains usable. Malformed options/host fail before mounting. Custom text/error handlers are trusted application code; URL/label/status rendering is textContent, never executable HTML. A failed focus recheck or external replacement must abort the action rather than editing a new document.

## Acceptance and measurement

Cover representative Chromium/Firefox/WebKit behavior: caret-only preview without focus/selection mutation; metadata edit/unlink with rich children and Undo; explicit safe Open and no automatic navigation; bad href/base URI; keyboard and dismissal; replacement/read-only/composition races; lost native Selection, two instances, disposal/stale controls and setup rollback. Avoid duplicating the full link-form/core matrix. Add public type, facade/selective-import and actual installed-tarball coverage. Add RU/EN API docs and live homepage/playground examples through public controls.

Measure raw/gzip/Brotli and CSS independently, selected shared chunks once. Add an entry guard of 16000 gzip JS bytes and 3000 raw extra CSS bytes; preserve core and all existing profile guards. Measure a selected standard-contextual-link-ready closure under the existing 65000 gzip JS / 20000 raw CSS profile budget; do not imply an unmeasured combination of every optional module fits that budget. Full check, docs build/tests and installed consumers are required before claiming completion.
