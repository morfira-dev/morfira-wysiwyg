# Responsive optional UI and focus presentation

Status: accepted bounded CSS contract, 2026-11-23. Runtime command, schema,
selection ownership and preset/module inclusion remain unchanged. Executed
validation is recorded separately; this specification does not claim complete
WCAG conformance or OS-level zoom certification.

## Scope and observed causes

Optional forms/panels must remain operable in a 320 CSS-pixel viewport and with
large inherited/control text. Native dialogs must fit the viewport border box
and provide their own vertical scrolling on short screens. Optional host content
may scroll locally (for example a large equation); it must not widen the page.
Application-imposed fixed/minimum dimensions remain application-owned.

The media dialog used content-box max-width plus 32px padding and borders, so its
specified narrow maximum could exceed the viewport. Its inputs retained intrinsic
grid minimums. Formula dialogs lacked a viewport-height bound. Generic form roots
were not border-box, standard headers could not wrap, and docked search retained
three columns even on narrow screens. Viewport-only breakpoints also left a
320px embedded host in a wide desktop viewport using its full seven-column grid.
These are layout causes, not newly executed
browser evidence. Focused browser acceptance supplies the rendered evidence.

## CSS-only behavior

- Forms and owned media/formula boxes use bounded border-box sizing, zero shrink
  minima where needed and wrapping for labels/status/action text.
- Standard panel headers wrap while titles may shrink. Only the docked search
  panel body establishes a named inline-size container: its actual content width
  selects three columns at 800px and below and two columns at 480px and below.
  A narrow application host receives the same layout in a wide viewport. Other
  popovers keep their existing sizing/positioning; document/search behavior stays
  unchanged.
- Media/formula/image native dialogs use viewport-bounded border boxes and
  vertical overflow. Source text, status and action labels remain reachable.
- Existing desktop density remains compatible. On coarse pointers, actionable
  form/context controls expose at least 44 CSS pixels of height; checkbox labels
  provide that activation area. This is a minimum target policy, not a claim that
  every viewport can fit all controls without scrolling.
- Optional media/formula controls receive visible keyboard focus, including
  system Highlight focus outlines in forced-colors. Existing scoped contextual
  focus styles remain; selected controls continue to use a non-color-only outline.
- No global reset, document-style leakage, new runtime module, dependency, font,
  observer or application event interception is introduced. `--mw-*` variables
  continue to own theme customization. Context styling stays in each optional
  stylesheet so selective imports do not depend on the ready UI.

## Focused acceptance

Using public built module/CSS entries in Chromium, Firefox and WebKit: docked
search and standalone forms stay within a 320px viewport or a 320px host inside a
1200px viewport with large control text;
media/formula modal border boxes fit short viewports and their final actions can
be scrolled into view and keyboard-focused. Modal Escape/Close and saved editor
HTML/history remain unchanged by presentation. Coarse-pointer form action/checkbox
label and contextual action heights meet the defined minimum. Forced-colors
keyboard focus has an explicit nonzero visible outline. CSS remains opt-in and
within existing per-profile 20000-byte caps; report actual measurements separately.
