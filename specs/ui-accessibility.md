# Bounded ready-UI keyboard accessibility

Status: toolbar contract accepted for implementation, 2026-11-23. Validation is
reported separately from this specification; browser keyboard cases do not certify
screen-reader, mobile, native OS picker or WCAG conformance.

## Toolbar focus and native controls

This slice changes only the optional `/ui/editor` shell, reused by ready UI.
Keep native buttons, select and color-input semantics, localized toolbar/control
names, pressed/mixed states and actual disabled states. No new runtime dependency,
ARIA widget framework, document operation or eager optional feature import.

Each visible toolbar/overflow navigation scope has one enabled roving Tab stop.
Focus entering an owned control directly (pointer, browser restoration or an
application's `focus()`) immediately makes that control its scope's Tab stop.
Other controls in that scope use tabindex=-1. Native Tab/Shift+Tab leave the
scope instead of revisiting an earlier stale Tab stop. State/locale refresh must
retain an enabled focused control and repair Tab stops when a control becomes
disabled; a scope with no enabled controls retains its existing toolbar fallback.
Do not move user focus merely to repair tabindex.

Unmodified input/select Arrow/Home/End keys retain native behavior; the shell
must not cancel those keys or move focus to another toolbar control. Existing
explicit Alt+Left/Right toolbar navigation remains compatible. Button navigation
and direction-aware wrapping retain their existing contract. Tab is not trapped.

Keyboard More opening focuses the first enabled overflow control and updates its
roving stop; closed overflow controls stay outside Tab navigation. Escape from
owned overflow returns focus to that instance's More button. Escape from the
main toolbar returns focus to its editor, including after API replacement has
invalidated a saved selection, without editing/history. Native composition and
already-handled events retain their existing guards.

Focus, refresh, open/close and disposal remain per-instance. One toolbar must not
change another toolbar's roving state, selection or history. All delegated focus
listeners are released on destroy; detached controls remain inert.

## Acceptance evidence required

Focused Chromium/Firefox/WebKit cases cover direct select/color focus followed by
Tab/Shift+Tab, native key cancellation/focus, disabled/locale refresh, keyboard
More and Escape, replacement recovery, multiple instances and owned cleanup.
Measure selected ready gzip closures; this slice must stay small and preserve
all existing profile budgets. Real assistive-technology/device verification and
broader accessibility work remain explicitly unverified unless separately run.

## Scoped presentation additions

Toolbar buttons (including More), selects and inputs have at least 44px minimum
width/height for a coarse primary pointer, including compact density. Desktop
compact defaults remain unchanged. Forced-colors keyboard focus uses an explicit
2px system Highlight outline, including pressed controls, instead of relying on
a theme accent color. These are scoped CSS guarantees; physical touch targets,
platform pickers and assistive technology still require separate device checks.

## Default theme contrast and editor focus

The default light theme must provide at least 4.5:1 computed foreground/background
contrast for normal muted text: placeholder, ordinary quote and image caption.
The previous #8490a1 on white misses that bounded target; use a darker muted
fallback consistently in core, forms and suggestions. Preserve application-owned
--mw-* overrides and do not rewrite document colors. A demonstrated dark override
is a separate tested example, not automatic dark-mode/contrast certification.

The contenteditable surface must retain a visible keyboard focus outline in
forced colors, where the normal box-shadow ring may disappear. Use a scoped
system Highlight outline without imposing colors on document content. No new
runtime behavior or global listeners are required for these style changes.

References: [W3C contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html),
[W3C toolbar guidance](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/).
These are design/acceptance references; focused automated coverage is not WCAG
conformance or assistive-technology certification.


## Availability policy — 2026-11-23

Physical-device and assistive-technology sessions are unavailable by user decision. Retain their unverified status as an evidence limitation; they are not planned follow-up work or a release gate, and must not be recommended unless the user reopens the scope.
