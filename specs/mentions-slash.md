# Mentions and slash commands — proposed design

Status: **design only; no runtime implementation, public export or demo is claimed**. This follows the Markdown shortcuts milestone. The first proposed slice is an asynchronous suggestion picker that inserts ordinary text. Persistent, atomic identity-bearing mentions and structural slash actions are later slices with separate contracts.

Original strict TypeScript/MIT, no new runtime dependencies. Core must not import these plugins or their UI. Reuse platform Selection/Range and the existing plugin lifecycle. The existing six-package layout can expose new subpaths without adding packages. Each independently loadable entry, including its shared chunks, uses the existing optional-module 150000-byte minified JS envelope; measure gzip/Brotli and optional CSS separately.

## Current constraints verified in source

- `EditorDocument.version` is 1. `DocumentNode` currently contains only text and allowlisted semantic elements. Generic span `data-*`, class and contenteditable attributes are not persisted by the schema validator. A plugin cannot create a durable mention by attaching an arbitrary data attribute or keeping an ID only in a WeakMap.
- History captures validated HTML and SelectionBookmark; HTML and JSON import/export must preserve any future semantic node identically. Plain text already participates in history, selection, search, statistics and adapters.
- `editor.transact` exposes a DOM mutation callback. Calling `editor.format` or `insertHTML` from inside it starts another transaction; nested command composition is not a documented atomic operation. Structural slash actions must not assume nested calls produce one history step.
- Core owns native input/list/keyboard/history handling. Capture handlers must respect defaultPrevented and suppress propagation only for an action they actually handle. No `document.execCommand`.

## Phases and recommended first slice

| Phase | Deliverable | Persisted behavior |
| --- | --- | --- |
| 1 | Headless controllers, asynchronous app-owned providers, optional plain-text menu; `@` inserts a display label and `/` inserts a single-line snippet | Existing text nodes, schema v1 unchanged; no identity or atomic token semantics |
| 2 | Structural slash actions such as heading/list/table/image commands | Existing schema where possible; first define an atomic command-composition contract or safe declarative executor |
| 3 | Identity-bearing atomic mentions | Explicit document-model extension/migration, deletion/selection/clipboard rules, cross-plugin changes and adapter/browser evidence |

Phase 1 is small enough to implement and review independently. A selected mention is **editable text**, for example `@Anna Smith `; the provider's ID is used to choose a result but is not stored. A selected slash snippet replaces `/query` with literal text. No HTML, links, Markdown parsing, notifications or storage transport are implicit. A snippet beginning `# ` stays literal because programmatic insertion is not a Markdown typing trigger.

## Proposed phase-1 API

Public entries are proposed as `@morfira-dev/wysiwyg/plugins/mentions` and `/plugins/slash`. They can share a private suggestion engine/chunk. Their controllers and any optional view are independent of framework adapters.

```ts
interface SuggestionQuery {
  query: string;
  signal: AbortSignal;
  limit: number;
}
interface MentionOption {
  id: string;
  label: string;
  description?: string;
}
interface SlashOption {
  id: string;
  label: string;
  description?: string;
  text: string;
}
type SuggestionProvider<T> =
  (request: SuggestionQuery) => readonly T[] | Promise<readonly T[]>;
interface SuggestionOptions<T> {
  provide: SuggestionProvider<T>;
  minQueryLength?: number;
  maxItems?: number;
  debounceMs?: number;
}
interface SuggestionAnchor { x: number; y: number; width: number; height: number; }
interface SuggestionState<T> {
  status: 'closed' | 'loading' | 'ready' | 'error';
  query: string;
  items: readonly T[];
  activeIndex: number;
  anchor?: SuggestionAnchor;
  error?: 'provider-error' | 'invalid-results';
}
interface SuggestionController<T> {
  getState(): SuggestionState<T>;
  subscribe(listener: (state: SuggestionState<T>) => void): () => void;
  open(): boolean;
  close(): void;
  move(direction: -1 | 1): void;
  choose(id: string): boolean;
}
```

Proposed factories/getters: `mentions(options)` / `mentionCommands(editor)` and `slash(options)` / `slashCommands(editor)`. `open()` rescans the real caret and only opens an eligible trigger; it cannot create an arbitrary synthetic insertion target. Moving the active menu option does not move editor selection. `choose` validates a still-current ID/session before mutation; stale or unavailable choices return false. Invalid argument types throw before mutation. State is a deep independent snapshot with no DOM nodes, Ranges, AbortControllers or application object references. subscribe is not immediate; returned unsubscribe is idempotent. Disposed controller methods throw, while previously returned unsubscribers remain safe.

