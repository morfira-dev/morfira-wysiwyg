# Integration scenarios and explicit feedback

Status: accepted application-owned preparation contract, 2026-11-25.

## Observable behavior

The bilingual integration page presents three selectable representative tasks:
article/CMS authoring, table-based knowledge content, and an application form.
Each has concise actions and observable expected results using existing public
ready UI, editor-field and content-view examples. An explicitly opened local
sandbox reuses the existing editor field. Selecting another task changes the
instructions, never silently replaces a user's draft. Closing the sandbox releases
its editor; reopening starts a new local example and is labeled accordingly.

These are local examples and suggested integration tasks, not evidence of real
customers, external deployments, feedback collected or Office-suite conformance.
Durable storage, authentication, upload endpoints and server concurrency remain
application-owned. No users are contacted and no deployment occurs.

## Explicit report generation

An application-owned pure TypeScript helper builds a bounded literal report from
an explicit scenario ID, its fixed feature list, package/application versions and
user-entered reproduction, expected and actual behavior. Package version comes
from the documentation's build-time manifest value, never a network request.
No editor document, HTML, JSON, files, entity IDs, backend URLs, tokens, console,
storage, clipboard contents or environment inventory are read automatically.

Browser information is absent by default. Only when the user checks the option
and explicitly generates a report may the example reduce the current browser's
user-agent to a coarse whitelisted family. The raw agent and other fingerprint
fields are never included. Report generation does not submit or send anything.

Fields are bounded before formatting: scenario is an exact known ID; package
version is semver; optional application version is a short version token;
reproduction is at most 4000 UTF-16 units and expected/actual at most 2000 each.
Normalize CRLF; reject control characters and common URL/email/credential-looking
input rather than silently changing a reproduction. This conservative convenience
check is not secret discovery, anonymization or a guarantee that user prose is safe.
Tell users to use synthetic content/placeholders and inspect every report.

Generated reports render through literal textarea content. Editing a source field
invalidates the preview and review checkbox. Copy requires a fresh generated report
and explicit review, and writes only that report through the native clipboard API.
Failure leaves the selectable report available for manual copying; no execCommand,
automatic GitHub issue, message, download, analytics or background network request.
Pending clipboard results cannot update a destroyed instance or a newer draft.

## Acceptance

Focused helper cases cover whitelisted scenario/features/version, bounds, common
private-input refusal, literal markup and opt-in coarse browser data. Bilingual
documentation cases cover task switching with draft preservation, explicit local
sandbox lifecycle, generation excluding an editor's secret sentinel, source-change
invalidation and recoverable clipboard failure/manual copy. Shared helpers import
without DOM or side effects. Root coordinates build/types and selected checks;
no full suite, publication, commit or push is implied.
