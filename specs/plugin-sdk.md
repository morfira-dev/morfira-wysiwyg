# Plugin SDK and extensible schema

Status: base command/schema implementation contract. Optional implemented nodes/atoms/decorations and views follow `plugin-extensions.md` and `inline-node-views.md`; explicit mappings follow `plugin-position-mapping.md` and `structural-mapping.md`. References below to phase-1 exclusions delimit this base API, not the entire current SDK. Existing editor methods and schema-v1 documents remain supported. This is the first vertical slice of the revised roadmap, not a new immutable editing engine or full custom-node-view system.

## Follow-up selection contract

Revision-bound `editor.selection` handles follow [plugin-sdk-next.md](plugin-sdk-next.md).
This additive layer retains actual DOM points for an unchanged document and is
adopted by the link form. It does not implement position mapping, node views,
general atoms or decorations; the phase-1 schema and command contract below stays
compatible. Current executed evidence belongs in verification-backlog.md.

## Phase 1 scope

- Declarative per-instance schema contributions are available as `EditorPlugin.schema?: readonly SchemaContribution[]` and `EditorOptions.schema?: readonly SchemaContribution[]`. Compile all contributions before parsing initial HTML and before plugin setup. Definitions are copied/validated; duplicate names or conflicting definitions fail before mounting or setup. No global mutable schema exists.
- A semantic extension uses an existing safe `DocumentTag`, a unique namespaced name, `kind: 'block' | 'inline'`, and declarative validated `data-*` attributes. Persist identity through `data-mw-node="name"` in ordinary v1 element attributes. Phase 1 does not add arbitrary HTML tags, custom elements, foreign namespaces, executable attributes, arbitrary CSS, custom render callbacks or atomic inline selection. New block/inline semantics use existing block/inline HTML wrappers; native editing of children stays unchanged. Phase 1 validates identity and attributes, not arbitrary custom child/content models.
- Attribute rules are declarative: bounded text, enum values, bounded integers, and safe URL strings; required fields reject malformed registered nodes at HTML/JSON boundaries. Unknown/unregistered marker metadata is stripped on HTML import and rejected for explicit JSON import, while ordinary unsupported attributes retain existing sanitization. Registered markers must match their declared tag; known extensions cannot bypass built-in URL/style/security validation. Reserved marker names, event attributes, prototype keys and non-data extension attributes are rejected in definitions. Plain `sanitizeHTML` remains default-schema-only; expose an explicitly constructed schema codec separately without loading plugins.
- Instance schema applies to initial HTML, setHTML/setJSON, getHTML/getJSON, native input snapshots, transactions, paste/insertHTML, rollback and undo/redo. A later edit must not silently strip registered metadata. Missing owning-node plugins cannot silently restore semantic extension JSON; non-owning attribute contributions follow the explicitly documented downgrade behavior below. Editor creation errors leave the host untouched. Existing schema-v1 JSON with no extensions remains unchanged.

The frozen instance codec is exposed as readonly `editor.schema: DocumentSchema`; its public rendering methods validate untrusted runtime input before creating DOM. Optional built-in plugins use this codec for document payloads such as table clipboard ranges. Default `sanitizeHTML` remains independent.

## Typed commands

- Public `createEditorCommand<T>(name)` returns an immutable typed identity token (same display name does not imply identity), with runtime payload validation owned by the registered handler. Optional feature implementations stay outside core.
- `editor.commands.register(token, definition)` registers once per token per editor and returns idempotent unregister. Definition owns `validate(payload): T`, `execute(editor, payload): void`, and optional `isEnabled(editor)`, `isActive(editor)` / `isMixed(editor)`. Command definitions and callbacks are trusted application code; validators/state readers must be synchronous and side-effect-free. No asynchronous transaction isolation is promised.
- `editor.commands.execute(token, payload)` validates payload, checks enabled/read-only/composition, and invokes synchronous execution inside the existing composable transaction boundary. Invalid or throwing execution rolls back content/selection/history. Missing registration throws; disabled/read-only/composition return false without mutation. Nested commands compose to one undo/change; no-op accepted commands may return true without a history revision. Async/thenable execution is rejected using the existing transaction contract.
- `editor.commands.getState(token)` returns a fresh `{ enabled, active, mixed }` snapshot; enabled reflects read-only/composition guards. Tokens carry payload types through register and execute; state notifications reuse existing lifecycle/change/selection events instead of introducing an event/RPC bus. Destroy releases registrations and stale handles cannot remove later registrations. Calls after destruction throw except idempotent unregister.

