# Checklists

Status: first optional checklist slice; validation results are recorded in verification-backlog.md.

## Document and editing contract

Checklists use real ordinary HTML UL/OL and LI. A task item has `data-checklist-checked="false"` or `"true"`; an unmarked LI remains ordinary. Task and ordinary items can share a container. The marker is non-owning schema metadata, not a semantic `data-mw-node` and not a native checkbox. No input/button or UI node is persisted.

Register `checklists()` before initial parsing. Registered metadata survives HTML/JSON, external replacements, paste and history. Without the plugin or equivalent schema, ordinary sanitization removes the metadata (including explicit JSON); no missing-plugin preservation guarantee exists for these non-owning attributes. Invalid registered values reject import atomically. Persisted schema version stays 1; older/default readers can drop metadata.

Commands accept a native collapsed selection or a range wholly within one ordinary HTML LI of an ordinary UL/OL, or one direct-root P/H1–H6. Selection endpoints inside owning semantic nodes, owning items/containers/blocks, foreign namespaces, ranges whose endpoints resolve to different items, and cross-block ranges are disabled. Both endpoints must resolve to the same nearest LI: a range inside an outer item may span its nested branches, but only that outer item is marked; descendant item metadata and content are untouched. Insert converts one root paragraph/heading through existing bullet-list formatting, marking the resulting LI unchecked; on an ordinary LI it adds unchecked metadata; on an existing task it preserves checked state. Set/toggle/remove require an existing task; remove clears metadata and leaves its list structure/content intact. No enabled operation changes unrelated item identity or content.

Both plain and wrapped LI Enter splits preserve the source item's state and reset an existing checked marker to false on the newly cloned LI, in the same core transaction. Ordinary LI is not marked automatically. Shift+Enter preserves the state. Indent/outdent move existing LI with its metadata. Joins/cross-item replacements keep the state of the surviving first LI; removed item state is removed with its item. Exit/unwrapping to P drops LI metadata. These operations inherit the existing bounded list editing profiles, not unlimited arbitrary-list transformation support.

## API and UI

The selective subpath exports `checklists(options?: ChecklistOptions): EditorPlugin`, `checklistCommands(editor): ChecklistCommands`, `ChecklistOptions`, `ChecklistCommands` and `ChecklistState`. `ChecklistOptions.interactive?: boolean` defaults to true; false retains command-only behavior for application-owned interaction. Validate/copy the options object and reject unknown keys/nonboolean values. Existing commands are `insert(): void`, `setChecked(checked: boolean): void`, `toggle(): void`, `remove(): void`, `getState(): ChecklistState`. State is `{ disabled: boolean; active: boolean; checked: boolean | undefined }`: disabled reflects insert command eligibility including read-only/composition; active/checked describe a supported selected task independently of read-only. Missing selection or unsupported selection disables all mutation. Retained handles throw after disposal. Mutation methods are no-op when disabled; an enabled setChecked validates its boolean argument.

Commands use typed per-editor registry transactions. Every actual change is one history entry/change notification; no-op commands add neither. Read-only blocks user commands but allows external replacement through setHTML/setJSON, following the existing core API-origin change contract. Controlled adapter feedback suppression is a separate adapter contract; core replacement is not promised to be silent. Native selection, content, unrelated nodes and task state participate in undo/redo. There is no observer that changes content after a transaction.

Optional scoped CSS draws a visual marker. Application/demo controls remain native
external buttons preserving editor selection. Interactive mode adds direct marker
activation and a keyboard shortcut below, without native input/button children in
the editing surface. Native checkbox semantics, bulk commands, automatic preset
inclusion and core-toolbar integration remain outside this profile. Do not claim
complete accessibility or a universally supported assistive-technology interaction.
Imports are SSR-safe and have zero runtime dependencies.

## Direct pointer and keyboard interaction

