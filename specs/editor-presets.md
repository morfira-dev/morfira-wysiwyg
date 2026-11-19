# Ready editor presets

Status: P1–P3 behavior factories and their explicit public exports are implemented locally together with U1/U2 ready UI. P4 measured profile guards are active as recorded below. The SDK slice is specified separately in `plugin-sdk.md`.

## Product outcome

Consumers should be able to create an ordinary ready editor with a few public imports, while headless consumers select the same behavior without loading UI, frameworks or unrelated features. Presets compose existing public capabilities; they are not an editing engine, a global plugin registry or a dependency-injection framework.

A preset name describes an explicit capability set. A documentation laboratory with every control is not the preset implementation. The homepage, playground and standalone adapter examples must consume the same published factories after implementation.

## Proposed public boundaries

- `@morfira-dev/wysiwyg/presets/minimal` exports `createMinimalPreset(options?)`.
- `/presets/standard` exports `createStandardPreset(options?)`.
- `/presets/extended` exports `createExtendedPreset(options?)`.
- Each factory returns fresh `EditorOptions` for `createEditor(host, options)` or the supported wrapper options. It creates no editor, DOM node, event subscription, upload, timer or global registration.
- Preset options expose documented editor settings and feature-owned configuration; preset-specific configuration must not leak as unknown `EditorOptions` fields. Implemented names/types are exposed through explicit exports/declarations and documented in the RU/EN preset guides.
- Behavior-only preset entries do not import UI implementations, CSS, icon/font assets, framework runtimes or the umbrella full preset. Core's existing entry imports no preset or plugin. Presets live in the optional feature package with explicit facade forwarding entries, using feature-owned folders/types.
- Optional UI is a separate import. `editor-ui.md` proposes `/ui/editor` for a small configurable shell and `/ui/standard` for the convenience composition of ready standard controls/forms. Importing `/presets/standard` must not retain these UI entries.

Conceptual integration to make concrete in the first standard release:

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { createStandardPreset } from '@morfira-dev/wysiwyg/presets/standard';
import { createStandardEditorUI } from '@morfira-dev/wysiwyg/ui/standard';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/plugins/tables.css';
import '@morfira-dev/wysiwyg/ui/editor.css';
import '@morfira-dev/wysiwyg/ui/forms.css';