## Acceptance and packaging

Chromium/Firefox/WebKit: callout block and inline reference metadata round-trip through initial HTML/JSON/external values/native input/commands/paste/undo/redo; two editors with different schemas; invalid definitions before mounting/setup; unsafe input and mismatched/unknown markers; all default sanitizer regressions; typed command payload validation, state, disabled/read-only/composition, nested rollback/history, unregister and destruction. Type tests demonstrate wrong payloads are rejected. SSR imports remain safe. An application-owned example uses the same public API, with RU/EN docs and a real live demo.

No new runtime dependency or package. Public exports are explicit through the existing core/facade. Validate real tarball consumers and selective imports; sanitizer-only imports must not retain command/editor/UI code. Keep minified/gzip/Brotli/CSS measurements separate, report full selected closure without shared-chunk double counting. Core 80 KB is a working target; the existing 200 KB guard remains a hard limit pending separately measured preset budgets. The separate implemented SDK modules cover bounded mapping, views/decorations and structural commands under their own specifications; none is implicitly installed by this base slice.

## Non-owning attribute contributions and split policy

Semantic SchemaNodeSpec additionally accepts content?:SchemaTextContentSpec, a
text rule with type:'text', minLength/maxLength/singleLine and no required field.
When configured, every normalized child must be a text node; validate aggregate
length before concatenation, then apply the copied bounded text rule at HTML and
JSON boundaries before rendering. Empty/long/rich content rejects according to
the declared bounds. Default semantic nodes and non-owning attribute definitions
are unchanged; non-owning definitions cannot declare content. This narrow rule
does not register generic atom navigation/node views or executable callbacks.
Atomic mentions use it under [atomic-mentions.md](atomic-mentions.md), with runtime
presentation owned by that optional plugin, not accepted contenteditable markup.

Text attribute rules additionally accept minLength?:number (default 0) and
singleLine?:boolean (default false). Minimum is an integer from 0 through the
configured maximum. True singleLine rejects C0/DEL controls and Unicode
line/paragraph separators in stored HTML/JSON values, without trimming or
normalizing opaque strings. Definition validation and copied rule closures retain
the existing compatibility/security boundaries. The persistent mention reference
profile uses these bounds under [persistent-mentions.md](persistent-mentions.md);
this does not add atom/node-view behavior or arbitrary validator callbacks.

`SchemaContribution = SchemaNodeSpec | SchemaAttributesSpec` preserves existing semantic definitions. An attribute contribution has `name`, `kind: 'attributes'`, a safe existing `tag`, required `attributes` rule record, and optional `split` record of attribute names to reset strings. It registers optional safe non-reserved lowercase data-* attributes directly on that tag, without injecting data-mw-node or claiming ownership of the element. Required attributes are forbidden; duplicate tag/attribute contributions and ambiguous collisions with semantic definitions reject compilation. Names share the existing unique namespaced contribution registry. Existing schema definition/rule bounds apply across the per-tag attribute closure.

Registered values use the existing text/enum/integer/URL validators at HTML/JSON boundaries. Attribute extensions cannot add executable attributes, tags, arbitrary styles or namespace changes. The codec preserves non-owning metadata alongside built-in attributes and owning semantic metadata where there is no collision. Default/missing-plugin readers strip non-owning metadata from both HTML and JSON, so applications must retain the corresponding plugin/schema to retain its semantics; this is not the fail-closed identity behavior of data-mw-node.

A split record may reference only its own declared attributes and each reset string must validate at compilation. This first slice permits split policy on LI only. `DocumentSchema.attributesForSplit(tag, attributes)` returns a fresh reset-only record, only for present registered attributes after validating their current values; it never inserts metadata into unmarked elements or copies unchecked keys. The two owned plain/wrapped LI Enter clone paths apply this patch within the existing input transaction. Default behavior preserves attributes; no observer, extra transaction or plugin callback mutation is involved. Other tags/operations have no implied split-policy hook.
