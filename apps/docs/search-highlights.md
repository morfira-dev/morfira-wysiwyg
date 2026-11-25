# Highlighting every search result

The optional `createSearchHighlights` paints every current search match and distinguishes the current result. It uses the native [CSS Custom Highlight API](https://www.w3.org/TR/css-highlight-api-1/): ranges are registered for browser painting without inserting `span`, `mark`, attributes or service styles into the document.


## Setup

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { search, searchCommands, getSearchRanges } from '@morfira-dev/wysiwyg/plugins/search';
import { createSearchHighlights } from '@morfira-dev/wysiwyg/ui/search-highlights';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/ui/search-highlights.css';

const editor = createEditor(host, {
  value: '<p><strong>Mor</strong>fira and Morfira</p>',
  plugins: [search()],
});
const highlights = createSearchHighlights(editor, { onError: console.error });
const api = searchCommands(editor);
api.setQuery('Morfira');
highlights.refresh();
console.log(highlights.getState()); // { status, count, current }

const snapshot = getSearchRanges(editor); // independent ranges and current index

const dispose = () => {
  highlights.destroy();
  editor.destroy();
};
```

JavaScript does not import CSS automatically. Presets, ordinary `search()` and the search form do not install this module by default. Use it with the [ready form](/ui#find-and-replace) or an application panel; queries, options, navigation and replacement remain search commands. There are no new runtime dependencies. Import is safe without DOM; creating a controller requires a browser and an installed `search()` plugin.

## State and behavior

`SearchHighlightsController` exposes `getState()`, `refresh()` and idempotent `destroy()`. `getState()` returns a fresh snapshot:

| Field | Value |
| --- | --- |
| `status` | `ready`, `unsupported` or `conflict` |
| `count` | Number of registered ranges owned by this controller |
| `current` | Current search match index, starting at 0; `-1` when absent |

`ready` describes registration readiness, not verified visibility of every pixel. Without the stylesheet, colors may be absent. Query/document updates coalesce into one animation frame; explicit `refresh()` updates ranges synchronously. Current-only navigation need not recreate the complete set when the document/query is unchanged.

Highlighting does not alter HTML, JSON, text, focus, selection direction, Undo/Redo or document-change events. `api.setQuery()` also preserves selection; `api.select()`, `next()` and `previous()` retain their ordinary behavior of selecting the active result. The browser handles repainting on scroll; this module has no per-match overlays or geometry polling.

Results retain the existing 10,000-match search limit. Empty/cleared queries and overflow remove ranges. Read-only allows search and painting while replacement retains its existing guards. IME composition temporarily clears highlights and refreshes afterward. Replacement, input, formatting, Undo/Redo and rebuilding nodes with identical HTML must not retain stale ranges.

Boundaries follow [search](/search): matches can cross inline styles and links, and merged cells are preserved. Matches do not join across blocks/cells. Owning semantic subtrees, including [mention IDs](/persistent-mentions), are excluded from search and highlighting.

## Native support and ownership

The module detects `Highlight` and `CSS.highlights` in the editor document. Without them, `unsupported` has `count: 0`, `current: -1`; ordinary search, navigation and replacement remain usable. There is no DOM-wrapper or heavy fallback. Concrete browser versions and visible painting still require separate verification.

The module reserves `morfira-search-results` and `morfira-search-current` in each Document. Controllers for different editors share the native groups but change/remove only their own ranges. The current result has higher priority. Only one controller per editor is allowed. Do not occupy these names or modify the module's objects manually: a collision or replaced registry entry produces `conflict` without overwriting the external object. Other registry entries survive; the module never calls `CSS.highlights.clear()`.

`destroy()` cancels its pending frame, releases observer/listeners/subscriptions and removes only its owned ranges. The final owner releases only its own names. Editor destruction also cleans up highlights; `refresh()` and `getState()` throw after destruction.

## Styling

Set variables on the editor or an ancestor:

```css
.my-editor {
  --mw-search-highlight-background: #fff0a6;
  --mw-search-highlight-color: #352b00;
  --mw-search-current-background: #ffbd66;
  --mw-search-current-color: #2f1a00;
}
```

Styles are explicit and external, without runtime stylesheet injection. Queries, document text and URLs never become highlight names or CSS. Decorations do not enter persisted content, HTML/JSON clipboard or Markdown. No network request is added; this presentation module does not replace application content validation.

## Site example

On the [homepage](/#editor) or [laboratory](/playground), expand “Find and replace”. “Highlight all results” explicitly enables this demo module. “Load highlight sample” replaces the document; “Highlight every Morfira” applies a whole-word query without changing selection. Refresh the state snapshot explicitly, including in read-only mode. Clearing search removes ranges; disabling the checkbox disposes the controller without modifying the document.
