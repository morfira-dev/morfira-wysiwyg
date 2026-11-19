# Mentions and slash commands — phases 1/2

Status: **phase 1 implemented; phase 2 structural actions and bounded persistent references implemented locally; atomic phase 3 remains proposed**. Opt-in editable ID references follow [persistent-mentions.md](persistent-mentions.md); they do not implement atom behavior. This follows the Markdown shortcuts milestone. The first slice is an asynchronous suggestion picker that inserts ordinary text. Atomic identity-bearing mentions remain a later slice; structural slash actions follow the phase-2 contract below.

Original strict TypeScript/MIT, no new runtime dependencies. Core must not import these plugins or their UI. Reuse platform Selection/Range and the existing plugin lifecycle. Existing packages can expose new subpaths without adding packages. Each independently loadable entry, including its shared chunks, uses the user-directed optional-module 150000-byte gzip JS envelope; measure raw JS/Brotli and optional CSS separately.

## Current constraints verified in source

- `EditorDocument.version` is 1. `DocumentNode` currently contains only text and allowlisted semantic elements. Generic span `data-*`, class and contenteditable attributes are not persisted by the schema validator. A plugin cannot create a durable mention by attaching an arbitrary data attribute or keeping an ID only in a WeakMap.
- History captures validated HTML and SelectionBookmark; HTML and JSON import/export must preserve any future semantic node identically. Plain text already participates in history, selection, search, statistics and adapters.
- `editor.transact` exposes a DOM mutation callback. Synchronous nested commands join the outer atomic transaction under the phase-2 contract below; asynchronous actions remain rejected.
- Core owns native input/list/keyboard/history handling. Capture handlers must respect defaultPrevented and suppress propagation only for an action they actually handle. No `document.execCommand`.

## Phases and recommended first slice

| Phase | Deliverable | Persisted behavior |
| --- | --- | --- |
| 1 | Headless controllers, asynchronous app-owned providers, optional plain-text menu; `@` inserts a display label and `/` inserts a single-line snippet | Existing text nodes, schema v1 unchanged; no identity or atomic token semantics |
| 2 | Structural slash actions such as heading/list/table/image commands | Existing schema where possible; first define an atomic command-composition contract or safe declarative executor |
| 3 | Identity-bearing atomic mentions | Explicit document-model extension/migration, deletion/selection/clipboard rules, cross-plugin changes and adapter/browser evidence |

Phase 1 is small enough to implement and review independently. A default-mode selected mention is **editable text**, for example `@Anna Smith `; the provider's ID is used to choose a result but is not stored. A selected slash snippet replaces `/query` with literal text. No HTML, links, Markdown parsing, notifications or storage transport are implicit. A snippet beginning `# ` stays literal because programmatic insertion is not a Markdown typing trigger.

## Accepted phase-1 API

