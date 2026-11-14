# React controlled acknowledgement timing

Status: regression contract; the public React API and document schema remain unchanged.

React controlled-value feedback must preserve native document content, caret and undo/redo history. An acknowledgement of a prior editor change must not overwrite a newer synchronous edit made by an application or plugin during that React commit. Synchronize controlled values during the browser layout phase, before the parent component's layout effects can issue subsequent editor commands. Imports and server rendering remain safe without browser globals.

External values remain authoritative: a genuinely different supplied document replaces the editor silently and clears its prior history, including while read-only. Read-only updates apply before subsequent parent layout effects can issue editing commands. Each mount owns one editor; StrictMode effect replay disposes the previous instance before creating its replacement, and unmount releases the editor and its subscriptions.

## Acceptance

1. In a StrictMode controlled parent, append `A` and synchronously append `B` from the parent's layout effect acknowledging `A`. The document ends in `AB`, the caret follows `B`, and two undo operations recover the intermediate `A` document and then the original document. Controlled acknowledgement emits no extra change or clears history.
2. Convert a slash token into an empty heading, type text, undo the text and conversion, redo the conversion and type `Again`. The heading contains `Again` in order and subsequent undo recovers the empty heading.
3. External replacement remains silent, accepts a value while read-only and clears previous undo history. Read-only blocks native input, and unmount disposes the editor.
4. Browser regressions run in Chromium, Firefox and WebKit. Installed production package consumers additionally exercise the empty-heading redo scenario; server import/render checks remain part of the package compatibility contract.

This change adds no asynchronous acknowledgement queue, timers, runtime dependencies or public state. Deliberately delayed application values are still external replacements; the adapter does not infer arbitrary application acknowledgement protocols.
