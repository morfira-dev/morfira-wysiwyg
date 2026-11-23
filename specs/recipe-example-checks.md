# Focused recipe wrapper compiler checks

Status: accepted tooling contract — 2026-11-23. `scripts/check-recipe-examples.ts`
requires already-built public packages and installed development tooling. It adds
no dependency and performs no install, full consumer matrix or publication.

Compile the single documented Svelte recipe wrapper with the installed Svelte
compiler, emitting only into a task-owned temporary directory. This verifies
Svelte syntax/template compilation, not full wrapper type checking or runtime.
Compile the Angular recipe wrapper and its transitive recipe helpers with the
installed Angular 21 AOT compiler and strict templates. Use a standalone temporary
TypeScript configuration with no workspace source aliases; package imports must
resolve through public artifact declarations. Reject source-module resolution
inside packages/*/src and require public Morfira declarations in the compiler graph.
Verify an emitted Angular component definition. Always clean temporary output.

Vue/React/Web Component checks and installed-tarball integration are separate
root-coordinated checks. Angular 22 and complete consumer profiles remain explicit
opt-in runs. Report actual executions; authoring this tool does not mean it ran.
