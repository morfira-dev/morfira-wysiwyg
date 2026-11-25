# Application-owned entity, callout and template extensions

Status: accepted bounded recipe contract, 2026-11-25.

Three finished examples use existing `/sdk` nodeExtension/nodeCommands and existing
schema-v1 wrappers: an atomic inline entity reference (opaque bounded ID), a
text-only informational/warning blockquote, and an atomic inline template variable.
They are application code, outside package runtime graphs, not new built-in plugins.
IDs and labels do not authorize backend resources or trigger network requests.

One fresh bundle supplies the same declarative schema to editor and independent
`/content-view`. SDK commands insert/update/remove and participate in one Undo;
mutation still checks read-only, composition and actual owned target. Application
edit drafts bind an actual node plus canonical document snapshot and per-editor revision. An application-owned plugin invalidates revision on content change, compositionstart and readonly activation, with explicit listener/WeakMap cleanup. Any intervening
content change expires that draft, while selection alone is not mutation authority.
Reloaded/Undo-reconstructed nodes require a new inspection. Cleanup belongs to the
mounted example; no global registration, remote request or backend is introduced.

Save/reload uses detached validated JSON, preserving extension metadata. A reader
with the shared schema retains it; missing-schema JSON refuses. Unknown HTML
semantic markers follow the existing downgrade-to-safe-content policy. Runtime
atom presentation and callback DOM never enter stored documents.

Template expansion is an explicit application action on a validated detached copy,
not automatic editing or evaluation. Only declared keys customer/order are allowed;
provided values must be own literal strings, at most 2000 UTF-16 units each, with
no NUL/control bytes. Unknown provided keys reject. Missing values retain their
source token and report unresolved keys. At most 100 variables / 20000 replacement
UTF-16 units are expanded per call; normalized result is validated before return.
Resolved variables become literal text nodes, even for HTML-like input. No eval,
raw HTML interpolation, DOM assignment, URL substitution or backend authorization.
The editable source and history remain unchanged by publication expansion.

Focused acceptance covers all three insert/update/remove/Undo operations,
metadata save/load and independent display, literal expansion/missing/invalid keys,
resource bounds, unknown schema refusal, stale draft/read-only/composition and
instance cleanup. RU/EN live controls demonstrate inspect/edit/insert/remove,
save/load/publish and literal template values. Root coordinates focused browser,
documentation and type checks; no implicit full suite, commit or push.
