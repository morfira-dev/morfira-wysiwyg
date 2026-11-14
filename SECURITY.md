# Security policy

Morfira WYSIWYG validates HTML and schema-v1 JSON and reconstructs allowed document content. It is a browser editor, not a sandbox for third-party JavaScript or a replacement for server-side validation. Application plugins, upload callbacks and direct DOM access are trusted application code.

The maintained development line receives security corrections; this project does not currently promise an LTS support window for older releases. Use the latest compatible release and review document-format changes before upgrading.

## Reporting a vulnerability

Please report suspected vulnerabilities privately to the maintainers. If the repository offers **Security → Report a vulnerability**, use that channel. Otherwise use an established private maintainer contact before disclosing a working exploit publicly. No dedicated email address or response-time guarantee is currently advertised.

Include the affected package/version, browser/version, minimal non-sensitive input, expected and actual behavior, and reproduction steps. Explain whether the input crossed the HTML/JSON boundary or required trusted plugin/application code. Do not include credentials, production documents or personal information. A small local reproduction is preferable to a live attack against a deployed service.

## Integration responsibilities

Read the [English security guide](apps/docs/en/security.md) or [Russian guide](apps/docs/security.md) for server validation, contextual output escaping, media/network controls, uploads and CSP limitations. Current implementation contracts and regression requirements are recorded in [specs/security.md](specs/security.md); actual verification evidence is recorded separately in [specs/verification-backlog.md](specs/verification-backlog.md).

Security tests cover specific threats and limits. They do not constitute an independent security audit or a guarantee that arbitrary deployment policies, browser extensions or application plugins are safe.
