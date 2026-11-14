# Optional ready editor UI

Status: planned implementation contract for the next product-UI milestone. No new runtime UI or export is implemented by this document. Existing toolbar/forms remain available under their current public contracts. Preset composition follows `editor-presets.md`; SDK scope follows `plugin-sdk.md`.

## Outcome and boundaries

Provide a modern ready interface for ordinary authoring without copying documentation-demo code into applications. Reuse core commands/transactions, feature-owned plugin APIs and the existing link/image/search forms. UI remains optional, framework-free and independent from documentation CSS. No global event bus, singleton popup manager, mandatory framework, generic service container or new document engine is required.

Proposed public entries:

- `/ui/editor`: `createEditorUI(host, editor, options?)` for the small grouped-toolbar shell and explicitly provided action/panel configuration. This entry does not import image/search/table/suggestion implementations or all three forms just to support configurable slots.
- `/ui/standard`: `createStandardEditorUI(host, editor, options?)` composes the shell, ready ordinary controls and existing link/image/search factories. It documents and validates the required standard plugins before mounting.
- `/ui/extended`: a later convenience composition for current mention/slash suggestion controls and menu views, without future atoms/node views.
- `/ui/editor.css`: explicitly imported scoped shell/control CSS. Existing `/ui/forms.css`, core CSS and selected plugin CSS remain separate explicit imports.

Names/types are finalized in the relevant implementation slice. Factories mount owned DOM only when called in a browser. Modules import safely without DOM, register no global custom elements and trigger no network requests. UI never changes the editor's installed plugins or schema.

Mount into an empty application-owned host outside `editor.surface`; reject a nonempty/inside-surface host before any DOM/listener change. Required plugin/command validation also happens before mounting. The UI owns only its created subtree and never replaces an unrelated application node. Popup/control IDs are unique within and across editor instances.

The controller contract is small: owned `element`, explicit `refresh()` and idempotent `destroy()`. Other operations after destruction fail clearly; detached controls are inert. Editor destruction automatically releases its associated UI. Multiple editor/UI instances cannot share transient focus, open panels, drafts or subscriptions.

## Staged UI behavior

### U1 — Baseline shell

Start with a small toolbar composition over existing formatting/history behavior. Use grouped buttons and block/list/alignment selectors with an explicit ordered configuration. Support pressed, mixed and disabled states from existing core formatting and typed SDK command snapshots. Custom application commands use their identity tokens and validated payloads; action IDs/labels do not become a second string/RPC command bus.

Existing `createToolbar` behavior remains compatible. Extract a concrete reusable helper only when both old/new UI need the same responsibility; do not introduce a generic UI framework. Keep named control/action/controller types with their owning feature.

### U2 — Standard controls and forms

Add ready link/image/search launchers, localized block/list/alignment selectors and color/highlight palettes. Embed existing `createLinkForm`, `createImageForm` and `createSearchForm` controllers inside owned panel hosts. Reuse draft validation, upload ownership/cancellation, search state and lifecycle instead of reimplementing them in the shell.

The standard UI checks required plugins before leaving mounted DOM or listeners. Missing image/search/table configuration must not produce a button that fails only after interaction. Minimal shell users may explicitly configure the controls supported by their editor without importing standard feature renderers.

### U3 — Responsive overflow and contextual controls

Add measured overflow and small contextual link/image/table affordances after the baseline shell/forms pass acceptance. Context is read through public selection/plugin APIs. The UI does not simulate a new atomic selection model or persist controls in the document. Use contextual controls only for capabilities with stable existing selection contracts; later node-view/decorations SDK work is not assumed implemented.

One interaction remains one transaction/history step. Opening, closing, resizing/repositioning or changing a UI panel is not a document edit. Advanced table/image operations must still satisfy their feature specifications before a new control exposes them.

## Selection, focus and keyboard contract

- Preserve the actual editor range and direction before focus enters a toolbar control or panel, including empty blocks and rich/table-cell selections. Restore only a valid current target before an editing action. External document replacement invalidates remembered ranges; do not apply stale drafts to a new document.
- Use public command state for enabled/active/mixed and re-read at activation. Read-only/composition guards are enforced by the editor/command even for synthetic events, not only disabled button styles. Search navigation and other non-mutating actions remain available read-only where their feature contract permits.
- A toolbar uses `role=toolbar`, an accessible localized label and one roving tab stop among enabled controls. Arrow keys and Home/End follow the chosen orientation; Tab leaves the toolbar. Do not hijack document typing shortcuts while an input/select is focused.
- Native buttons/selects/inputs retain native semantics where sufficient. Toggle controls expose `aria-pressed`; mixed toggles expose the supported mixed state. Disabled controls have programmatic state and are skipped by toolbar navigation. Tooltips supplement visible/icon labels and never supply the only accessible name.
- Popup launchers expose expanded/controls state. Nonmodal property forms use a labelled region/form pattern with no nested native form. Use dialog semantics and focus trapping only for a genuinely modal interaction; restore focus to the invoker or a valid editor target on close.
- Opening a popup by keyboard places focus on its first meaningful enabled control. Escape closes the current popup without changing document/history and returns focus predictably. Closing must not silently commit an invalid draft. Outside interaction dismisses only the owned popup according to its form contract and does not steal focus from the user's target.
- Color palettes use an accessible grid/radio-like single-selection pattern with arrow/Home/End navigation and a meaningful current/mixed/default label. Menu roles are used for action menus, not indiscriminately for every property form.
- Pointer activation must preserve ranges without preventing ordinary text editing in the panel. Match focus behavior across Chromium/Firefox/WebKit, including Safari's button-focus differences. Composition/IME in fields does not accidentally submit the panel.

