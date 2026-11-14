# Checklists

Status: first optional checklist slice; validation results are recorded in verification-backlog.md.

## Document and editing contract

Checklists use real ordinary HTML UL/OL and LI. A task item has `data-checklist-checked="false"` or `"true"`; an unmarked LI remains ordinary. Task and ordinary items can share a container. The marker is non-owning schema metadata, not a semantic `data-mw-node` and not a native checkbox. No input/button or UI node is persisted.

Register `checklists()` before initial parsing. Registered metadata survives HTML/JSON, external replacements, paste and history. Without the plugin or equivalent schema, ordinary sanitization removes the metadata (including explicit JSON); no missing-plugin preservation guarantee exists for these non-owning attributes. Invalid registered values reject import atomically. Persisted schema version stays 1; older/default readers can drop metadata.

Commands accept a native collapsed selection or a range wholly within one ordinary HTML LI of an ordinary UL/OL, or one direct-root P/H1–H6. Selection endpoints inside owning semantic nodes, owning items/containers/blocks, foreign namespaces, ranges whose endpoints resolve to different items, and cross-block ranges are disabled. Both endpoints must resolve to the same nearest LI: a range inside an outer item may span its nested branches, but only that outer item is marked; descendant item metadata and content are untouched. Insert converts one root paragraph/heading through existing bullet-list formatting, marking the resulting LI unchecked; on an ordinary LI it adds unchecked metadata; on an existing task it preserves checked state. Set/toggle/remove require an existing task; remove clears metadata and leaves its list structure/content intact. No enabled operation changes unrelated item identity or content.

Both plain and wrapped LI Enter splits preserve the source item's state and reset an existing checked marker to false on the newly cloned LI, in the same core transaction. Ordinary LI is not marked automatically. Shift+Enter preserves the state. Indent/outdent move existing LI with its metadata. Joins/cross-item replacements keep the state of the surviving first LI; removed item state is removed with its item. Exit/unwrapping to P drops LI metadata. These operations inherit the existing bounded list editing profiles, not unlimited arbitrary-list transformation support.

## API and UI

The selective subpath exports `checklists(): EditorPlugin`, `checklistCommands(editor): ChecklistCommands`, `ChecklistCommands` and `ChecklistState`. Commands are `insert(): void`, `setChecked(checked: boolean): void`, `toggle(): void`, `remove(): void`, `getState(): ChecklistState`. State is `{ disabled: boolean; active: boolean; checked: boolean | undefined }`: disabled reflects insert command eligibility including read-only/composition; active/checked describe a supported selected task independently of read-only. Missing selection or unsupported selection disables all mutation. Retained handles throw after disposal. Mutation methods are no-op when disabled; an enabled setChecked validates its boolean argument.

Commands use typed per-editor registry transactions. Every actual change is one history entry/change notification; no-op commands add neither. Read-only blocks user commands but allows external replacement through setHTML/setJSON, following the existing core API-origin change contract. Controlled adapter feedback suppression is a separate adapter contract; core replacement is not promised to be silent. Native selection, content, unrelated nodes and task state participate in undo/redo. There is no observer that changes content after a transaction.

Optional scoped CSS draws a visual marker. Application/demo controls are ordinary accessible external buttons that preserve the editor selection. This slice has no gutter click, shortcut, native checkbox semantics, bulk commands, automatic preset inclusion, or core-toolbar integration. It does not claim complete checklist accessibility. Imports are SSR-safe and have zero runtime dependencies.

## Acceptance

Browser cases in Chromium, Firefox and WebKit cover create/convert/current task preservation, set/toggle/remove, invalid arguments, unsupported ranges, read-only/composition, HTML/JSON/history/external sync, plain and wrapped Enter reset with one history step, Shift+Enter, ordinary LI unaffected, cleanup/isolation and no-plugin metadata loss. Generic schema acceptance additionally covers invalid definitions, duplicates, unsafe attributes, bounded rules, safe split patches and owning semantic-node coexistence. Selective imports, declarations and package consumers must remain valid; minified/gzip/Brotli/CSS sizes are measured separately. The plugin is selected explicitly through editor `plugins`; preset defaults stay unchanged.

## Size boundary

The optional command-only plugin has an 8000-byte minified JS entry-closure guard and a 2000-byte minified CSS guard, enforced in `scripts/size.ts`. The first measured implementation is 2709 JS bytes and 436 CSS bytes. This tighter feature-specific guard reflects the deliberately small command/CSS scope; it does not alter the existing core, table, adapter or preset budgets. Generic schema infrastructure remains in core and is reported separately. Framework runtimes, maps and declarations are excluded; gzip and Brotli are reported alongside raw bytes.