Recommended bounds: query at most 100 UTF-16 units; IDs 1–256, labels 1–200, descriptions at most 500, snippets 1–20000. Labels/snippets are single-line literal text with control characters rejected; keep Unicode display labels, never interpret markup. Duplicate IDs reject a provider result. maxItems defaults to 20 and is bounded 1–100; at most 1000 returned objects may be inspected, otherwise reject. A bounded valid response is displayed in provider order, limited to maxItems; document that UI truncation explicitly. Default debounce is 120ms, configurable 0–1000 integer milliseconds. Mention minQueryLength defaults to 1; slash defaults to 0. No network or credentials are supplied by the editor.

## Trigger detection and text replacement

- Mentions recognize `@query` at the start of an eligible text flow, after whitespace or after an opening `(`, `[` or `{`. An @ inside a word/email/URL is literal. Initial query characters are Unicode letters/numbers/marks/connector punctuation and `-`; whitespace, another trigger or a block/atomic boundary closes the session. Labels may contain spaces even though this first query grammar does not.
- Slash recognizes `/query` at the exact start of a plain paragraph, including a paragraph inside a table cell. It does not initially open inside an existing list item, heading, quote, link, code/pre or image caption. This keeps structural command placement unambiguous for phase 2.
- Mention text flows may be in p/headings/list items/quotes. Both kinds exclude links, code/pre, figures/captions, br/img/hr and any selection crossing blocks/cells. A noncollapsed selection does not open a picker. Do not scan an entire large document for each key: bound detection to the local text flow/query limit and map Unicode offsets using actual text nodes.
- Choosing a result removes only the validated trigger/query range. One `editor.transact` inserts `@label ` for a mention or the snippet's literal text for slash. Preserve surrounding marks, links outside the range, blocks, merged-cell geometry and unrelated image content. The inserted text inherits the trigger start's inline formatting; caret ends after it. No invisible sentinel characters are persisted.
- The literal trigger/query remains in the document during lookup, loading, navigation, errors and dismissal. Escape/provider failure/read-only cancellation never removes user text. Only a successful choice changes content, as one user revision/undo step. Undo restores the original trigger/query and caret; undo/redo do not automatically reopen/refetch the menu.

## Async lifecycle and session validity

The application owns provider transport, auth, storage and result permissions. Provider inputs contain query/signal/limit only, never a live Range or editor surface. Synchronous arrays and exceptions follow the same lifecycle as promises.

Each instance owns an incrementing request token, AbortController, debounce timer, current query/Range bookmark and editor revision/session identity. New eligible typing/deletion aborts the previous request, clears stale items, enters loading and starts the latest provider after debounce. Loading or error state has no selectable old result. Close, read-only, external replacement, caret movement out of the validated token, composition start and disposal abort and clear timers. Late results and late rejections are handled and ignored when their request/session is obsolete; no unhandled rejection or late DOM mutation.

Native eligible insertText/deleteBackward/deleteForward may update an active query. Paste/drop, history operations and programmatic replacement close it. IME composition suspends lookup and choice; do not automatically reopen on compositionend, wait for the next eligible native edit or explicit open. Same-value controlled feedback that preserves the actual DOM/caret must not cancel/refetch. Changed external HTML/JSON cancels without a user event. A no-op formatting command can recreate identical HTML without a change event: revalidate text-node ownership and token contents before choosing, and use a per-instance observer or equivalent invalidation to avoid stale ranges.

Implementation must account for event order: core emits its user change during input before later plugin input listeners, and selection notifications can arrive afterward. Track eligible native input in capture phase, drain known mutation records after processing, and suppress invalidation during the plugin's own transaction. A delayed selectionchange at the same expected caret is not a reason to close; a real move is. This flow needs a browser regression rather than timing assumptions.

## Menu keyboard, focus, positioning and appearance

Headless controllers work without a menu. Proposed optional view export: `createSuggestionMenu(host, controller, options) => dispose`; it builds labels/descriptions with textContent, never innerHTML or provider-supplied DOM. Default host is a sibling of the editing surface under editor.element, so it inherits the instance's CSS variables and is excluded from persisted content. Validate ownerDocument for supplied hosts. Portals/custom clipping/transform contexts need explicit host-relative positioning tests; do not promise automatic behavior for every embedding container.

The editor keeps focus while browsing options. Pointerdown in an enabled menu item prevents focus transfer; choose then runs against the saved, revalidated token. A custom view must preserve that contract. Clicking outside closes without stealing focus back. On an open ready menu, unmodified ArrowUp/ArrowDown wrap active options; Enter accepts only a valid current option. Capture, preventDefault and stopImmediatePropagation only for a handled menu key, so list Enter or another core shortcut cannot also run. Escape closes without changing text. Tab dismisses and performs ordinary focus navigation, never traps or implicitly accepts. Left/Right/Home/End/Page keys dismiss and retain native caret behavior. No results/loading/error Enter falls through to normal editor editing and closes; modified shortcut keys remain owned by the editor/application.

