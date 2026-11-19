# Non-persisted search highlights

Status: accepted bounded implementation contract. Actual validation is recorded
in verification-backlog.md; no browser run is implied by this document.

## Independent API

Expose optional `@morfira-dev/wysiwyg/ui/search-highlights` and its explicit
`/ui/search-highlights.css`. `createSearchHighlights(editor, options?)` requires
the installed search plugin and returns a controller with getState(), refresh()
and idempotent destroy(). Options contain only onError?: (error:unknown)=>void.
State is a fresh `{ status:'ready'|'unsupported'|'conflict', count:number,
current:number }`; current is a search match index or -1. Count describes owned
registered ranges, not screenshot/paint confirmation. No host element is needed.
Malformed options fail before allocation. Import is SSR-safe; mounting uses DOM.

Search exposes observational `getSearchRanges(editor): SearchRangeSnapshot`,
returning fresh native Range clones and current index, using its actual current
index/leaves after draining pending mutations. Ranges confer no command authority
and can become stale after document edits. This query never focuses, selects,
scrolls, writes content or adds history; modifying returned ranges cannot corrupt
the private search index. Keep SearchCommands and getState shapes compatible.

## Native rendering and ownership

Use feature-detected CSS Custom Highlight API (Highlight and CSS.highlights)
instead of inserting marks, spans, attributes or styles in the editor document.
Native highlights paint ranges without changing DOM structure; geometry/scroll
repainting belongs to the browser, not a per-match overlay or polling loop.
See https://www.w3.org/TR/css-highlight-api-1/ for the platform model.

Reserve fixed names `morfira-search-results` and `morfira-search-current` per
Document. A private document registry shares each native Highlight among owned
controllers; updates/removal touch only the current controller's range objects.
Current results use higher priority. One controller per editor; multiple editors
remain independent. Never call CSS.highlights.clear(), overwrite foreign entries,
delete another editor's ranges or clear the full shared Highlight during update.
On preexisting name collision, or replacement of an owned registry entry, report
conflict without stealing the external object. Cleanup removes owned names only
when no controller/ranges remain and the registry still contains our exact object.

Without native API support return unsupported with zero count/current -1; keep
search/navigation/replace usable. There is no heavy overlay/DOM-wrapper fallback
or full browser-version compatibility claim. No runtime-generated stylesheets,
untrusted names, CSS interpolation, network requests or runtime dependencies.
Explicit stylesheet uses --mw-search-highlight-background/color and
--mw-search-current-background/color on scoped editor content. Default CSS needs
to be loaded by the application; ready status alone does not prove visible paint.

## Updates and lifecycle

Reflect every bounded match (search limit 10000), including cross-mark flows and
merged cells; reuse search boundaries and exclude semantic mention subtrees.
Empty/cleared/error state removes ranges. Read-only remains observable/paintable.
Clear immediately on API replacement/composition start; refresh after composition
ends and current index becomes safe. Native changes, formatting, undo/redo,
replacement and identical-HTML DOM rebuilds must not retain detached ranges.
Coalesce content refresh into one owned animation frame; avoid full range
reallocation on current-only navigation where the document/query is unchanged.
Explicit controller.refresh() drains pending mutation records and paints the
current indexed ranges synchronously; getState() only returns the last owned
snapshot and does not force focus, layout or document work.
No layout reads, cloned content or own scroll/resize observers are required.

Destroy releases observer/subscriptions/listeners/queued frames and only owned
ranges. Editor destruction cleans up even when the search plugin disposes first.
Setup failure rolls back ownership; callbacks/errors cannot stop required cleanup.
Destroy is idempotent; refresh/getState after destruction throw. No effect on
HTML/JSON/text, selection/direction/focus, history or user-change notifications.

## Acceptance and measurement

Representative browser tests cover all/current ranges, cross-inline and table
targets, query/options/replace/history/external rebuild refresh, empty/error,
readonly/IME, native unavailable, foreign registry collision, multiple editors,
disposal and stale frames. Check document/selection/history nonmutation and real
Range targets, rather than screenshots as the only proof. Add public type and
installed-consumer smoke source, RU/EN docs and homepage/playground controls.
Tests are authored but not run locally under the user's explicit pause; no CI
observation or push. Static build/type/docs/package/graph/size checks may run.

Measure entry/shared chunks raw/gzip/Brotli and CSS separately, plus a selected
standard-search-highlights-ready profile with shared chunks counted once. Guard
entry at 8000 gzip JS bytes and extra CSS at 1500 raw bytes; selected standard
profile retains 80000 gzip JS / 20000 raw CSS limits. Existing core and presets
must not import this optional UI; do not silently install it in defaults.
