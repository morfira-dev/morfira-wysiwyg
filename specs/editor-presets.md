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

- Existing enforced limits remain core 200000 raw minified JS bytes, table entry 150000 and each adapter 10000. The working core target is 80000 bytes.
- Standard target: 200000 raw / 65000 gzip JS bytes, plus at most 20000 raw CSS bytes. Extended target: 350000 raw / 110000 gzip JS bytes. These are active profile guards as detailed in the P4 activation note below.
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

P1–P3 behavior factories and U1/U2 UI are implemented locally. Standard additionally includes the now-implemented Space-only `autolink()`; `false` may disable a built-in instance, but runtime flags do not erase statically imported code. Minimal imports no optional behavior. Extended requires explicit mention/slash provider configuration; it installs no example provider or network transport. Additional application plugins/schema are appended/copied without mutating input. The precise option types and default built-in list are documented with the public factories.

The first release uses responsive wrapping rather than a priority/More overflow menu. Full measured overflow and contextual selection bubbles remain U3 follow-up, not implied by the first modern toolbar. Every implemented profile must have measured raw/gzip/Brotli/CSS before enabling its proposed budget guard.


## P4 — Measured profile guards activated

The first implemented presets and ready UI have been measured through bundled public facade imports. This establishes the previously proposed limits as active guards in `scripts/size.ts` for both headless and ready standard/extended profiles:

- Standard: at most 200000 raw minified JS bytes, 65000 gzip JS bytes and 20000 raw CSS bytes.
- Extended: at most 350000 raw minified JS bytes, 110000 gzip JS bytes and 20000 raw CSS bytes.

The product reason is to preserve the lightweight envelope now demonstrated by real usable compositions as subsequent capabilities are added. Each JS profile bundles core, its preset and its applicable ready-UI factory once; required CSS is an explicit deduplicated list. Minified/gzip/Brotli results remain separate, framework runtimes/fonts/source maps/declarations remain excluded, and no runtime feature flag is counted as tree-shaking. Minimal remains reported without a new profile guard. Existing core/table/adapter guards are unchanged. This note activates P4 for these implemented profiles; it does not claim U3 overflow, contextual bubbles or later SDK phases are complete.
