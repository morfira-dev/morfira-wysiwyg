# Image upload progress, errors and explicit retry

Additive callback API: exported `ImageUploadProgress { loaded: number; total?: number }`
and `ImageUploadContext { signal: AbortSignal; reportProgress(progress): void }`.
`ImageOptions.upload(file, context)` remains application-owned; existing signal-only
callbacks remain compatible. `ImageUploadOptions.onProgress?` observes only that
call's progress. No transport, runtime dependency, persisted status, object URL or
server credential is introduced. Custom UI can use this scoped callback directly.

Progress is application-reported bytes, not inferred network or server success.
Accept only nonnegative safe integer loaded, optional positive safe integer total
with loaded <= total. Reject malformed reports by ignoring them, never by failing
an upload. Loaded may not decrease within one attempt. Snapshot and freeze accepted
values; observer throws/rejections are isolated. Reports before/after ownership,
after abort/settlement, document replacement, readonly, composition or destroy
are ignored. 100% transfer is not insertion success. Missing reports are valid:
the form displays indeterminate progress until validated completion.

The reusable all-mode image form shows a labeled native progress element while
its own upload is pending, bounded 0–100 display when total is known, otherwise
indeterminate. Localized text accompanies progress and retains generic error text;
never render exception messages, file paths or remote HTML as user-facing markup.
Metadata and alignment controls remain guarded while uploading. Edit-only mode
does not expose upload/progress/retry. Existing ImageFormValues remains unchanged.
The contextual edit-only dependency closure must also exclude the upload UI
implementation. Use an internal shared form constructor and an upload factory
supplied only by the public full-form wrapper; preserve public exports/options.

On a rejected attempt retain only that form's failed File and original insertion
Range with its document revision for an explicit localized Retry button. A retry
starts a fresh upload/controller at that original range, not a newly moved caret;
revalidate MIME/size/result on every attempt. Failure makes no history; success
inserts once/one Undo. No automatic retries or transport-specific classification.
Any failure (including validation) may be retried explicitly; validation still
precedes every transport invocation. Never invoke another form's upload retry.

Clear retry authority and release File references on another chosen file,
cancel, any document change (including undo/API replacement), readonly activation,
composition start, destroy and success. Selection-only movement does not relocate
the retry. Focus-time revision, readonly/composition and connectivity checks must
precede restoring the saved range; reject replacement during focus. Abort/late
settlement must not resurrect retry or overwrite a newer attempt. All subscriptions,
listeners and retained callbacks have per-form/request cleanup. Cancellation
must abort only this form's owned upload, never an application or sibling request.
Core completion also focuses while it still owns the pending request and checks
revision/cancellation before restoring the saved range. A synchronous abort
listener starting a newer upload must not be overwritten by the cancelled start.

The local RU/EN demo reports simulated progress without sending files anywhere;
an explicit fail-next option demonstrates one recoverable error then retry.
Production apps own upload authorization, validation, storage, resource limits,
cleanup of server-side orphan files and CSP. Percentage is not an accessibility,
security or transport-completion certification.

Author browser regressions for determinate/indeterminate progress, malformed and
stale callbacks, observer failures, retries at original range/one Undo, invalid
result validation, cancellation/replacement/readonly/IME/disposal and two owners.
Add localized demo definitions. At the user's request do not execute local tests;
run only build/type/package/tree-shaking/site checks and report actual gzip sizes.