const editor = createEditor(editorHost, createStandardPreset({
  locale: 'ru',
  images: { upload: applicationUpload },
}));
const ui = createStandardEditorUI(uiHost, editor);
const dispose = () => {
  ui.destroy();
  editor.destroy();
};
```

These entrypoints are implemented locally; package publication remains a separate release action. Images without an upload callback still support URL insertion; no upload transport, endpoint, blob persistence or development placeholder is silently supplied.

## Initial capability matrix

The first preset release includes only working, documented capabilities. New modules join a preset through a separately reviewed specification/change with measured closure impact; unfinished features are not represented by placeholder plugins.

| Capability | Minimal | Standard | Extended |
| --- | --- | --- | --- |
| Safe v1 HTML/JSON, selection, transactions, history, locale/read-only | Core | Core | Core |
| Core inline/block formatting, ordinary links and lists | Available through existing core API | Available | Available |
| Tables with current logical-grid/merged-cell/clipboard contract | Excluded | `tables()` | Included |
| URL images and optional application upload callback | Excluded | `images(configuration)` | Included |
| Literal search and replace | Excluded | `search()` | Included |
| Unicode document/selection statistics | Excluded | `statistics()` | Included |
| Existing Markdown typing shortcuts | Excluded | `markdownShortcuts()` | Included |
| Explicit horizontal rule in one ordinary root paragraph/heading | Excluded | `horizontalRule()` | Included |
| Editable-text mentions and structural slash actions | Excluded | Excluded | `mentions(configuration)` and `slash(configuration)` |
| Suggestion menu view | Excluded | Excluded | Separate extended UI composition; behavior preset loads no menu view |
| Link/image/search forms | Separate optional UI | Separate standard UI composition | Separate extended UI composition |
| App-owned schema definitions and typed commands | Explicit app/plugin input through supported SDK | Explicit | Explicit |
| Atomic mentions, custom node views, decorations | Not provided | Not provided | Not provided by current SDK phase 1 |
| Future checklists/fonts/direction/autolink/video/formulas/print | Not implied | Added only after their contracts/implementation/measurement | Added selectively after implementation, never as placeholders |

Minimal means no optional plugins, not a newly split or rewritten core. Features currently inside core remain available even if minimal UI does not expose every action. Standard intentionally includes the existing useful tables/images/search/statistics/Markdown modules so users do not rebuild everyday behavior. Extended adds ready suggestion behavior, without claiming persistent identity or the later rich-node SDK.

Autolink and other concurrently developed modules are not assumed implemented by this matrix. Their eventual inclusion must be stated explicitly with an updated profile report; shipping a standalone entry does not automatically change every preset.

## Configuration, state and composition

1. Each invocation creates fresh built-in plugin definitions, owned configuration containers and a fresh plugins array. Independent editors cannot share mutable upload/search/suggestion state through a preset.
2. Copy preset-owned arrays/records without attempting to clone callbacks. Caller functions and explicitly supplied application plugin objects remain trusted application values; their per-instance lifecycle follows the existing plugin contract. Do not mutate the caller's options or built-in defaults.
3. Provide a documented path for additional app plugins/schema. Let the core reject duplicate plugin/schema registrations before setup as already specified; do not build a second plugin-resolution system in the preset layer. A standard factory does not silently replace conflicting plugin names.
4. Upload callbacks, mention/slash providers, diagnostics, persistence and authorization remain application-owned. Optional providers have explicit empty/configuration states; presets must not make background requests to supply demo data.
5. Plugins and schema are installed before initial document import through the existing `createEditor` contract. UI mounts after editor creation and never changes document schema. Dynamic plugin/schema replacement, node-view registration and persistent atoms are outside this preset release.
6. CSS stays explicit and independent. A factory does not inject style elements, `@font-face`, images, icon libraries or framework code. Default icons are small code/vector assets owned by optional UI; fonts remain system/application selections.
7. Presets do not own the editor lifetime. Disposing an optional UI must leave the editor usable; destroying an editor cleans its plugins and auto-disposes associated UI according to `editor-ui.md`.

## Implementable delivery slices

### P1 — Minimal behavior preset and a usable small shell — implemented locally

Implement only the minimal pure factory and the baseline toolbar shell contract from `editor-ui.md`: grouped actions, history state, safe selection/focus handling and explicit CSS. Publish an actual minimal facade import and one framework-free example. Do not hold this slice for custom node views, decorations, full overflow or all future features.

### P2 — Standard behavior and ready standard UI — implemented locally

Compose tables/images/search/statistics/Markdown using their existing factories. Implement the standard UI convenience entry with link/image/search forms, block/list controls and measured responsive toolbar behavior. Reuse existing form controllers rather than copying their command/draft/upload logic. Add homepage and standalone wrapper examples using the same published configuration. Make the standard feature list and required CSS explicit.

### P3 — Extended current capabilities — implemented locally

Add the pure extended factory for current mentions/slash providers and an optional menu/UI composition. Keep providers configurable, completion states localized and editable-text limitations clear. Future atoms, node views or rich structural selection require their own SDK phase; extended must remain usable without them.

### P4 — Guard measured profiles — active

Real P1–P3 entries and profile guards now exist; the activation and accounting contract is recorded below. Keep installed-tarball consumer validation, JS/CSS/loading graphs and public-facade size checks in the release gates. Update preset versions/features when a composition materially changes.

## Size accounting and targets

- User-directed product limits are core 200000 gzip JS bytes and optional/table entries 150000 gzip JS bytes. Each adapter retains its separate 10000 raw JS byte guard. The working core target is 80000 minified bytes, a soft optimization goal.
- Standard guard: 80000 gzip JS bytes, plus at most 20000 raw CSS bytes. Extended guard: 110000 gzip JS bytes and 20000 raw CSS bytes. Raw JS remains measured but no longer has a profile cap. These active guards follow the P4 policy below.
- Measure minified raw JS, gzip, Brotli and CSS separately for each entry and a deduplicated selected closure. Headless and ready-UI profiles must be separate. Do not add independent per-entry totals that count shared chunks twice.
- Include core, selected plugin implementations, UI/forms/icons and any required helper chunks in the chosen profile. Report optional locale alternatives, fonts/media and separately lazy-loaded modules outside the initial closure, with their own sizes and load triggers. Framework runtimes, source maps and declarations are excluded.
- A feature being hidden or disabled at runtime does not establish tree-shaking. Verify actual built public imports exclude unrelated implementations and mandatory CSS.

## Acceptance

- Pure imports/factory calls work in Node without DOM and create no observable DOM/global/network side effects. Standard/extended factories select their documented built-ins and pass feature options without mutating inputs.
- Chromium, Firefox and WebKit exercise create/edit/format, tables with merged cells, image insertion, search/replace, Markdown history, locale/read-only, independent instances and teardown using each applicable preset. Extended covers actual providers, empty/error completion and menu cleanup.
- Selection/history and external controlled values preserve existing contracts. Test default profiles through Vue, React StrictMode, Svelte, Angular 21/22 and Web Component real installed-tarball fixtures; adapters must not acquire a new runtime dependency on UI.
- Public declarations, explicit exports/CSS entries, package dependency boundaries, selective imports and measured profiles are checked against built/installable artifacts, not source aliases.
- RU/EN guides, live homepage/playground examples and limitations match the same real factories. Report actual browser/device/accessibility evidence; automated desktop tests do not certify all mobile keyboards or screen readers.

## First implementation decision

P1–P3 behavior factories and U1/U2 UI are implemented locally. Standard additionally includes the bounded Space/controlled-Enter/plain-URL-paste `autolink()` and `horizontalRule()`; `false` may disable a built-in instance, but runtime flags do not erase statically imported code. Minimal imports no optional behavior. Extended requires explicit mention/slash provider configuration; it installs no example provider or network transport. Additional application plugins/schema are appended/copied without mutating input. The precise option types and default built-in list are documented with the public factories.

The first release uses responsive wrapping by default. The U3a contract in `editor-ui.md` adds explicit `overflow: 'more'` to ready UI while preserving that default; it does not alter preset behavior or add UI to headless imports. Contextual selection bubbles remain a separate U3 follow-up. Every implemented profile must have measured raw/gzip/Brotli/CSS before enabling its proposed budget guard.


## P4 — Measured profile guards activated

The first implemented presets and ready UI have been measured through bundled public facade imports. This establishes the previously proposed limits as active guards in `scripts/size.ts` for both headless and ready standard/extended profiles:

- Standard: at most 80000 gzip JS bytes and 20000 raw CSS bytes.
- Extended: at most 110000 gzip JS bytes and 20000 raw CSS bytes.

The product reason is to preserve the lightweight envelope now demonstrated by real usable compositions as subsequent capabilities are added. Each JS profile bundles core, its preset and its applicable ready-UI factory once; required CSS is an explicit deduplicated list. Minified/gzip/Brotli results remain separate, framework runtimes/fonts/source maps/declarations remain excluded, and no runtime feature flag is counted as tree-shaking. Minimal remains reported without a new profile guard. The gzip clarification below governs current core/table/profile guards; adapters retain their independent raw guard. P4 does not imply contextual bubbles or later SDK phases are complete.

### User-directed gzip policy clarification

The user explicitly clarified that the original 200 kB core and roughly 100–150 kB additional-module envelopes refer to gzip transfer size. Therefore core and optional-entry/table guards use gzip, and the former 200000/350000 raw JS profile caps are retired. The initial standard/extended guards were 65000/110000 gzip bytes. The user-directed standard revision below changes only standard to 80000 bytes; extended remains 110000 bytes, below the broader product ceilings. Adapter and feature-specific raw guards and raw CSS guards are independent engineering limits and remain unchanged. Continue reporting minified JS, gzip, Brotli and CSS, counting shared emitted files once per selected closure; compressed entry sizes sum the actual emitted compressed files. Historical verification records retain the policy used for those historical runs. Smaller-than-competitor claims require equivalent feature profiles and compression evidence, not a comparison with full vendor distributions.

### User-directed standard reserve — 2026-11-18

The user explicitly approved increasing the standard profile budget because the measured editor remains lightweight. Raise only the headless/ready standard JS guard from 65000 to **80000 gzip bytes**. The last measured largest selection is 64602 gzip bytes: the previous 398-byte reserve becomes **15398 bytes** under the new guard. This is a product allowance for useful everyday-authoring capabilities and maintainable implementation, rather than mandatory optimization for individual bytes. It does not establish a new measurement or permit unnecessary code/dependencies.

Extended remains 110000 gzip JS bytes; core remains 200000 gzip JS bytes; optional/table entries remain 150000 gzip JS bytes. Keep adapter 10000-byte raw guards, explicit smaller feature-entry guards, the 80000-byte raw core soft target and 20000-byte minified CSS profile guards unchanged. Zero runtime dependencies, selective imports/tree-shaking, profile accounting, compression settings and actual raw/gzip/Brotli/CSS reporting remain mandatory. Preserve historical results under the budgets used at the time; do not relabel an old failed check as passing merely because the policy changed.

## Horizontal-rule capability

Standard and extended presets include the small `horizontalRule()` behavior by default, after autolink and before application plugins. `horizontalRule?: boolean` accepts false to omit its instance; other runtime values reject before creating an editor. Minimal stays unchanged. As with existing presets, a runtime opt-out does not remove static imports: consumers needing a narrower graph use selective entries. The public behavior entry is `/plugins/horizontal-rule`; it requires no additional stylesheet. Scope follows `horizontal-rule.md`, including same-block root P/H targets and disabled nested/semantic targets. Profile budgets stay unchanged and must include the additional selected capability once.


The separately measured `standard-contextual-link-ready` selection adds only `createContextualLinkUI` and its explicit stylesheet to standard ready. Its shared link form is counted once; it keeps the same 80000 gzip JS / 20000 raw CSS guard. It does not combine every optional feature or install the UI implicitly. The standalone contextual-link closure is guarded at 16000 gzip JS bytes and its extra CSS at 3000 raw bytes.


The independent `standard-contextual-image-ready` selection adds only createContextualImageUI and its explicit CSS to standard ready. Shared images/form code counts once, and edit-only mode remains a runtime option rather than a tree-shaking claim. Keep 80000 gzip JS / 20000 raw CSS; the standalone entry guard is 16000 gzip JS and its added stylesheet 3000 raw bytes. Other optional-UI combinations require their own measurements.


The independent `standard-contextual-table-ready` selection adds only `createContextualTableUI` and its explicit stylesheet to standard ready. Shared grid/table/selection code counts once. `getTableSelection` is a separate selective export rather than a method retained by every table command instance. Presets do not mount contextual controls. Keep the current 80000 gzip JS / 20000 raw CSS profile guards, and standalone 16000 gzip JS / 3000 raw CSS guards. The all-optional-context-UI combination is not represented by this profile.


The 2026-11-16 structural optimization under bundle-optimization.md preserves every profile factory and capability. Largest standard is 64482 gzip JS bytes (previously 64999), leaving 518 bytes under the unchanged 65000 guard; standard ready is 59394 gzip bytes. This is a modest measured reduction, not the original 2000-byte reserve aim. CSS/compression/charset/profile boundaries and tests are unchanged. Actual validation belongs to verification-backlog.md.

## CI regression clarification — 2026-11-19

Extended mention configuration forwards the public `persistent` and `atomic` flags unchanged. Their defaults and validation remain owned by the mentions plugin. The preset and separately imported public mention clipboard API must share the same per-editor registration; the full documentation demo is an integration consumer of this contract.
