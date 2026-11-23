# Application-owned extension recipes

Status: accepted implementation contract, 2026-11-23. Documentation/application
examples, not a new runtime package or implicit preset integration.

Provide reusable strict-TypeScript recipes for a bounded ID-bearing custom inline
atom, a same-origin upload provider, async mentions, optimistic-concurrency save,
and a lazy syntax-highlight provider. Each recipe uses public imports, owns its
request/lifecycle state and documents the server boundary. A local deterministic
laboratory exercises them without uploading user files or calling a remote API.

The production upload recipe uses XMLHttpRequest to expose real upload progress,
application-configured same-origin endpoint, AbortSignal cleanup and bounded safe
response parsing. Server authorization, MIME validation/storage limits and URL
policy remain server/application responsibilities. No token, fixed production
endpoint, arbitrary fetch URL, data-URL upload or automatic cross-origin request
is built into the recipe.

Mention recipes honor the suggestion request signal/limit and preserve bounded
opaque IDs. Save recipes pass a version precondition to an application-owned
transport; conflict refuses overwrite and remains an error until explicit remote
reload/reconciliation. Newer server versions are not silently adopted merely to
make retry overwrite a conflict. Lazy highlighting loads only on first explicit
use, caches successful module loading and rechecks signal after load. The tiny
example tokenizer is demonstrative, not a full language grammar.

Ship copyable adapter examples for Vue, React StrictMode, Svelte, Angular and Web
Component using the same recipe factory/public lifecycle contracts. Keep framework
runtimes out of the actual optional-editor bundle. Type-check/compile the changed
examples; runtime-check representative adapters and the public documentation
controls rather than duplicate the complete five-adapter editing matrix. SSR
imports must not allocate DOM, register custom elements or make network requests.

Focused tests cover actual provider request/abort/error/resource limits, async
mention cancellation, conflict/reload/retry behavior, custom atom ID/history and
lazy provider disposal/races. Keep RU/EN explanations and runnable examples equal.
No full local suites, publishing, push or physical-device tasks are implied.