Public entries are `@morfira-dev/wysiwyg/plugins/mentions` and `/plugins/slash`. They can share a private suggestion engine/chunk. Their controllers and any optional view are independent of framework adapters.

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
  onDispose(listener: () => void): () => void;
  open(): boolean;
  close(): void;
  move(direction: -1 | 1): void;
  choose(id: string): boolean;
}
```

Factories/getters: `mentions(options)` / `mentionCommands(editor)` and `slash(options)` / `slashCommands(editor)`. `open()` rescans the real caret and only opens an eligible trigger; it cannot create an arbitrary synthetic insertion target. Moving the active menu option does not move editor selection. `choose` validates a still-current ID/session before mutation; stale or unavailable choices return false. Invalid argument types throw before mutation. State is a deep independent snapshot with no DOM nodes, Ranges, AbortControllers or application object references. subscribe is not immediate; returned unsubscribe is idempotent. Disposed controller methods throw, while previously returned unsubscribers remain safe.

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

Legacy IME confirmation keys with `KeyboardEvent.keyCode === 229` also suspend picker keyboard handling, even when the browser reports `isComposing: false` and no local composition session was observed. Close the picker without preventing that key or choosing an item; an Enter confirming an IME candidate must never execute a slash action or insert a mention. Explicit reopening or the next eligible ordinary native edit can resume lookup. Synthetic event tests exercise this guard and composition cancellation/resume in Chromium, Firefox and WebKit; they do not certify a system IME.

Implementation must account for event order: core emits its user change during input before later plugin input listeners, and selection notifications can arrive afterward. Track eligible native input in capture phase, drain known mutation records after processing, and suppress invalidation during the plugin's own transaction. A delayed selectionchange at the same expected caret is not a reason to close; a real move is. This flow needs a browser regression rather than timing assumptions.

## Menu keyboard, focus, positioning and appearance

Headless controllers work without a menu. Optional view export from `/plugins/suggestions`: `createSuggestionMenu(editor, controller, options?) => dispose`; it builds labels/descriptions with textContent, never innerHTML or provider-supplied DOM. The host is a sibling of the editing surface under editor.element, so it inherits instance CSS variables and is excluded from persisted content. Validate controller ownership against that editor using a private engine helper. Use host-relative absolute placement from viewport anchor coordinates, clamp/flip within viewport. Transformed/clipping ancestor containers and arbitrary portals are outside phase-1 support.

The editor keeps focus while browsing options. Pointerdown in an enabled menu item prevents focus transfer; choose then runs against the saved, revalidated token. A custom view must preserve that contract. Clicking outside closes without stealing focus back. On an open ready menu, unmodified ArrowUp/ArrowDown wrap active options; Enter accepts only a valid current option. Capture, preventDefault and stopImmediatePropagation only for a handled menu key, so list Enter or another core shortcut cannot also run. Escape closes without changing text. Tab dismisses and falls through to existing editor/browser Tab behavior (including list indentation and table navigation), never traps or implicitly accepts. Left/Right/Home/End/Page keys dismiss and retain native caret behavior. No results/loading/error Enter falls through to normal editor editing and closes; modified shortcut keys remain owned by the editor/application.

Position from the collapsed caret Range; if it has no usable rect, use the last rect of the nonempty trigger/query Range rather than inserting a measurement span. Reposition on relevant scroll/resize without rerunning providers. Bound the menu within the supported viewport/host and flip above when space below is insufficient. Every scroll/resize listener, observer and capture is disposed. Scrolling a menu must not move the document caret.

Scoped proposed tokens: `--mw-suggestion-bg`, `--mw-suggestion-text`, `--mw-suggestion-muted`, `--mw-suggestion-border`, `--mw-suggestion-active-bg`, `--mw-suggestion-radius`, `--mw-suggestion-shadow`, `--mw-suggestion-max-height`, `--mw-suggestion-z-index`, with sensible fallbacks to existing --mw-* variables. No documentation CSS may style the embedded controller/view accidentally.

## Accessibility evidence boundary

The intended popup is a listbox with generated per-instance option IDs, active-option state and a polite status for loading/results/errors. Verified against W3C ARIA1.2 textbox/aria-autocomplete/aria-activedescendant: textbox supports these autocomplete relationships but not aria-expanded. The view owns stable aria-autocomplete=list, aria-haspopup=listbox and aria-controls for its persistent (possibly hidden) listbox during its lifetime; active descendant is set only for an open ready active option. Multiple views share ownership and restore prior static attributes when the last view is removed. Sources: https://www.w3.org/TR/wai-aria-1.2/#textbox and https://www.w3.org/TR/wai-aria-1.2/#aria-autocomplete . Do not put provider IDs directly into DOM IDs/selectors. Keep editor's existing textbox role and restore only ARIA attributes owned by this view when closing/destroying. Before implementation, verify the applicable textbox/combobox/listbox relationship and compatible aria-controls/aria-activedescendant/autocomplete attributes against primary ARIA guidance; changing the core role to combobox casually is not an acceptable shortcut.

Keyboard/browser tests and DOM/AX assertions are necessary but do not establish complete accessibility. Record actual screen-reader, zoom, touch and IME combinations tested. No certification/conformance claim in docs without evidence. Labels/status messages must have RU/EN defaults and application overrides.

## Persistent mentions: model decision before phase 3

Phase-1 text cannot retain IDs or enforce atomic deletion. Two explicit alternatives need product choice:

1. An additive schema-v1 span profile with narrowly allowlisted mention metadata. Older readers would flatten/strip identity silently, and current history/import routines would need a canonical recognition rule. This only works if lossy old-reader compatibility is a deliberate product policy.
2. Recommended for true identity-bearing atoms: schema v2 with a typed `MentionNode { type: 'mention'; id: string; label: string }`, deliberate v1-to-v2 migration and explicit rejection by old readers. HTML export/import has one validated reserved representation; generic unchecked data attributes remain disallowed.

Atomic mentions require whole-token deletion/selection semantics, HTML/plaintext clipboard policy, permission-aware application resolution, history/JSON/HTML roundtrip and adapter feedback tests. Stored IDs never authorize notifications or access. Existing search/replace/Markdown operations need an atomic-node boundary policy; statistics should count the visible label exactly once. Existing text-offset selection must define snapping/rejection for offsets inside an atom. contenteditable=false is rendering behavior of the typed node, not arbitrary accepted markup. This is a document-format change and requires migration documentation and an explicit breaking release under the repository's established release convention; this design is not authorization to publish.

Structural slash actions use the joined transaction contract and trusted synchronous action registry specified in phase 2 below. Removing `/heading` then invoking editor.format as separate independent transactions is not acceptable one-step undo. Providers never supply executable callbacks or unvalidated HTML; only trusted application/plugin code registers commands.

## Acceptance and implementation gates

Phase 1 requires Chromium, Firefox and WebKit cases for trigger/email/code boundaries, Unicode offsets and max bounds, native typing/deletion versus paste/external/history/IME, exact token/caret validation, literal unsafe-looking labels/snippets, one-step choice undo/redo, sibling and merged-cell retention, and live input after insertion. Test async debounce/latest-wins/abort, late rejection, callback exceptions, malformed/duplicate/oversized results, external replacement, read-only, same-value feedback, identical-HTML DOM rebuild, selection movement and disposal. Reuse one plugin object in two editors and prove independent menus/providers/state.

Exercise Vue v-model, React controlled value with StrictMode, and Svelte bind:value: same-value feedback preserves the caret/menu session; changed external values cancel; reactive read-only aborts; remount/unmount leaves no popup, listener, timer or unresolved owned request. Menu tests cover Arrow/Enter/Escape/Tab, ordinary list Enter, pointer focus, outside dismissal, scrolling/resize, narrow viewport and host clipping. Validate SSR-safe imports, archive/declaration/public subpaths, runtime graphs, independent entry budgets and CSS separately. Add detailed RU/EN docs and local demo with deferred providers, empty/error/loading states and explicit plain-text mention semantics. Run pnpm run check, docs:build and test:docs; report actual checks/evidence.

Atomic phase 3 remains future work. Editable persisted references and their old-reader policy follow persistent-mentions.md; atom selection/deletion and any model migration require a separate contract. Phase 2 uses the synchronous composition contract below; the verified textbox/listbox relationship remains unchanged.

## Concrete implementation decisions for this milestone

The accepted first slice is editable text mentions and literal slash snippets. Phase 1 includes no durable mention IDs, contenteditable=false atoms, structural callbacks, network transport or schema migration; phase 2 adds the separate action registry below. The six-package layout and schema v1 remain unchanged. Source ownership follows feature folders: suggestions/engine.ts and suggestions/types.ts; the optional view is suggestions/menu.ts with style.css. Public /plugins/mentions and /plugins/slash re-export relevant shared types; /plugins/suggestions exports shared types and the view.

Typed defaults are minQueryLength 1 for mentions / 0 for slash, maxItems20, debounceMs120; validate integer ranges minQueryLength0..100, maxItems1..100, debounce0..1000 before setup. Provider result bound1000 is validated BEFORE display truncation; duplicate IDs anywhere reject. All id/label/description/snippet fields reject C0/DEL controls, snippets single-line; discard unknown fields. getState creates independent item/options snapshots with fresh live geometry; no DOM references. Provider failure and malformed results are state errors, not exceptions thrown from native input/editor subscriptions. A stale choice must not mutate or generate history.

Detection also requires the caret at the end of its query token: a following query character rejects internal-token completion. Other eligible suffix content is retained literally. Ctrl/Cmd/Alt-modified keys close/fall through; do not steal core undo/format shortcuts. Eligible native beforeinput/input may open/update; all unclassified edits/API replacements, paste/cut/drop/history and no-op DOM reconstruction may conservatively CLOSE a session. Same-value controlled feedback with unchanged DOM must preserve/refetch nothing. IME composition cancels, and does not reopen on compositionend. Any input/mutation event guards must be reset reliably; pending MutationObserver records need draining before choose.

Controller.onDispose is a public lifecycle hook for optional views: registered callbacks run once on owner-editor teardown, and returned removal functions are idempotent. Dispose all internal resources even if a callback throws. A private getSuggestionEditor(controller) helper returns the live owner for the view; it is not re-exported publicly. This allows the optional menu to remove its DOM/subscription/scroll/resize/pointer listeners and restore only owned ARIA attributes automatically when the editor is destroyed. Multiple different controllers may have views on one editor; closed views must not erase ARIA currently owned by the other menu. Reject duplicate views for the same controller, foreign/disposed owners, and ensure cleanup is idempotent.

SuggestionMenuOptions: locale?: 'ru'|'en' (when omitted, inherit the editor locale), labels?: Partial<SuggestionMenuLabels>; SuggestionMenuLabels has string fields label/loading/empty/error/results, results text substitutes one {count}. This replaces the former unconditional English default. All labels use textContent. Explicit menu locale pins its language; explicit label fields override translated values. Inherited menus update their label/status on editor localechange without replacing rows, canceling requests, changing active option or touching document state. Editor translation overrides use namespaced suggestions keys; export the feature-owned `suggestionMessages` dictionary. UI and engine have no external runtime dependencies. CSS entry /plugins/suggestions.css is opt-in. Keyboard processing belongs to engine controllers, not the view; view provides pointer selection, listbox/status and positioning/owned ARIA. Verify supported textbox ARIA relationships against primary W3C guidance before implementing view. No full accessibility/IME/mobile certification claim.

Demo on RU/EN homepages/playgrounds: local asynchronous people/snippet providers with loading/empty/error paths, cancellation, native @ and / typing, keyboard/pointer choice, plain-text semantics notice, sample load and explicit open/close controls. Framework harnesses/tests exercise controlled feedback/StrictMode/read-only/external replacement/unmount. Update specs before any necessary contract deviation and run full check, docs build/tests, raw/gzip/Brotli/CSS measurement.


## Phase 2: structural slash actions and trusted command composition

Slash results accept exactly one of `text: string` (existing literal snippet) or `action: string` (registered command name). `SlashOptions.actions` is an optional own-property record of synchronous trusted `(editor: Editor) => void` callbacks. Names are 1–128 ASCII letters/digits/underscore/colon/dot/hyphen, beginning with a letter. Factories validate and copy the registry before setup; registrations do not change afterward. Providers supply only a name, never executable callbacks, HTML, or arbitrary command parameters. Unknown actions and ambiguous/missing payloads invalidate the entire response, including entries truncated by maxItems. Returned states contain primitive copies of only the chosen payload variant.

`createSlashActions()` returns a fresh registry with paragraph, heading1..heading6, bulletList, orderedList, blockquote and codeBlock. These use public core formatting commands and add no core dependency on plugins. Tables remain opt-in application/plugin registration, for example `{ table: (editor) => tableCommands(editor).insert(2, 3) }`; slash must not import the tables runtime. No document schema change is needed. The trigger grammar is unchanged: only the start of a plain paragraph, including inside a cell. Table insertion inside an existing table remains rejected by the table contract.

Selection removes only the live, validated slash token, retains suffix/marks, and executes its registered command inside the same outer transaction. An emptied paragraph receives a br placeholder and a caret before it before formatting, so the resulting empty block remains editable immediately and after undo/redo across browsers. Core's joined nested transaction contract makes token deletion and nested format/table/plugin transactions one change and one undo step, with rollback on any error (even an inner error swallowed by a callback). Async callbacks/thenable results are rejected; actions are trusted code and must not schedule delayed editor mutation. Callback arguments must not be retained as authorization to mutate later. A no-op callback still removes the accepted token in one operation. A paragraph action removes the token while leaving a paragraph. Errors propagate to programmatic choose callers after cleanup; the picker closes and no partial document/history is committed. Selection/read-only/session validity is rechecked before mutation. Action execution uses direct command calls, never an event-bus request/reply protocol.

Tests cover built-ins, retained suffix and marks, merged-cell geometry, optional table and custom plugin actions, one change/undo/redo with continued native input, invalid/unknown/missing/ambiguous provider payload, immutable registries, readonly/stale/async provider cancellation, throwing/no-op/async actions, and callback disposal. Both homepages expose structural examples and explain application-owned registries; modules remain optional and lightweight.
