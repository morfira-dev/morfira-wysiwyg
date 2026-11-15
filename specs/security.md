# Document security boundaries

Status: security hardening contract; actual validation status belongs to verification-backlog.md. This is a scoped defense contract, not a claim of complete security certification.

## Safe reconstruction

Both HTML and explicit JSON pass the versioned document codec. Rebuild allowed HTML tags/attributes; omit executable/control/raw-text elements and foreign namespaces (including SVG/MathML subtrees). Event attributes, id/name, arbitrary CSS, unsafe URL protocols and unchecked custom attribute names do not survive. Schema contributions use the same validated boundary. Public schema rendering validates runtime input before creating DOM. Application-owned plugin code and arbitrary JavaScript objects/proxies are trusted execution, not a JavaScript sandbox.

HTML parsing uses an inert template. String serialization (`sanitizeHTML`, schema.sanitizeHTML and schema.documentHTML) also constructs its intermediate DOM in an inert template owner document: it must not fetch image resources merely to return text. Explicit schema.renderDocument intentionally creates a validated insertable fragment in the active document; inserting/rendering allowed HTTP(S)/relative images can fetch their resources. This contract does not restrict image hosts or claim protection against all network-policy risks; applications may impose stricter URL rules.

A pre-hardening isolated localhost route-abort probe confirmed unwanted image fetches from sanitizeHTML/documentHTML in Chromium, Firefox and WebKit, with parseHTML alone producing none. Evidence: /tmp/morfira-codec-network-probe.ts and /tmp/morfira-codec-network-probe.log. This was a resource-fetch side effect, not a demonstrated XSS exploit; the permanent security-codec regression covers the repaired property.

## List property boundaries

List properties follow `list-properties.md`: marker styles accept only the fixed, per-kind UL/OL enum, without URLs/functions/custom counters or list-style-image. OL reversed is HTML presence but canonical JSON empty-string only; explicit wrong-tag or malformed JSON values reject before live mutation. Commands validate payloads before eligibility, verify one ordinary list/cell owner and mutate only container attributes through existing guarded history. No resource request or executable markup is introduced.

## Font style boundaries

Font-family support follows the bounded pure codec in `fonts.md`: at most eight names/256 characters, a strict simple-name/quote subset, and no escapes, functions, controls or declaration injection. Plugin configuration reuses that codec; command choices are a configured whitelist. Invalid API arguments cannot partially apply other formatting. Family/size are document styles, not permission to inject font-face resources or CSS rules. The plugin performs no font loading; applying an application-declared family can still cause the browser to fetch assets specified by the application's own CSS. Imported font-size keeps its existing safe-length grammar; the narrower command profile is not a silent import-policy change.

## Shared resource budget

Accepted HTML input and normalized document output have a maximum serialized HTML upper bound of 5,000,000 UTF-16 code units. JSON validation and normalized HTML parsing account for safe emitted tag/attribute syntax, retained attribute values and text before rendering or creating the output HTML string. Escaping is counted conservatively across engines: &, <, > and NBSP in text/attributes, plus double quotes in attribute values. Void tags have no closing-tag overhead; counting discarded void children conservatively remains permitted. Non-BMP characters count as two UTF-16 code units. This is a bounded estimate, not exact byte size or an exact browser serializer-length promise.

Keep existing limits of 100,000 visited document nodes, depth 100 and individual retained attribute values at 20,000 code units. Explicit JSON child arrays must be dense and cannot exceed the node bound before mapping; repeated references and cycles do not evade traversal/size budgets. Do not stringify arbitrary input or allocate an output-sized DOM/string before enforcing these bounds. Existing unknown-attribute filtering remains intact.

Oversized input or escaping-heavy normalization throws RangeError before visible editor changes, history updates or change notifications. A successful validated JSON document has a serialized-size bound compatible with the HTML input limit. This tightens prior behavior: attribute-heavy or escaping-heavy documents that previously passed the text-only budget may now reject. Ordinary documents and schema version 1 remain compatible. Runtime-generated cyclic/sparse JavaScript objects are robustness cases, not remote JSON execution exploits.

## Acceptance

Chromium, Firefox and WebKit: sanitizer/schema string serialization cause zero local route-aborted image requests; explicit insertable fragments retain valid image sources. Cover attribute aggregate overflow using a bounded 900 × 6,000-code-unit sample, escaping expansion, exact/small valid budget cases, UTF-16 accounting, node/depth and sparse-array defenses, and atomic setJSON/setHTML rejection with unchanged content/selection/history/notifications. Existing XSS/namespace/style/URL/security regressions remain required. No large/OOM allocations, external network or unsafe executable probe is needed.
