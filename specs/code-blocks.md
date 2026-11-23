# Optional code blocks

Status: accepted implementation contract — 2026-11-23. Entries
`/plugins/code-blocks` and `/ui/code-blocks`; zero runtime dependencies, no grammar,
network request or default preset inclusion. Actual validation is recorded separately.

## Persisted and editing contract

`codeBlocks({ languages? })` registers text-only semantic PRE nodes named
`morfira:code-block`. `data-language` is a required enum from a per-instance list
(default plaintext, typescript, javascript, html, css, json, bash). Language IDs
are lowercase ASCII identifiers, maximum 32 characters, 1–32 distinct IDs;
plaintext is always available. Source is literal, at most 20000 UTF-16 units;
CRLF/CR normalize to LF. Whitespace, tabs and trailing LF otherwise survive
HTML/JSON, history and ordinary document clipboard. No source HTML is executed.
Other editors must register this schema to preserve semantic language metadata;
unregistered readers may retain PRE text but lose metadata. There is no arbitrary
language attribute, CSS class, grammar loader or source-controlled URL.

`codeBlockCommands(editor)` returns insert({source, language?}),
update(actualPRE, patch), remove(actualPRE), get(actualPRE), exit(actualPRE).
Insert requires a collapsed caret in one ordinary root P/H1–H6 without semantic
or embedded owners and splits its actual prefix/suffix around the new PRE.
Update/remove/exit target actual direct-root registered PRE nodes only. Validate
source/language and native target before transaction; revalidate after focus.
Read-only, composition, stale/detached targets and unsupported list/table or
structural source selections refuse without partial mutation. Each command is one
undoable edit. Exit inserts an ordinary paragraph after PRE and places its caret.

Within an owned PRE, Enter/Shift+Enter insert LF, Tab inserts a literal tab and
Ctrl/Meta+Enter exits. Backspace/Delete at the outer source edges are no-ops;
ordinary interior native typing/deletion retains native IME/history behavior.
Clipboard paste is plain literal text only; files/HTML are never interpreted.
Selections spanning PRE and other owners are not claimed. Native structural
beforeinput is intercepted only when cancelable and wholly owned. Composition is
left to the existing core composition lifecycle, never rewritten mid-composition.

## Optional UI and highlighting

`createCodeBlockForm(host, editor, options?)` supplies a native modal with language,
multiline source, Apply, Remove, Copy and Close; no modal UI is imported by behavior.
Open captures exact revision-bound insertion selection or one actual edit target.
Apply suspends modal inertness, restores current intent and revalidates focus-time
callbacks. Source uses textarea.value/textContent, not HTML. Copy uses explicit
`navigator.clipboard.writeText` and reports failure without document edits.

`createCodeBlockView(host, editor, { highlight? })` renders external PRE/CODE views.
Optional app-owned async `highlight({source,language,signal})` returns bounded
UTF-16 token ranges with a fixed token-kind enum. Literal source is reconstructed
with native text nodes and allowlisted span classes. Invalid, overlapping,
out-of-order, excessive or stale results fall back to literal text; errors never
insert HTML or mutate the document. Each request owns an AbortController; refresh,
source removal/change and destroy abort old requests and ignore late promises.
No grammar is bundled or automatically fetched. The trusted application chooses
its provider and loading policy. CSS/UI are explicit, scoped `--mw-*` variables.

## Acceptance

Representative three-browser checks cover whitespace/literal unsafe code and
schema roundtrip, splitting/caret/history, language validation, edit/remove/exit,
keyboard LF/Tab/boundary refusal, literal paste, read-only/composition, stale and
focus-time replacement, modal cancellation and copying failure, provider races,
invalid tokens, isolation and destruction. RU/EN demo uses only a local toy token
provider explicitly labelled as an integration example, not a bundled grammar.
Full suites and physical-device checks are not implied.

Confirmed core composition cancellation through external replacement/read-only
resets plugin/UI composition flags even when the browser emits no compositionend.
Form/view ownership is revalidated before actions and async completion; moving a
host into the editor or detaching it disposes owned UI and aborts requests rather
than writing transient controls/highlight spans into document content.

The optional UI stylesheet uses native CSS nesting (Chrome 112+, Firefox 117+,
Safari 16.5+). Keep explicit leading nesting selectors for type-selector rules;
this UI-only requirement does not change the core behavior/browser contract.
