# Editor contract — 0.2

Status: implemented preview contract. Acceptance scenarios are exercised in `tests/editor.spec.ts` and `tests/native.spec.ts`; verification limits remain explicit.

## Requirements

- Core/plugins are original TypeScript with no runtime dependencies. Functions use const arrow declarations. License: MIT.
- Public facade, framework imports, and plugin subpaths remain stable. The prototype's engine escape hatch and persisted operation format are intentionally replaced; no automatic document-format migration is promised.
- Persist `EditorDocument { version: 1, children: DocumentNode[] }`. Text and allowed semantic element nodes carry only validated attributes. HTML and JSON imports enforce schema, URLs, attribute/style allowlists, and resource limits. Unsupported executable or foreign content is omitted. Invalid JSON is rejected before live DOM mutation.
- Instance API: HTML/text/JSON get/set; text-offset selection; formatting; insertHTML; read-only; focus; own undo/redo; atomic plugin transactions; subscriptions and disposal. No external engine escape hatch or browser execCommand.
- Native typing and IME composition use the browser editing surface; our bounded history records semantic revisions with selection bookmarks. New edits clear redo; external document replacement clears history. IME is one history operation.
- Formatting must preserve unaffected text, support partial removal and cross-paragraph selections, and restore selection. Document operations must be atomic on failure.
- Paste replaces selection using validated HTML or plain text; unsupported drops are blocked. Read-only prevents user/programmatic user-edit commands while allowing external replacement.
- Every instance owns listeners and plugin APIs. Destroy is idempotent and performs all cleanup even when a disposer fails. Imports are safe to evaluate during SSR; createEditor requires browser DOM.
- Vue v-model, React controlled value including StrictMode, and Svelte bind:value share document/change semantics. External replacement emits no adapter feedback event. Same-value feedback preserves caret.

## Acceptance scenarios

1. Select part of a sentence, toggle bold on/off, undo/redo and recover exact text and selection. Existing neighboring formats remain intact.
2. Type text, undo a burst, redo; branch with a new edit and verify redo is empty. Replace external content and verify previous document cannot be undone.
3. Paste safe rich text over a selection. Script markup, event handlers, unsafe URLs, arbitrary CSS, SVG/MathML and malformed JSON cannot enter an executable DOM.
4. A throwing transaction leaves content/history unchanged; a throwing plugin setup leaves no mounted view or listeners.
5. Each adapter mounts, accepts external value, emits a user change, changes read-only, and unmounts without duplicate subscriptions or views.
6. Core can be imported in a Node process without DOM globals; runtime dependency maps for core/plugins remain empty.

## Verification limits

Browser tests establish their recorded scenarios, not full Word/Excel fidelity, complete browser editing normalization, accessibility conformance, collaborative editing, or mobile/IME certification. Report those separately.

Caret regression: disabling an inline mark in the middle of marked text keeps the insertion position, preserves the mark on both neighboring fragments, and retains other nested marks.
