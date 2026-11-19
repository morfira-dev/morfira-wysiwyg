# Document security boundaries

Status: security hardening contract; actual validation status belongs to verification-backlog.md. This is a scoped defense contract, not a claim of complete security certification.

## Safe reconstruction

Both HTML and explicit JSON pass the versioned document codec. Rebuild allowed HTML tags/attributes; omit executable/control/raw-text elements and foreign namespaces (including SVG/MathML subtrees). Event attributes, id/name, arbitrary CSS, unsafe URL protocols and unchecked custom attribute names do not survive. Schema contributions use the same validated boundary. Public schema rendering validates runtime input before creating DOM. Application-owned plugin code and arbitrary JavaScript objects/proxies are trusted execution, not a JavaScript sandbox.

HTML parsing uses an inert template. String serialization (`sanitizeHTML`, schema.sanitizeHTML and schema.documentHTML) also constructs its intermediate DOM in an inert template owner document: it must not fetch image resources merely to return text. Explicit schema.renderDocument intentionally creates a validated insertable fragment in the active document; inserting/rendering allowed HTTP(S)/relative images can fetch their resources. This contract does not restrict image hosts or claim protection against all network-policy risks; applications may impose stricter URL rules.

A pre-hardening isolated localhost route-abort probe confirmed unwanted image fetches from sanitizeHTML/documentHTML in Chromium, Firefox and WebKit, with parseHTML alone producing none. Evidence: /tmp/morfira-codec-network-probe.ts and /tmp/morfira-codec-network-probe.log. This was a resource-fetch side effect, not a demonstrated XSS exploit; the permanent security-codec regression covers the repaired property.

## Search highlight boundaries

The optional [search highlights](search-highlights.md) view uses actual bounded
search ranges and a native document highlight registry, not persisted markup,
content clones, dynamic stylesheets or untrusted CSS names. Its fixed registry
keys and exact native object identities are owned; update/removal must preserve
other editors and foreign application entries. Unsupported API or lost ownership
cannot trigger a document-writing fallback. Range snapshots are observational and
may become stale; they confer no authority to execute commands. Cleanup releases
owned ranges/observers/frames without writing selection, history or document data.

## Atomic mention runtime boundaries

The explicit [atomic mention profile](atomic-mentions.md) derives an owned
contenteditable=false runtime annotation only from registered, validated mention
references. It never permits arbitrary contenteditable in imported/saved data.
Trusted schema text-content rules validate text-only children, aggregate bounds
before concatenation and single-line values at HTML/JSON boundaries before output
rendering. Read-only/IME/focus/replacement/disposal gates protect edits; partial
token boundaries expand or an unsupported edit refuses without mutation.
ID/label bounds and backend authorization requirements remain unchanged. Browser
navigation/deletion support is scoped separately from a general SDK atom model;
application-owned direct JavaScript updates are trusted, not sandboxed by it.

The [atomic clipboard slice](atomic-mention-clipboard.md) serializes supported
selected inline/supported sibling-block data through the receiving schema, never active resource clones.
Clipboard HTML retains bounded untrusted IDs; plain text contains visible labels
only and never reconstructs identity. Native cut writes both formats before source
deletion and revalidates the actual target after application callbacks. Failed
writes leave document/history unchanged; no OS clipboard rollback is promised.
Foreign owners, files, unsupported structural payloads and cross-flow targets keep
their separate ownership/refusal boundaries. Sibling-block transfers validate all
affected ordinary leaves and their actual common parent; unrelated containers,
unsupported list branches, cross-cell targets and protected semantic roots remain
barriers. The consecutive-item extension binds actual same-list LI/body nodes;
incoming recursive trailing-branch lists and fully selected source branches share
a bounded safe policy before serialization/rendering. Final unselected branches
move as opaque actual nodes without cloning their contents. Different-level
intervals bind their actual common list and endpoint ancestor paths; selected
tree projection excludes unselected content and refuses protected owners before
native writes/mutation. Deletion preserves surviving paths instead of flattening
them; only affected empty bodies are repaired inside the existing transaction.
Unrelated list-tree endpoints,
checklist items and unsupported mixed/structural bodies refuse before mutation.
No implicit clipboard permission,
network request, global format clearing or navigator.clipboard access is added.

## Persistent mention identities

The optional reference slice follows [persistent-mentions.md](persistent-mentions.md).
Only a registered span with required bounded opaque ID preserves identity; use
SDK text minLength/maxLength/singleLine rules at both normalized HTML and JSON
boundaries. IDs never become URLs, CSS selectors, DOM IDs, callbacks or automatic
network/notification requests. Provider labels are literal text and imported
references remain untrusted claims requiring backend resolution and authorization.
Display labels are editable and do not prove identity. No atom deletion/caret or
immutable-label guarantees are introduced. Search excludes semantic subtrees
without losing following text offsets; suggestions do not collect triggers from
inside/across them. Missing-schema JSON fails closed while HTML retains text
without identity; the Markdown codec rejects registered mention documents.

