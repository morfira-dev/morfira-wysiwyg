# Optional bounded formula plugin

Status: accepted implementation contract, 2026-11-23. Validation evidence is
recorded separately. Entries: `/plugins/formula` and `/ui/formula`. No runtime
dependency, font asset, network request or automatic preset inclusion.

## Persisted representation and commands

`formulas()` registers one inline schema-v1 semantic span `morfira:formula` whose
literal source is nonempty, single-line and bounded to 1024 UTF-16 code units.
`createFormulaSchema()` exposes the independent declarative definition.
`formulaCommands(editor)` returns insert(source), update(actualNode, source) and
remove(actualNode). Source grammar validates before command mutation. Commands
reuse guarded SDK nodes/atoms, actual identity, revision/intent checks, composition,
read-only and one-step history. Ordinary supported clipboard retains the source
and marker only when the receiving editor also registers the schema.

Imported registered spans receive the schema's resource/text validation. Unknown
formula syntax is retained only as inert source text; rendering reports a safe
error rather than interpreting markup or silently claiming full LaTeX support.
Command validation rejects invalid syntax before editing. Core still rejects
MathML/foreign namespace persisted input; no parser bypass is added.

## Bounded grammar and rendering

`parseFormula(source)` is synchronous, pure and DOM-free. Support identifiers,
numbers, ordinary operators/fences, grouped braces, superscript/subscript,
`\\frac{numerator}{denominator}`, `\\sqrt{radicand}` and an explicit small command
allowlist of Greek letters, mathematical operators and ordinary function names.
Fractions and roots require brace arguments containing at least one literal
symbol/number/identifier; nested empty groups do not make an argument nonempty. Duplicate scripts,
unbalanced groups, unknown commands and unsupported syntax reject. Source is at
most 1024 units; tokens/nodes at most 512 and recursive nesting at most 24.
No HTML, TeX macro expansion, URLs, CSS, imports, images or executable callbacks
are interpreted. This is not a general TeX engine or MathML import codec.

`renderFormula(document, source, { display? })` validates through that parser and
builds ONLY math/mrow/mi/mn/mo/mfrac/msqrt/msub/msup/msubsup using
createElementNS and textContent. Namespace is MathML; display is inline or block.
No innerHTML, DOMParser, source-controlled attribute names, arbitrary tags/styles
or resource loading. The root's fixed aria-label contains the bounded literal
source; display is an explicit enum. Browser system math fonts/layout determine rendering; no KaTeX, MathJax,
font download, speech/accessibility certification or universal equation support.
The allowlist follows MathML Core https://www.w3.org/TR/mathml-core/.

## Optional external view and form

`createFormulaView(host, editor, { display? })` owns external node views, one for
each actual semantic formula span. MathML stays OUTSIDE persisted editor content.
Valid sources render natively; malformed imported sources produce a safe literal
status. Change/remove/rebuild/unmount updates/disposes only owned nodes.

`createFormulaForm(host, editor, options?)` provides an owned native modal with a
localized source field, inert preview, Apply/Remove/Close and open(target?),
close(), isOpen(), destroy(). No target means insertion at captured exact editor
selection. An actual validated target means edit/remove; opening and editor focus
callbacks cannot redirect drafts after document replacement or selection change.
Invalid drafts remain correctable. Read-only/composition block user mutations;
external replacement closes/invalidate the session. Modal suspension around edits
removes inertness before existing focus guards. Escape/Close restores the still
connected origin. Every listener/handle/view/dialog has idempotent cleanup.

## Acceptance

Representative Chromium/Firefox/WebKit checks: parser AST and limits, unknown
commands/HTML-like input safety, exact MathML namespace/tag allowlist, no resources,
source HTML/JSON roundtrip, formula edit/remove/undo, read-only/composition,
focus-time replacement, stale/disposed forms and independent external view cleanup.
Add public types, SSR import/pure parser smoke, demo and RU/EN explanations. Measure
raw/gzip/Brotli; no core/preset eager import or CSS requirement for behavior.