Position from the collapsed caret Range; if it has no usable rect, use the last rect of the nonempty trigger/query Range rather than inserting a measurement span. Reposition on relevant scroll/resize without rerunning providers. Bound the menu within the supported viewport/host and flip above when space below is insufficient. Every scroll/resize listener, observer and capture is disposed. Scrolling a menu must not move the document caret.

Scoped proposed tokens: `--mw-suggestion-bg`, `--mw-suggestion-text`, `--mw-suggestion-muted`, `--mw-suggestion-border`, `--mw-suggestion-active-bg`, `--mw-suggestion-radius`, `--mw-suggestion-shadow`, `--mw-suggestion-max-height`, `--mw-suggestion-z-index`, with sensible fallbacks to existing --mw-* variables. No documentation CSS may style the embedded controller/view accidentally.

## Accessibility evidence boundary

The intended popup is a listbox with generated per-instance option IDs, active-option state and a polite status for loading/results/errors. Do not put provider IDs directly into DOM IDs/selectors. Keep editor's existing textbox role and restore only ARIA attributes owned by this view when closing/destroying. Before implementation, verify the applicable textbox/combobox/listbox relationship and compatible aria-controls/aria-activedescendant/autocomplete attributes against primary ARIA guidance; changing the core role to combobox casually is not an acceptable shortcut.

Keyboard/browser tests and DOM/AX assertions are necessary but do not establish complete accessibility. Record actual screen-reader, zoom, touch and IME combinations tested. No certification/conformance claim in docs without evidence. Labels/status messages must have RU/EN defaults and application overrides.

## Persistent mentions: model decision before phase 3

Phase-1 text cannot retain IDs or enforce atomic deletion. Two explicit alternatives need product choice:

1. An additive schema-v1 span profile with narrowly allowlisted mention metadata. Older readers would flatten/strip identity silently, and current history/import routines would need a canonical recognition rule. This only works if lossy old-reader compatibility is a deliberate product policy.
2. Recommended for true identity-bearing atoms: schema v2 with a typed `MentionNode { type: 'mention'; id: string; label: string }`, deliberate v1-to-v2 migration and explicit rejection by old readers. HTML export/import has one validated reserved representation; generic unchecked data attributes remain disallowed.

Atomic mentions require whole-token deletion/selection semantics, HTML/plaintext clipboard policy, permission-aware application resolution, history/JSON/HTML roundtrip and adapter feedback tests. Stored IDs never authorize notifications or access. Existing search/replace/Markdown operations need an atomic-node boundary policy; statistics should count the visible label exactly once. Existing text-offset selection must define snapping/rejection for offsets inside an atom. contenteditable=false is rendering behavior of the typed node, not arbitrary accepted markup. This is a document-format change and requires migration documentation and an explicit breaking release under the repository's established release convention; this design is not authorization to publish.

For structural slash actions, choose a typed operation-batch executor or extend the public transaction/command composition contract before implementation. Removing `/heading` then invoking editor.format as separate transactions is not acceptable one-step undo. Arbitrary application callbacks with unvalidated DOM/HTML are not proposed as the safe declarative action API.

## Acceptance and implementation gates

Phase 1 requires Chromium, Firefox and WebKit cases for trigger/email/code boundaries, Unicode offsets and max bounds, native typing/deletion versus paste/external/history/IME, exact token/caret validation, literal unsafe-looking labels/snippets, one-step choice undo/redo, sibling and merged-cell retention, and live input after insertion. Test async debounce/latest-wins/abort, late rejection, callback exceptions, malformed/duplicate/oversized results, external replacement, read-only, same-value feedback, identical-HTML DOM rebuild, selection movement and disposal. Reuse one plugin object in two editors and prove independent menus/providers/state.

Exercise Vue v-model, React controlled value with StrictMode, and Svelte bind:value: same-value feedback preserves the caret/menu session; changed external values cancel; reactive read-only aborts; remount/unmount leaves no popup, listener, timer or unresolved owned request. Menu tests cover Arrow/Enter/Escape/Tab, ordinary list Enter, pointer focus, outside dismissal, scrolling/resize, narrow viewport and host clipping. Validate SSR-safe imports, archive/declaration/public subpaths, runtime graphs, independent entry budgets and CSS separately. Add detailed RU/EN docs and local demo with deferred providers, empty/error/loading states and explicit plain-text mention semantics. Run pnpm run check, docs:build and test:docs; report actual checks/evidence.

Before coding phase 1, the parent can settle the proposed names, conservative trigger grammar, limits and plain-text semantics within already authorized scope. These are routine product/implementation choices, not a skill-mandated approval gate. Before claiming identity-bearing mentions or implementing phase 3, confirm whether the product actually needs persistent IDs/atomic editing and select the migration/old-reader policy. Structural slash action composition and the ARIA relationship also require concrete design validation before their respective code. None of the future phases is implemented by this document.
