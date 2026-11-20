# Explicit email completion

Extend the existing optional autolink plugin with `AutolinkOptions.email?: boolean`
(default false), copied/validated before installation. No new core dependency,
format, networking, locale resource or UI module. Standard/extended defaults
remain URL-only; explicit application options enable email recognition. Existing
enabled preference controls both types; getState remains compatible.

With email enabled, recognize a bounded conservative ASCII address in the same
three existing completion routes: native single Space, controlled Enter and a
single whitespace-free text/plain clipboard token with empty HTML. Preserve the
literal displayed address and its case. Produce mailto:<literal address> through
existing safe link validation and a single atomic conversion. URL recognition
and punctuation behavior remain compatible. No HTML, multiline or API/import
auto-conversion and no selected-replacement support are added.

Address grammar: total length <=254, local part <=64, dot-separated nonempty atoms
of ASCII letters/digits plus underscore, plus and hyphen (no leading/trailing or
consecutive dots); domain has at least two nonempty labels of letters/digits or
interior hyphens, each <=63 characters, no edge hyphens, and final label is 2–63
ASCII letters. Local atom casing and domain casing stay unchanged. Punctuation
and surrounding delimiter handling reuse existing bounded token extraction but
must never partially recognize a malformed address (e.g. double @, dotted local
edges, unsupported local punctuation, control characters, query/header syntax,
percent escapes or truncated token beginnings). Reject CR/LF, whitespace,
non-ASCII/IDN, display names, quoted local parts, IP literals and mailto-prefixed
tokens. These conservative limits are not a complete RFC email validator, account
existence check, deliverability check or backend identity authorization.

All current ownership, semantic/code/anchor/figure barriers, readonly/composition
recovery, receipt.isCurrent, callback reentrancy, exact post-input caret and
two-step input/conversion Undo contracts apply unchanged. No email content is
sent anywhere. Add representative three-browser regression cases for all three
routes, URL compatibility, strict boundary failures/unsafe header payloads, rich
formatting/next typing/Undo, disabled/default behavior and instance cleanup.
Keep test cases risk-oriented, not a Cartesian duplication of the URL matrix.

Add bilingual guide/API updates and an explicit demo email opt-in with a typing
example. Explain its conservative grammar and mail application behavior on an
explicitly clicked stored mailto link. Focused local validations and actual gzip
measurements only; no full suites, CI observation, commit or push.
