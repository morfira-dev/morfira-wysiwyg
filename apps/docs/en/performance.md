# Performance and history

The benchmark is explicit development tooling. It adds no editor code, dependencies or background processing and does not run with every normal test.

```sh
pnpm run build
pnpm run benchmark -- --browser=chromium,firefox,webkit
```

Defaults are one warmup and five samples per scenario. Select profiles/sizes while retaining at least five repetitions:

```sh
pnpm run benchmark -- --browser=chromium --profiles=core --sizes=100,1000 --repeats=5 --heap=false
```

Results go to `artifacts/performance-baseline.json`. Reports include source revision/dirty state, library/browser/Node versions, environment, document sizes, raw samples and median/p95/max. These are observations on a specific machine; the initial baseline has no noisy millisecond CI gate.

## Documents and correctness

Deterministic datasets contain 100, 1000 or 5000 main paragraphs with formatting and Unicode. Every 50 paragraphs add a heading, nested list and merged-cell table. A trailing empty paragraph supports further typing. Cell paragraphs and that empty paragraph are counted separately from the main paragraph count.

Before measurement, the runner validates HTML/JSON import, text, node/paragraph/table/cell counts and rowspan. Formatting edits a known target; undo/redo must restore content, and undo after native input must return the baseline. Correctness failures fail the benchmark regardless of speed.

Creation, HTML import/export, start/end selection, formatting, undo/redo and destroy have separate timings. The `core`, `search` and `statistics` profiles are separate: enabled-plugin costs must not be presented as core costs. Search uses a known phrase with a count below the match limit.

## Input timing definitions

| Metric | Meaning |
| --- | --- |
| `nativeDispatch` | Capture beforeinput to bubble input after core handlers: includes browser native editing and synchronous enabled-module work |
| `nativeFrameOpportunity` | Same start to the first requestAnimationFrame after input: a frame opportunity, not proof of painted pixels |
| `nativeAutomationWall` | Playwright keyboard.type wall time, including IPC and automation |

Command duration uses in-page performance.now. Selection setup is not hidden inside the formatting timer; layout-dependent innerText is not used to compare JSON text.

## History memory

The public API exposes no history-byte count. HTML/JSON representation size in UTF-8/UTF-16 **is not** JS heap. The benchmark never reaches into private stacks or presents string-size estimates as measured memory.

Chromium additionally observes CDP Performance.getMetrics after explicit GC: before 20 distinct transactions, after edits, after an external replacement clearing history, and after destroy. Limits 5 and 20 are exercised, with exact available Undo counts and valid Redo. Firefox/WebKit mark these heap metrics unsupported.

These are renderer observations, not precise editor-owned memory. A post-destroy difference proves neither a leak nor leak freedom. Synthetic documents do not replace real IME/mobile/touch, screen-reader or complex Word/Excel checks.

Core is the default profile; `--profiles=core,search,statistics` explicitly enables additional profiles. The runner uses built public artifacts without workspace source aliases. Each warmup/sample has a 120-second operational timeout (`--timeout=120000`), and completed cases are persisted incrementally. A timeout marks the report incomplete; it bounds the tool, not a CI speed threshold.

This profile inserts native `x` at the start of the document; other caret positions and adapter input need separate measurements. End-of-document selection is measured separately. Exact text, caret and formatting are checked after timing so a dropped operation cannot look fast.

## Local core baseline

Apple M1, macOS arm64, Node 22.22.2; one warmup and five samples, headless, 1280×720. This snapshot compares synchronous native input at the document start before/after reuse of validated HTML strings.

| Browser | Paragraphs | Before, median ms | After, median ms | After p95, ms |
| --- | ---: | ---: | ---: | ---: |
| chromium | 1000 | 21.9 | 10.8 | 11.1 |
| chromium | 5000 | 116.7 | 48.8 | 54.6 |
| firefox | 1000 | 50.0 | 14.0 | 74.0 |
| firefox | 5000 | 1530.0 | 84.0 | 94.0 |
| webkit | 1000 | 61.0 | 13.0 | 23.0 |
| webkit | 5000 | 192.0 | 70.0 | 109.0 |

Browsers: chromium 158.0.8127.18, firefox 159.0, webkit 27.2. Measured 14/11/2026, 00:27:58 Europe/Moscow.

The cache reuses only immutable validated HTML for an exact current innerHTML match. Changed input still passes the same validator; JSON, bookmarks and snapshot objects remain independent. DOM serialization remains a cost, so large documents still require further work. No 60-fps or arbitrary-document capacity claim follows from these figures.

Raw reports: artifacts/performance-before-html-cache.json, artifacts/performance-after-html-cache.json and artifacts/performance-comparison.json (local ignored files).

## Local inline formatting and statistics reuse

A subsequent measurement on the same machine uses the same one-warmup/five-sample protocol. The starting point already includes HTML snapshot reuse. Applying a boolean inline mark inside one eligible paragraph or heading now transforms that block while preserving unrelated DOM nodes. Cross-block selections and unsupported structures retain the full-document path. History snapshots and validation still contribute to command time.

| Browser | Paragraphs | Format before, median ms | Format after, median ms |
| --- | ---: | ---: | ---: |
| chromium | 1000 | 40.0 | 9.4 |
| chromium | 5000 | 198.9 | 45.6 |
| firefox | 1000 | 53.0 | 14.0 |
| firefox | 5000 | 328.0 | 91.0 |
| webkit | 1000 | 50.0 | 12.0 |
| webkit | 5000 | 246.0 | 62.0 |

Statistics retain counts only for unchanged semantic text runs in the current document. Reading current runs and selected text remains necessary; there is no historical document cache or background worker. With the statistics plugin enabled, end-of-document selection in the 1000-paragraph fixture measured:

| Browser | Before, median ms | After, median ms |
| --- | ---: | ---: |
| chromium | 14.5 | 3.2 |
| firefox | 16.0 | 2.0 |
| webkit | 10.0 | 2.0 |

These are separate core-formatting and statistics-profile observations, not interchangeable costs or guaranteed latency. Raw reports: `artifacts/performance-before-local-formatting.json`, `artifacts/performance-after-local-formatting.json`, `artifacts/performance-before-statistics-reuse.json` and `artifacts/performance-after-statistics-reuse.json` (local ignored files).