## Markdown codec boundaries

The independent [Markdown codec](markdown-codec.md) consumes and produces typed
document data without DOM or resource requests. Raw HTML is literal text, not an
HTML escape hatch. Validate document nodes and link/image URLs through the same
safe schema; unsafe destinations become label/alt text on import. Export escapes
literal Markdown/HTML syntax and uses safe code delimiters; unsupported merged
or nested tables and unregistered semantics fail explicitly. Source/output,
node, depth and parser-work bounds apply before uncontrolled construction or
delimiter rescans. Exported Markdown is intended for the documented syntax;
applications must still validate any separate Markdown renderer they use.

## Office HTML normalization

Office HTML preprocessing follows [office-paste.md](office-paste.md), inside the
same inert template and before safe reconstruction. Only explicit supported
markers authorize list reconstruction or neutral-wrapper removal. Source node
and depth bounds apply before this cleanup can remove labels/wrappers; the final
normalized document keeps the existing output budgets. No stylesheet evaluation,
Office XML interpretation, formula execution or remote conversion is introduced.
JSON remains unchanged. Synthetic fixtures are regression inputs, not evidence
of universal Office compatibility or a security certification.

## Text direction boundaries

Text direction follows `text-direction.md`: only native ltr/rtl values on the fixed block/container tag set survive import. Explicit JSON rejects wrong tags/types/noncanonical values atomically; HTML filters invalid values. No CSS direction, unicode-bidi, writing-mode, bdi/bdo or arbitrary attributes are enabled. Commands validate payloads before eligibility and respect semantic/structural/cell boundaries. Normal text and Unicode bidi characters are retained; this is not a visual-spoofing defense or a language detector.

## List property boundaries

List properties follow `list-properties.md`: marker styles accept only the fixed, per-kind UL/OL enum, without URLs/functions/custom counters or list-style-image. OL reversed is HTML presence but canonical JSON empty-string only; explicit wrong-tag or malformed JSON values reject before live mutation. Commands validate payloads before eligibility, verify one ordinary list/cell owner and mutate only container attributes through existing guarded history. No resource request or executable markup is introduced.

## Font style boundaries

Font-family support follows the bounded pure codec in `fonts.md`: at most eight names/256 characters, a strict simple-name/quote subset, and no escapes, functions, controls or declaration injection. Plugin configuration reuses that codec; command choices are a configured whitelist. Invalid API arguments cannot partially apply other formatting. Family/size are document styles, not permission to inject font-face resources or CSS rules. The plugin performs no font loading; applying an application-declared family can still cause the browser to fetch assets specified by the application's own CSS. Imported font-size keeps its existing safe-length grammar; the narrower command profile is not a silent import-policy change.

## Contextual link navigation

The optional caret/selected-link UI follows `contextual-links.md`: validate the actual href through the codec and resolve against the current baseURI before showing or activating native Open. Only http/https/mailto/tel survive; reject scheme-relative slash/backslash prefixes and unsafe resolved relative destinations. Outer whitespace normalization follows the codec. Native Open has explicit user activation, target=_blank and rel=noopener noreferrer, without fetch-based previews or cloning linked content. This is a safe-scheme boundary, not same-origin enforcement or destination trust.

Expanded contexts require selected text wholly inside one actual ordinary anchor.
Reject mixed/cross-link ranges and protected or foreign selected descendants.
Bind the draft to the actual anchor and saved range; focus-time changes cannot
retarget it, even within the same anchor. Optional link-form anchor scope edits
metadata or unwraps that entire validated anchor through existing commands in one
outer transaction, then restores the selected text interval and direction. Core
selection-scoped formatting and the default form scope remain unchanged.
Per-editor UI preferences only choose which contextual panel is eligible; they
confer no execution authority or validation bypass.

Dismissal/API replacement/destruction and hidden edit-preview state scrub the native href. Retained controls and queued callbacks cannot reuse a stale target. Focus restoration rechecks the same anchor/revision/read-only/composition; Enter submission validates the live context before reaching the existing form. Closing a changed form must tolerate synchronous blur/change reentrancy without removing the same DOM twice. These controls remain trusted application UI; backend validation, destination policies and CSP are application responsibilities.

## Shared resource budget

Accepted HTML input and normalized document output have a maximum serialized HTML upper bound of 5,000,000 UTF-16 code units. JSON validation and normalized HTML parsing account for safe emitted tag/attribute syntax, retained attribute values and text before rendering or creating the output HTML string. Escaping is counted conservatively across engines: &, <, > and NBSP in text/attributes, plus double quotes in attribute values. Void tags have no closing-tag overhead; counting discarded void children conservatively remains permitted. Non-BMP characters count as two UTF-16 code units. This is a bounded estimate, not exact byte size or an exact browser serializer-length promise.

