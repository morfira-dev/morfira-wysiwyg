# Ordinary sibling-leaf selection replacement

Status: accepted bounded implementation contract. Schema v1 and public APIs remain unchanged. This implements the smallest replacement slice from `input-correctness-next.md`; it is not a general structural-selection model.

## Eligibility and ownership

Core handles noncollapsed, cancelable `beforeinput` selections for `insertText` with a string payload and `deleteContentBackward` / `deleteContentForward`. Both real keyboard-generated beforeinput and beforeinput-only dispatch use the same operation. A noncancelable event is delegated because core cannot suppress its native default. Already canceled events, composition-specific input, active composition and read-only retain the existing guards. Unsupported shapes retain their previous input path rather than being partially edited by this handler.

Both endpoints must be inside distinct ordinary XHTML p/h1–h6 leaves that are direct siblings under one editor root, blockquote or td/th. Every intervening sibling must also be an ordinary eligible leaf. Eligible inline descendants are text, strong/em/u/s/sub/sup/a/span/code/br. No list, figure, pre, hr, table, foreign namespace, another parent or semantic root leaf (`data-mw-node`) may be crossed. A semantic blockquote ancestor stays intact and may contain supported ordinary leaf siblings. Root-level child-index endpoints are outside this first bounded path.

## Result and affinity

Preserve the actual left wrapper, its attributes and untouched prefix. Move the right suffix with inline marks into that left wrapper, remove only the selected middle/right leaves, and preserve all unrelated siblings/cells/ancestors and their DOM identity. Insert payload as literal text at the starting DOM boundary; text inherits the starting inline context, never the removed right-hand marks. The caret is immediately after inserted text; deletion leaves it at the same prefix/suffix boundary. Empty block placeholder breaks do not become extra line breaks when joining nonempty content. Removing a placeholder does not discard empty inline wrappers or their semantic metadata. A fully empty result has one editable placeholder br at the retained insertion context.

Starting inline affinity applies to the replacement payload and its immediate DOM caret, not a new forced typing state for later native input. At a terminal link edge, subsequent ordinary input follows the existing native link-boundary affinity. In the accepted fixture, replacement starts inside `a` and inserts `X` inside that link with the caret in its text; the next native `Y` is outside `a`, immediately before the retained right-hand suffix. Its logical caret advances by one, and undo removes `Y` separately before restoring the original selected document. This slice does not force later link-end typing back into the link or change the existing link/autolink insertion policy.

Use the existing validated synchronous transaction, not a second history stack. Replacement is isolated from an earlier native typing burst and subsequent typing. One undo restores original HTML and the exact forward/backward range; redo restores the replacement caret. Same-value controlled feedback preserves that caret. A failed validation rolls back document, selection and history, and no intermediate change is published.

## Acceptance and limits

Chromium, Firefox and WebKit cover real typing/Backspace/Delete and beforeinput-only insertion/deletion; forward/backward rich ranges; exact next typing and undo/redo; earlier typing isolation; literal markup payloads; Unicode, empty blocks and br node boundaries; left attributes and unaffected node identity; blockquote and merged-cell isolation. Guard tests cover canceled/read-only/composition/unsupported selections and controlled React StrictMode feedback. Cross-container replacement, multi-item list replacement, paste/drop, word deletion, native replacement target ranges and real-device IME remain separate contracts.

No new runtime dependency, CSS, eager optional module or timing claim is introduced. Report actual raw/gzip/Brotli core and selected profile sizes after implementation.
