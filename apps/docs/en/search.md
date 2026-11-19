# Find and replace

The ready `createSearchForm` interface is imported separately from `@morfira-dev/wysiwyg/ui/search` and uses an installed `search()`. Query fields, navigation, case/whole-word and current/all replacement controls are included; the search plugin also works without UI. [Form example and lifecycle](/en/ui#find-and-replace).

This optional module performs literal text search without changing persisted HTML for highlighting or adding runtime dependencies. Native Selection/Range selects the active result.

In the ready form, Enter in the query finds the first match, while Shift+Enter moves to the previous match with wrapping. For a query that has not been applied yet, Shift+Enter selects its last match immediately. Try it in the homepage or playground search panel; it also works read-only and creates no Undo entry.

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { search, searchCommands } from '@morfira-dev/wysiwyg/plugins/search';

const editor = createEditor(host, { plugins: [search()] });
const api = searchCommands(editor);
api.setQuery('Morfira', { caseSensitive: false, wholeWord: true });
if (api.getState().matches.length) api.select(0);
api.next();
api.previous();
```

`setQuery` validates the query and updates results without moving focus/selection. `caseSensitive` and `wholeWord` default to false for each new query. The first result has index 0; current is -1 with no matches. `select(index)` focuses the editor and selects the result. Next/previous wrap around. Search/navigation create no undo history and work in read-only mode.

Search crosses inline styles and links: `Mor<strong>fira</strong>` matches Morfira. It never concatenates paragraphs, headings, items/nested lists, cells, captions, pre/blockquote blocks, br, images or hr. Image captions are searchable; alt/title/URL attributes are not. Merged table geometry stays intact.

## Replacement

```ts
const replaced = api.replaceCurrent('Morfira Studio'); // boolean
const count = api.replaceAll('Morfira Studio'); // replacement count
api.clear();
```

Commands operate on the current indexed match, so typing in a replacement form does not lose the target. Replacement text is literal: `<b>`, `$&` and other characters never become HTML or replacement templates. Replacement inherits the inline formatting/link at the match start; surrounding fragments remain intact. Empty inline wrappers may remain after text removal, with no visible content.

Replacing one result is one transaction. Replace all snapshots results and edits in reverse document order in ONE transaction; newly inserted matching text is not searched again in that invocation. Undo/redo restores the whole edit and selection. The caret ends after the inserted text, or after the first replacement for replaceAll. After replaceCurrent, the current match moves to the next result after the insertion, wrapping if necessary.

Read-only and active IME composition block replacement (false/0). No matches and identical replacements create no history. Invalid options reject before document mutation.

## State and updates

```ts
const state = api.getState();
// { query, options, matches: [{ index, length, text }], current, error? }
const unsubscribe = api.subscribe((next) => {
  // Update your panel's counter and controls.
});
unsubscribe();
```

State is an independent snapshot. index/length are UTF-16 textContent offsets, matching core selection rather than innerText with synthetic line separators. Input, formatting, undo/redo and external replacement recompute results without moving selection. Subscriptions do not run immediately; read initial state via getState. State and disposal belong to the editor instance; commands become unavailable after destroy.

## First-version boundaries

- Literal search only: no regular expressions or Ctrl/Cmd+F interception.
- Case matching uses standard JavaScript Unicode case folding, without locale-specific rules or Unicode normalization. Whole-word boundaries treat letters, numbers, combining marks and connector punctuation (including `_`) as word characters; emoji and ordinary punctuation are separators.
- Queries accept up to 1000 UTF-16 units, replacement up to 20000. CR/LF are rejected: creating/removing block breaks is outside text replacement.
- At most 10000 results. setQuery above the limit throws and retains previous state. If normal editing exceeds the limit, query is retained with `error: 'match-limit'` and empty matches; editing is not rolled back. Narrow the query or reduce the document. State recovers automatically under the limit. Replacement while overflowing rejects; no truncated partial replacement is performed.
- The active result is selected. Highlighting all matches simultaneously is not implemented in this version.

The [homepage](/en/#editor) and [playground](/en/playground) include a “Find and replace” sample and matching panel. The sample contains eight case-insensitive literal Morfira matches; Whole word excludes MorfiraPlus, leaving seven. Replacement fields and option flags remain drafts until an explicit action. Results update while the document changes, and navigation remains available in read-only mode.

DOM reconstruction by identical-HTML formatting also refreshes search ranges. The observer belongs to the instance and disconnects on destroy. Projected replacement text is checked before large strings are allocated, using the shared 5000000 UTF-16 document limit.

Semantic wrappers with `data-mw-node`, including [persistent mentions](/en/persistent-mentions), are excluded from search and replacement entirely. Matches cannot cross their boundaries; offsets for later ordinary text still include their visible length. This preserves identity metadata and keeps automatic replacement from rewriting mention labels.
