# Guarded literal insertion at an ordinary caret

Status: accepted narrow native-typing regression fix, 2026-11-23.

`editor.insertTextAtCaret(text): boolean` inserts at one collapsed actual native
selection inside an ordinary inline-only P/H1–H6, LI, blockquote or table cell.
Reject root gaps, expanded selections, PRE/figure/foreign/semantic/protected
ancestors and structural bodies. An adjacent owned atomic sibling is permitted;
its content/metadata are not a text insertion target. Read-only, composition,
active transactions and stale revision/selection/pending-format intent refuse
without retargeting. Destroyed editors retain the ordinary lifecycle exception. Invalid input throws before editing: literal
string at most 20000 UTF-16 units, no NUL. Empty text is a no-op; CRLF/CR become LF.

Reuse the existing pending-format beforeinput insertion mechanics, with one
insertText history transaction. Native Range selects the actual inserted Text
before applying pending formats; equivalent inclusive boundaries after formatting
are moved to the actual included Text, never into the preceding semantic atom.
Collapse the inserted range's actual end. Pending-format and Undo behavior remain
owned by core, including grouped sequential typing. No synthetic input events,
filler characters/nodes, grammar processing or alternative typing engine exists.

The SDK atom keydown fallback owns only one printable non-composing unmodified
key at its exact terminal atomic gap, where WebKit sends no beforeinput/input.
It delegates literal insertion to this core method. Ordinary native input retains
its existing route; IME/composition and unrelated keyboard owners are unchanged.

Focused acceptance: literal markup is inert, pending marks/styles apply only to
inserted text and round-trip history; readonly/composition/unsupported contexts
and focus redirection refuse; repeated direct calls group as insertText history.
Actual validation and weight are recorded by the coordinator.
