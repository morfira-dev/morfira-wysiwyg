# Editor contract — document schema v1

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

Composition event ordering, interim edits, command guards and cancellation follow `specs/composition.md`. Ordinary paragraph/heading Enter and boundary deletion follow `specs/block-boundaries.md`; unsupported structures and cross-block selections retain their existing input paths.

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

Lists, keyboard boundaries and toolbar extensions follow `specs/lists-toolbar.md`. Document schema v1 is unchanged.

Inline color and enhanced link commands follow `specs/colors-links.md`. Invalid link command arguments now throw before mutation, replacing the earlier silent rejection; safe HTML/JSON imports still sanitize through schema v1.

Image commands follow `specs/images.md`. Schema v1 adds figure/figcaption semantics; older readers may flatten those wrappers. Image commands remain an optional module.

Optional literal find/replace follows `specs/search.md`, with no schema change or core dependency on the search entry. Replacements retain document structure and participate in history; search/navigation do not.

Optional Markdown typing rules follow `specs/markdown-shortcuts.md`. Conversions are transactions over schema v1; shortcuts do not run during import/paste or composition.

History snapshots retain bounded pending caret formatting (boolean marks and inline colors) with their collapsed text offset. Undo/redo restores this transient affinity only when the restored caret still matches that offset, so subsequent text after a Markdown conversion remains outside the newly closed mark after redo. This metadata is history-only, never HTML/JSON schema data. External replacement and ordinary selection movement still clear pending formatting. Failed transactions restore pending formatting with their document/selection snapshot.

Phase-1 suggestions follow `specs/mentions-slash.md`: @label and slash snippets are ordinary editable text inserted in one transaction. Schema v1 has no mention IDs/atoms; structural slash commands now follow the separate phase-2 action registry contract and use composable transactions. Optional menu DOM stays outside persisted surface and cleans up with controller/editor disposal.

Typed instance events and synchronous command composition follow `specs/events.md` and `specs/transactions.md`. Core stays independent from plugins; source ownership and selective-import guarantees follow `specs/code-organization.md` and `specs/modularity.md`.
