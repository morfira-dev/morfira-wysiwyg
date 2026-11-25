# Public documentation and maintainer information

Status: accepted documentation contract, 2026-11-25.

## Audience and ownership

Public RU/EN guides under `apps/docs` and both README files explain installation,
configuration, public APIs, optional imports, examples and user-visible behavior.
Keep their feature coverage and examples aligned with the actual public facade.
Describe concrete input constraints, security boundaries, ownership and cleanup
where applications need them. Removing internal reporting must not conceal an
unsupported API or invent interoperability, accessibility or security guarantees.
Undo/redo behavior is a user-facing contract and remains in relevant feature pages.

Repository architecture, bundle budgets and measurements, CI/test execution,
release operations, performance/history investigations, development roadmaps and
project-wide status/limitation reports belong in maintainer specifications and
agent instructions. They must not become public documentation pages or navigation
entries. Do not publish task transcripts, dated test counts, budget-change history,
owner-specific environment availability or internal work plans in feature guides.

## Maintainer sources

- Architecture and source ownership: `code-organization.md`, `editor.md` and the
  relevant SDK/adapter contracts.
- Size accounting and guards: `editor-presets.md`, `performance.md`, current
  `size-report.json` and the build scripts.
- Validation evidence: `verification-backlog.md`, `continuous-integration.md` and
  `package-consumers.md`.
- Release setup and operations: `releases.md` and the workflow implementation.
- Planning and unavailable environments: `roadmap.md`, `ui-accessibility.md` and
  `AGENTS.md`. Evidence limitations remain explicit internally.

The former public `architecture`, `testing`, `performance` and `roadmap` pages in
both languages are removed, including navigation, local-search source and incoming
links. The maintainer sources above remain authoritative; deleted public reports
are historical Git content, not a second current source of truth.

## Documentation changes

Check bilingual page parity, declared facade imports, current API descriptions,
sidebar labels/routes and internal links including anchors. Build the site using
`docs:build:site` when package artifacts already exist; a prose-only change does
not require rebuilding or testing editor runtime. Remove tests of deleted pages;
preserve distinct editor and integration regression coverage. Full test suites
still require a fresh explicit user request under `AGENTS.md`.

Do not commit, push or publish documentation without explicit authorization.
