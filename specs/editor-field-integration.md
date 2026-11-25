# Ready application editor field

Status: accepted application-example contract, 2026-11-25.

Use existing public adapters, ready presets/UI and save-state commands to show a
complete field; do not add another runtime package, editor engine or implicit
preset feature. The shared integration helper is application-owned TypeScript,
kept outside package runtime graphs.

## Observable behavior

The bilingual example has a visible label, help text, text-required error,
ready toolbar, editable/read-only switch, controlled-value feedback, explicit
Save/Retry and explicit restoration of the last saved document. Actual editing
surface uses aria-labelledby, aria-describedby and aria-invalid; help/error IDs
are instance-specific. Validation checks this sample's editorial requirement of
nonempty text; image-only content is intentionally insufficient. A failed Save
focuses the actual field and never commits a request.

Save uses the existing per-editor save-state plugin: one request at a time,
detached JSON snapshots, newer edits remain dirty, and API replacement/disposal
invalidates pending acknowledgement. The local service honors AbortSignal before
committing, supports one recoverable failure and never sends data or files to a
server. Restoring explicitly replaces value and clears history under the existing
external-value contract. It cannot later be overwritten by a canceled save.

Image upload is an explicitly simulated, cancelable progress callback returning a
local static asset; file content is neither read nor transmitted. Application-owned
production transport must enforce authentication, version checks, MIME/resource
limits and safe returned URLs. Read-only still permits saving already committed
content; it blocks editor/image mutations. Locale changes preserve drafts.

Each mount owns ready UI, aria bindings, save subscription and local-service
cleanup. No top-level DOM, network, global custom-element registration or timers
are allocated on import. Adapter ready callbacks connect UI/semantics; unmount
cleans application resources and lets the adapter destroy its editor.

## Acceptance

Focused RU/EN documentation cases cover empty validation/label-help wiring,
controlled editing and read-only, save failure/retry, editing while saving and
restoring during an in-flight request. A representative clipboard/image action
checks the local upload's insertion/cancellation and no network transport. Existing
adapter suites retain framework synchronization/lifecycle coverage; do not repeat
the full matrix in this demonstration. Type-check shared helpers and Vue example.

Public docs contain usage, customization and server-boundary guidance, without
internal test reports, budget history or roadmap content. Root integration adds
navigation/homepage links. No commit, push or full-suite execution is implied.
