# Formulas

Formulas are separate from core and presets. The plugin stores literal source in a semantic atom; optional UI renders native MathML in an external container. It has no runtime dependencies, fonts or network requests. The browser owns MathML presentation.

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { formulas, formulaCommands, parseFormula } from '@morfira-dev/wysiwyg/plugins/formula';
import { createFormulaForm, createFormulaView } from '@morfira-dev/wysiwyg/ui/formula';
import '@morfira-dev/wysiwyg/ui/formula.css';

const editor = createEditor(editorHost, { plugins: [formulas()], locale: 'en' });
const commands = formulaCommands(editor);
const form = createFormulaForm(formHost, editor);
const views = createFormulaView(previewHost, editor);

editor.setSelection(0);
commands.insert(String.raw`x_1^2 + \frac{1}{\sqrt{y}}`);

// Call from an explicit user action, preserving the editor selection.
form.open();
// Edit a specific current DOM node:
const formula = editor.surface.querySelector<HTMLElement>('[data-mw-node="morfira:formula"]');
if (formula) form.open(formula);
```

`formHost` and `previewHost` must be outside the editor surface in the same document. `createFormulaView()` owns one view per actual node; removing nodes, replacing the document and destroying the editor cleans those views. Unrelated application nodes in the host remain. Both controllers expose `destroy()`; editor destruction also cleans their resources.

## Supported syntax

This is a small TeX-like language, not full LaTeX. It supports Latin/Greek identifiers, decimal numbers, ordinary operators `+ - = * / ( ) [ ] | : ; . ! < > %`, grouping `{...}`, subscripts `_`, superscripts `^`, `\frac{a}{b}`, and `\sqrt{x}`. A script argument is one token or a group: `x^12` treats the number `12` as one token.

Symbol commands: `\alpha`, `\beta`, `\gamma`, `\delta`, `\epsilon`, `\theta`, `\lambda`, `\mu`, `\pi`, `\rho`, `\sigma`, `\phi`, `\omega`; uppercase `\Gamma`, `\Delta`, `\Theta`, `\Lambda`, `\Pi`, `\Sigma`, `\Phi`, `\Omega`. Operators: `\times`, `\cdot`, `\pm`, `\le`, `\leq`, `\ge`, `\geq`, `\ne`, `\neq`, `\infty`, `\sum`, `\prod`, `\int`, `\partial`, `\nabla`, `\approx`, `\to`. Function names: `\sin`, `\cos`, `\tan`, `\log`, `\ln`, `\lim`. Escapes `\{`, `\}`, `\_`, `\%` produce literal symbols.

Unknown commands, macros, URLs, HTML commands, arrays, environments and arbitrary styles are unsupported. Unknown commands reject the whole operation rather than inserting a partial result. `parseFormula(source)` returns a frozen typed AST or throws. Limits: one nonempty line of up to 1024 UTF-16 code units, up to 512 tokens and 512 AST nodes, grouping/argument depth up to 24. Control characters and line separators are rejected.

## Document and API

Persisted HTML is an ordinary allowed span: `<span data-mw-node="morfira:formula">x^2</span>`. JSON uses the same versioned document schema. Runtime `contenteditable` and MathML are never persisted. `createFormulaSchema()` returns the declarative schema for independent document reading without atom behavior.

`formulaCommands(editor)` exposes `insert(source)`, `update(actualNode, source)`, and `remove(actualNode)`. These return `boolean`, validate current editor/node ownership, block read-only and composition edits, and participate in undo/redo. Invalid source throws before any document change. A foreign editor node or stale reference cannot authorize an edit.

`renderFormula(document, source, { display: 'inline' | 'block' })` creates a new MathML element, defaulting to `inline`. It uses a fixed MathML vocabulary, `createElementNS` and `textContent`. External views default to `block`. The module does not accept HTML/MathML source or load resources.

On HTML/JSON import the schema validates bounded literal source; unsupported syntax remains inert source and its view shows a localized error. This lets a document with newer syntax open safely without executing its contents. Creation/update commands reject that syntax.

The form exposes `open(target?)`, `close()`, `isOpen()`, `getSource()`, `setSource(source)`, `destroy()`, and `element`. Options are `label` and `onError`. Drafts may be invalid; preview and apply report the error. A captured selection expires on document changes; read-only, IME, external replacement and stale targets prevent applying the draft. The form never silently retargets a draft to a new position.

**First-version limitation:** rendered formulas live in an external container while the source atom remains in the editor document. This is not an inline formula editor or editable `contentDOM`. Native MathML follows [MathML Core](https://www.w3.org/TR/mathml-core/); accessibility and font presentation depend on the browser and OS. Full LaTeX compatibility is not claimed.