## Responsive layout and positioning

- Standard density and compact density are configuration/token choices with consistent hit areas and visible focus. A narrow host must not cause horizontal page overflow. Editor content/table overflow stays within the relevant content wrapper.
- Overflow ordering follows configured action/group order and uses stable priorities. Controls moved into overflow keep their accessible names/state and a predictable keyboard path; no duplicate active controls or discarded application actions are allowed.
- Measure the UI host, not the viewport alone. If an action/focused control would move during resize, keep focus stable or move it to the corresponding overflow representation; never leave focus on detached DOM. Handle zoom, large text and locale changes that alter label width.
- Position owned popups relative to their invoker/current valid selection with bounded viewport/scroll-container placement. Account for scrolling/resizing without global per-frame polling. Install observers/listeners only while needed and remove them on close/destroy. No dependency on future decorations or custom node views is implied.
- Begin with local panel ownership. Introduce a narrowly scoped geometry helper only when the real controls share it; no global overlay service is required.

## Visual system and content isolation

Use scoped `.mw-*` classes and existing `--mw-*` variables. Extend the token vocabulary for control radius, gap, density, icon size, popup surface/shadow and focus only when the implemented control needs it. Respect inherited typography and application colors without depending on `.vp-doc` or any docs theme variables.

- Use small owned SVG/code assets with explicit view boxes for icons. Do not add an icon library, default remote image or automatically loaded font. Decorative icons are hidden from assistive technology; the control owns its name.
- Light/dark themes must preserve readable text, visible focus, distinguishable selected/mixed/disabled states and popup boundaries. User-selected document colors remain content and are not rewritten when UI theme changes.
- Prefer minimal motion; honor `prefers-reduced-motion`. Do not animate geometry in a way that loses selection/focus or obscures error/success state. Popup visibility and command outcomes remain clear without animation.
- Standard target is usable touch hit areas and keyboard reachability, not an unverified accessibility certification. Test contrast, zoom, high text size and forced-color behavior on the actual controls before stating support.
- Editor content styling and editor-control styling are separate. Controls, live regions, handles and form drafts stay outside persisted content. Exported HTML/JSON must contain no popup/toolbars/shell classes or transient UI attributes.

## Localization, errors and lifecycle

UI labels, accessible names, help, tooltips and live status use per-instance RU/EN catalogs and overrides through the existing locale API. Live locale change updates UI without replacing document, history, valid range or focused drafts. Explicit custom application labels remain explicit. Dictionary ownership and entrypoints must preserve sanitizer-only tree-shaking.

Display safe localized error messages; diagnostics can pass original errors to an explicit application callback. Never render error/label/provider text as executable HTML. A failing application diagnostic handler cannot interrupt required disposal. No upload transport, save endpoint or authentication state belongs to the UI package.

On close/destroy release every owned form/menu controller, listener, subscription, observer, pointer capture and pending UI callback. Cancel only UI-owned pending upload operations according to the existing scoped upload contract. Destroying an optional UI does not clear application-owned search/provider state, mutate the document or destroy its editor. On setup failure, remove only resources created by that setup and leave the host empty; a host rejected as nonempty remains unchanged.

## Delivery and acceptance

Implement U1 with preset P1 first; then U2/P2, then responsive/contextual U3 and extended P3. Each slice ships a working feature rather than stubs for later SDK phases. Later dedicated UI specification updates may narrow exact keyboard/layout details before implementation; ordinary implementation choices do not require a separate permission flow.

Required evidence for the implemented slice:

1. Chromium, Firefox and WebKit behavior tests for selected rich text, empty blocks, backwards ranges, table-cell selections, command state, history, read-only/composition, outside/API replacement, popup keyboard paths, two instances and cleanup. Keep merged-cell regressions when table controls change.
2. Visual/browser examples for wide and narrow hosts, RU/EN, light/dark, compact/standard density, focused/mixed/disabled/error states, zoom and reduced motion. Verify page overflow and focus after responsive moves rather than relying only on snapshots. Record actual visual checks; screenshots alone do not establish screen-reader/mobile support.
3. Real installed-tarball imports/declarations/CSS through the existing five-wrapper consumer profiles, including React StrictMode and Angular 21/22. SSR imports do not touch DOM, register globals or load framework/UI dependencies into core.
4. Individual shell/standard/extended and deduplicated preset closure measurements as minified raw JS, gzip and Brotli, plus CSS separately. Standard 200000 raw / 65000 gzip JS bytes, extended 350000 / 110000 and standard 20000-byte CSS are targets until measured profiles are explicitly guarded. Existing core/table/adapter guards remain unchanged.
5. RU/EN API and live examples use these public UI factories. The homepage presents ready scenarios while the playground remains the detailed laboratory; neither retains duplicate form/toolbar behavior. Document unsupported contextual/selection/device behavior precisely.
