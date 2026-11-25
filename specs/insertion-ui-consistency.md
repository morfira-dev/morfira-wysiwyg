# Consistent insertion and editing sessions

Status: accepted bounded integration contract, 2026-11-25.

## Presentation and user intent

Keep existing opt-in presentations: compact ready link/table controls may use
anchored popovers, images/media/formulas may use owned native dialogs, and search
stays nonmodal so the document remains available. This adds no generic UI manager,
new document operation, dependency, persisted node or automatic preset import.

Plain Enter in a supported single-line insertion field applies its current draft.
Already-handled events, Ctrl/Meta/Alt/Shift-modified Enter, composition events and
legacy IME keyCode 229 must not execute insertion or prevent their native/default
action. Image fields retain their existing contract; search deliberately retains
its separate Shift+Enter backward-navigation shortcut. An application may
handle Escape before the panel receives it; an already-handled Escape is not a
second dismissal request.

Invalid drafts stay visible and correctable without changing document/history.
Locale changes preserve an active draft. Successful edits retain the feature's
existing single-command history and focus restoration. Close/Escape cancels a
modal session without applying it. Captured selections are observations: every
actual mutation still revalidates revision, identity, user intent, read-only and
composition after focus callbacks.

## Media/formula session invalidation

Media insertion/editing dialogs refuse opening during read-only or composition,
matching image/formula editing behavior. Media viewing through explicit Load is
independent and remains available read-only under the existing media contract.
Composition start closes the media editing dialog and releases its capture.

Authoritative API document replacement or enabling read-only clears a local
media/formula composition latch, because core may terminate composition without
a subsequent native compositionend event. Invalidation closes without an explicit
return-to-origin focus request; manual Close/Escape and successful Apply retain
their existing origin behavior. Releasing a cancelled session never makes its old
controls authoritative, and late callbacks cannot reopen or edit replacement data.

## Acceptance

Focused three-engine cases cover modifier/already-handled/legacy-IME keys,
ordinary Enter after those keys, document/history and draft preservation,
read-only open refusal versus explicit media viewing, and composition cancellation
through API/read-only replacement followed by a fresh usable session. Preserve
existing invalid-input, focus-race, disposal and native dialog regressions.
