# Reuse of validated HTML strings

Status: accepted implementation contract. This is a private per-editor performance detail; public APIs, persisted schema v1, event timing, selection and history semantics do not change.

Initial local Chromium profiling (five measured input samples per size) found median synchronous input dispatch of approximately 23.4 ms for 1000 authored paragraphs and 122.3 ms for 5000 paragraphs. These observations justify testing a small reuse of repeated sanitization, not claiming a universal capacity or latency improvement before a comparable rerun.

## Exact input ownership

Each editor owns one private HTML-string cache. Every read first serializes the **current** `surface.innerHTML` and compares that exact string with the previously sanitized input. Only an identical input may reuse its immutable sanitized output. A new input is sanitized through the unchanged document boundary; the cached input/output pair is updated only after successful sanitization. Exceptions must never make a rejected input a cache hit.

Both history capture and `getHTML()` use the private reader. Do not cache or reuse Snapshot objects, selection bookmarks, typing-affinity objects, JSON trees or application payloads. `getJSON()` continues parsing current HTML into an independent document tree. The exported `sanitizeHTML` remains unchanged and stateless.

Do not depend on event revisions, MutationObserver delivery, explicit invalidation flags or DOM node identity. Synchronous direct DOM edits, in-place attributes/URLs/styles, undo/redo, external replacement, native input and transaction rollback are detected by reading exact live HTML at the next boundary. Canonically equivalent inputs may still differ as raw strings and must be sanitized independently. The cache does not sanitize the live surface in place or authorize unsafe application DOM mutations.

Destroy clears both cached strings. The cache is bounded to one successful input/output pair per instance. Serialized strings remain an additional memory cost and still require DOM serialization/string comparison; no O(1) editing or heap-size claim is implied.

## Acceptance

Exercise Chromium, Firefox and WebKit with behavior-based assertions: repeated reads followed immediately by direct text/attribute/style/URL changes before observer delivery; safe output with executable/unsupported attributes removed; repeated oversized-input rejection followed by recovery; undo/redo and rollback after a callback read an intermediate state; independent JSON results and editor instances; and controlled Vue/React/Svelte feedback retaining selection and history. Do not assert private cache counters or implementation call counts.

Run full project/browser checks and the same performance profiles before/after the optimization. Report size and heap observations separately; a changed input still follows the full validation boundary.