Keep existing limits of 100,000 visited document nodes, depth 100 and individual retained attribute values at 20,000 code units. Explicit JSON child arrays must be dense and cannot exceed the node bound before mapping; repeated references and cycles do not evade traversal/size budgets. Do not stringify arbitrary input or allocate an output-sized DOM/string before enforcing these bounds. Existing unknown-attribute filtering remains intact.

The retained style bound is checked after normalization and image dimension
mirroring, not only on its source string. Repeated declarations or appended
validated width/height must not create an over-limit retained attribute. Cell
border shorthand stays atomic so a CSS-invalid color cannot partially import
width/style; its bounded grammar does not certify CSS color-name validity.

Oversized input or escaping-heavy normalization throws RangeError before visible editor changes, history updates or change notifications. A successful validated JSON document has a serialized-size bound compatible with the HTML input limit. This tightens prior behavior: attribute-heavy or escaping-heavy documents that previously passed the text-only budget may now reject. Ordinary documents and schema version 1 remain compatible. Runtime-generated cyclic/sparse JavaScript objects are robustness cases, not remote JSON execution exploits.

## Acceptance

Chromium, Firefox and WebKit: sanitizer/schema string serialization cause zero local route-aborted image requests; explicit insertable fragments retain valid image sources. Cover attribute aggregate overflow using a bounded 900 × 6,000-code-unit sample, escaping expansion, exact/small valid budget cases, UTF-16 accounting, node/depth and sparse-array defenses, and atomic setJSON/setHTML rejection with unchanged content/selection/history/notifications. Existing XSS/namespace/style/URL/security regressions remain required. No large/OOM allocations, external network or unsafe executable probe is needed.


## Image properties UI

The independently imported contextual-image UI follows contextual-images.md. Read only the actual selected IMG and ordinary simple-figure ownership; reject foreign/semantic/complex selections before commands. Summary and dimensions are text, without IMG clones or preview fetches. Edit-only form mode excludes and guards Insert/upload, binds commands to actual image identity, validates metadata through existing image commands, and rechecks replacement/read-only/composition/disposal after focus restoration. No transport callback starts from this UI; application-owned uploads are not canceled by its disposal. Explicit src updates can load the newly chosen validated image, as with existing image edits. Backend URL/file/storage authorization and CSP remain application responsibilities.


The independent contextual-table controls follow contextual-tables.md. Only private plugin selection or one supported native cell Range supplies authority; spoofed selection attributes and ambiguous cross-cell/multiple ranges cannot enable actions. Query complete bounded logical grids and refuse nested, foreign or protected semantic ownership. Bind actions to actual table/cell nodes, rectangle, intent/API revisions and saved native Range; revalidate after application focus callbacks, read-only/composition/replacement and disposal. External-host registration is per-editor and only preserves selection, without accepting document-wide hosts or suppressing outside events. Render native localized text buttons without content clones or image requests; mutations use existing validated atomic commands/history. This is an editor boundary, not backend trust or a security certification.


## Optional file input and table-size picker

The independent `image-input.md` module consumes file-bearing paste/drop before core/table clipboard handling. It admits exactly one supported nonempty raster MIME file, ignores accompanying HTML/text/URI rather than parsing fallback content, and rejects foreign/protected/semantic/cross-block ranges. Drop resolves a fresh browser point without a stale-caret fallback. Revalidate actual target nodes, offsets, document revision and editability after focus callbacks. Existing images owns configured size checks, safe result URLs, scoped cancellation and one-step history; application transport and backend byte validation/storage authorization remain required. Error callbacks cannot leak rejected promises. A valid drop may place its caret before a later upload configuration/size rejection; such failure must preserve content/history.

The independent `table-picker.md` widget renders bounded text/buttons, retains no document authority and imports no table commands. Its optional standard-panel integration restores and revalidates selection/read-only/composition/lifecycle before the existing atomic insertion. Close, replacement and disposal make retained callbacks inert. Neither new entry loads remote assets or changes the backend trust boundary.

## Optional table properties

The table-properties slice accepts a bounded explicit patch, never arbitrary CSS. Table width uses integer 40–4000px or 1–100%; placement writes only the canonical TABLE margin-left/right 0px/auto pair. Only TD/TH top/middle/bottom vertical alignment is added to the codec. Color values pass a bounded existing safe grammar and browser color parsing without content/image clones, URL functions or resource requests. HTML/JSON wrong-tag/value style declarations remain filtered. The plugin validates all fields before eligibility and snapshots actual table/cells/grid intent; the SDK focus boundary is revalidated before its atomic mutation. Protected/foreign/semantic/nested/malformed table regions are refused. The opt-in form guards actual focus-time target changes before restoring its saved Range and again before update, rejects stale/API-replaced contexts, and disposes external-host ownership. This does not broaden server trust, storage authorization or arbitrary application-code isolation.