With interactive:true, primary unmodified mouse/pointer activation on the actual
CSS marker toggles exactly that eligible marked LI. Clicks in text, list padding,
nested child bodies or other owners do not toggle a parent accidentally. Compute
the hit box from the scoped ::before style and the actual item box, including RTL,
current font/size/gap and scroll. Give the pseudo-element an explicit bounded box;
respect --mw-checklist-* customization. Without an actual visible marker style,
refuse the pointer hit instead of guessing a fixed gutter. Pointer activation
must not collapse an existing editor text range or change direction. No persisted
UI node, arbitrary contenteditable or user-supplied geometry/data attribute grants
command authority. Root-level owned runtime annotation may enable pointer styling;
restore only owned state on cleanup.

Use a primary press/click sequence, preserving selection on the press and toggling
once on completed activation. Cancel/drag-away/mismatched targets, already handled,
modified or noncancelable events do not start an owned edit. Nested task targets
resolve to their own actual LI; plain LI markers are not task controls. Touch is
not a real-device certification and must not introduce a second synthetic toggle.

Ctrl+Enter or Meta+Enter (exactly one modifier, no Alt/Shift) toggles the current
eligible task at a caret or single-item range. Ignore key repeat, composing,
isComposing/legacy229, already-handled and noncancelable events. Only eligible
task events are canceled before the ordinary Enter handlers; ordinary paragraphs,
unmarked items and cross-item/protected selections retain their existing behavior.
Keyboard users can also activate the existing external native buttons by Enter/
Space. Marker glyphs themselves are not advertised as focusable native checkboxes.

Every actual toggle uses the existing per-editor validated transaction/history:
one metadata change, one user notification and one Undo/Redo step; labels, nested
items, images/mentions and unrelated actual nodes remain unchanged. Read-only,
composition and disposed instances block mutations. External replacement and
Undo/Redo immediately derive the correct marker state from stored metadata.
Capture the actual target, canonical checked state, concrete native range points/
direction where owned and intent/API/DOM revisions before focus. Revalidate after
focus callbacks, including identical-HTML node rebuild, readonly/IME changes and
selection changes; never toggle a replacement item. An outside selection confers
no text-edit authority: pointer intent is bound to its clicked actual task, while
the core owns focusing/restoring its editor selection. Cleanup releases all
listeners/observers/pending pointer state; plugin object reuse stays per-instance.

Add a compact representative browser suite for real marker click, keyboard
shortcut, backward-selection/history preservation, nested/RTL/wrapped/merged-cell
tasks, text/padding misses, drag/cancel/modified/repeated/noncancelable events,
readonly/IME, actual target/selection focus races, serialization and cleanup/reuse.
Keep existing distinct command/editing tests. Add RU/EN demo instructions and
public controls, authored tests and measured raw/gzip/Brotli/CSS. Local behavioral
tests/consumer execution and CI observation are paused by the user; builds/static
checks are permitted. Commit locally without pushing.

## Acceptance

Browser cases in Chromium, Firefox and WebKit cover create/convert/current task preservation, set/toggle/remove, invalid arguments, unsupported ranges, read-only/composition, HTML/JSON/history/external sync, plain and wrapped Enter reset with one history step, Shift+Enter, ordinary LI unaffected, cleanup/isolation and no-plugin metadata loss. Generic schema acceptance additionally covers invalid definitions, duplicates, unsafe attributes, bounded rules, safe split patches and owning semantic-node coexistence. Selective imports, declarations and package consumers must remain valid; minified/gzip/Brotli/CSS sizes are measured separately. The plugin is selected explicitly through editor `plugins`; preset defaults stay unchanged.

## Size boundary

The optional plugin retains its 8000-byte minified JS entry-closure guard and
2000-byte minified CSS guard, enforced in `scripts/size.ts`, including direct
interaction. The historical first command-only implementation was 2709 JS bytes
and 436 CSS bytes; current measured results belong to verification-backlog.md.
These feature-specific guards do not alter core, table, adapter or preset budgets.
Generic schema infrastructure remains in core and is reported separately.
Framework runtimes, maps and declarations are excluded; gzip and Brotli are
reported alongside raw bytes. Interactive:false is a runtime behavior opt-out,
not a promise that static imports erase all interaction implementation bytes.
