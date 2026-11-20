# Next plugin SDK proposal: revision-bound selection handles

Status: **unimplemented design proposal**, recorded on 2026-11-20. This is not an
accepted public API, an implementation commitment or evidence of runtime support.
The implemented contract remains [plugin-sdk.md](plugin-sdk.md). Names, placement,
size expectations and invalidation details below need acceptance before runtime
or public declarations change.

## Problem and candidate scope

Plugins currently combine public UTF-16 text offsets, path-based selection
bookmarks and live DOM Ranges with their own revision/target guards. Text offsets
cannot distinguish every empty-block or BR position, paths can resolve to new
nodes after replacement, and live Ranges adjust automatically when DOM changes.
None of these observations is independent authority to execute a future edit.

A candidate next SDK step is an opaque selection handle owned by one editor and
one unchanged document revision. It could capture actual boundary nodes/offsets
and direction, report whether those points are still current, provide bounded
observational geometry, and explicitly restore the selection. Public spelling,
the owning entrypoint and whether geometry belongs in core remain undecided.

This proposal does **not** map positions through edits, keep targets alive across
undo/redo, add persistent node IDs or generic atoms, register node views or
decorations, introduce custom content models, or replace the editing engine.
Later mapped selections need an explicit operation-mapping contract; they cannot
be inferred from a handle that rejects stale targets.

## Ownership and invalidation decisions

- Handles are immutable opaque identities, branded per editor. Foreign, forged,
  disposed and stale handles refuse without changing document, history or the
  current selection. Exposing a clone of observational data must not permit
  callers to rewrite internal boundary authority.
- A committed content edit, external document replacement, undo/redo, destruction
  or replacement/detachment of a captured boundary invalidates the handle.
  Equal serialized HTML does not prove identity: new DOM with identical markup
  must not silently retarget the capture. Same-value controlled feedback may
  preserve it only when the editor actually retains the document and nodes.
- Capturing/restoring around failed transactions needs an explicit policy. If
  rollback rebuilds nodes, an old handle must invalidate even when HTML and
  logical bookmark are restored. No promise to survive a rollback is proposed.
- Selection-only changes need a documented distinction between document validity
  and user intent. A handle may still describe unchanged nodes after focus moves,
  but an application action must separately revalidate its intended target. A
  generic restore must never become implicit permission to mutate that target.
- Native input/composition, pending uncommitted DOM edits and trusted direct DOM
  mutation require a synchronous freshness policy. Comparing only serialized
  HTML or waiting for a MutationObserver callback is insufficient for immediate
  callback-time replacement. Choose explicit boundary checks/dirty tracking;
  document what trusted application mutation remains outside guarantees.
- Read-only and composition continue to gate user editing and commands. Decide
  whether observational restoration itself is allowed while read-only; do not
  silently turn it into an editing bypass. Revalidate after focus listeners,
  since they may replace content, change selection or destroy the editor.

## Node retention and lifecycle tradeoffs

Storing actual nodes provides identity evidence but can retain detached subtrees
when an application keeps an expired handle. A registry of strong references can
retain every capture until editor destruction. Live Ranges also adjust with edits
and retain DOM; weak references alone cannot establish revision validity.

Choose a bounded ownership policy before implementation: explicit idempotent
release, automatic invalidation that clears node references, or a combination.
Invalidation must release references without retaining every dead handle in an
editor-owned set. Destroy must release subscriptions and references; retained
external handles must stay inert. Do not introduce a global editor/handle registry.
An async callback may observe a released handle but cannot revive it.

The first real consumer should be one existing contextual form, replacing a
specific duplicated target guard while preserving its stricter semantic target,
focus, read-only, dismissal and cleanup rules. Do not rewrite every optional UI
module merely to demonstrate adoption.

## Acceptance proposal

Use representative Chromium, Firefox and WebKit cases rather than a Cartesian
matrix. Assert actual document/selection/history results and side-effect-free
refusal, including:

1. Forward/backward captures at text, BR, empty-block and node-index boundaries;
   exact restoration without normalizing structure or changing history.
2. Two editors, fabricated/foreign handles, disposal and retained expired handles.
3. Same-value controlled feedback versus explicit replacement with identical HTML
   but different nodes; removed or replaced endpoint nodes and shifted offsets.
4. Input, composition, undo/redo and both successful and rolled-back transactions;
   pending native mutation and the documented trusted-direct-DOM policy.
5. Focus-time callbacks changing content/intent/read-only or destroying the editor;
   validate before and after focus and preserve rejected current selection.
6. One real contextual-form action with exact target/history restoration and
   lifecycle cleanup; no implied support for unsupported structural selections.
7. Focused public type and installed-tarball smoke, selective imports and safe SSR
   import. Internal bookmarks/ranges must not accidentally become exported API.

Retention tests should verify explicit release/invalidation behavior. Heap or GC
observations, if collected, are separate bounded measurements, not proof that all
browser objects are collected or that the editor is globally leak-free.

## Packaging and evidence

No runtime dependency, persisted schema change, CSS or eager optional-plugin
import is proposed. Measure raw minified JS, gzip and Brotli for core and affected
selected profiles, counting shared chunks once. Roughly 1–2 KB gzip is an initial
engineering expectation, **not a new enforced guard or measured result**. Existing
product and profile budgets remain unchanged; implementation should justify its
cost before revising scope or guards.

No code, tests, bundle measurements or browser evidence accompany this design
proposal. Update it to an accepted contract only after the unresolved freshness,
intent and retention decisions are settled. Keep actual validation in
[verification-backlog.md](verification-backlog.md).
