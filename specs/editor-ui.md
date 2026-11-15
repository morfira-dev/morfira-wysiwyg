# Optional ready editor UI

Status: U1 baseline shell, U2 standard controls/forms and U3a opt-in group-priority overflow are implemented locally with explicit public entries. Wrapping remains the compatible default; contextual controls remain later U3 work. Existing toolbar/forms remain available under their current public contracts. Actual current verification is recorded in `verification-backlog.md`. Preset composition follows `editor-presets.md`; SDK scope follows `plugin-sdk.md`.

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

### U1 — Baseline shell — implemented locally

Start with a small toolbar composition over existing formatting/history behavior. Use grouped buttons and block/list/alignment selectors with an explicit ordered configuration. Support pressed, mixed and disabled states from existing core formatting and typed SDK command snapshots. Custom application commands use their identity tokens and validated payloads; action IDs/labels do not become a second string/RPC command bus.

Existing `createToolbar` behavior remains compatible. Extract a concrete reusable helper only when both old/new UI need the same responsibility; do not introduce a generic UI framework. Keep named control/action/controller types with their owning feature.

### U2 — Standard controls and forms — implemented locally

Add ready link/image/search launchers, localized block/list/alignment selectors and color/highlight palettes. Embed existing `createLinkForm`, `createImageForm` and `createSearchForm` controllers inside owned panel hosts. Reuse draft validation, upload ownership/cancellation, search state and lifecycle instead of reimplementing them in the shell.

The standard UI checks required plugins before leaving mounted DOM or listeners. Missing image/search/table configuration must not produce a button that fails only after interaction. Minimal shell users may explicitly configure the controls supported by their editor without importing standard feature renderers.

### U3 — Responsive overflow and contextual controls — staged work

Add measured overflow and small contextual link/image/table affordances after the baseline shell/forms pass acceptance. Context is read through public selection/plugin APIs. The UI does not simulate a new atomic selection model or persist controls in the document. Use contextual controls only for capabilities with stable existing selection contracts; later node-view/decorations SDK work is not assumed implemented.

One interaction remains one transaction/history step. Opening, closing, resizing/repositioning or changing a UI panel is not a document edit. Advanced table/image operations must still satisfy their feature specifications before a new control exposes them.

### U3a — Opt-in group-priority overflow — implementation contract

Add `overflow?: 'wrap' | 'more'` to shell and ready standard/extended options. The default remains `wrap` for compatibility: existing integrations and their controls remain visible. Applications and the live demo can explicitly enable `more`; changing options requires destroying/remounting the UI, never replacing the editor/document. Contextual bubbles and a default-mode change are separate later decisions.

The shell also accepts `groupPriorities?: readonly number[]`, with exactly one finite number per configured group. Larger values retain a group longer; equal priorities retain earlier groups. Reject invalid modes, lengths or numbers before mounting/listeners. Standard/extended own their fixed priorities rather than exposing positional priority arrays for conditional built-in groups.

In `more` mode measure the mounted toolbar's available width, including its padding/gaps and the disclosure button, inside its host. Move whole existing group nodes at lowest priority first, breaking ties from the end. Keep the original order in both visible toolbar and overflow region, preserve control identity/listeners/state and never create duplicate active controls. Oversized groups and an extremely narrow host use bounded wrapping. A hidden or initially zero-width host is safe and recomputes when shown. Use bounded measurement and a per-instance ResizeObserver/scheduled callback, not polling or a global overlay. `refresh()` recomputes locale/control-label widths. Without ResizeObserver, explicit refresh still lays out the UI.

More / Ещё is a native disclosure button with localized accessible name, unique controls ID and expanded state. Its labelled nonmodal region contains existing native controls, not ARIA menu items. Closed controls are hidden and excluded from keyboard navigation. The toolbar's roving path includes the disclosure when visible; the open region has its own predictable control path. Native select/input keys remain native. Keyboard opening focuses the first enabled overflow control. Escape closes overflow and returns focus to More; outside dismissal does not steal focus from the user's chosen target or swallow its click. Collapse the in-flow region only after the click target is established, so page/scroll movement between pointerdown and pointerup cannot cancel outside activation. Preserve native browser focus behavior; WebKit may blur an ordinary pointer-clicked button even without this UI. Activating an overflow action closes the region without stealing focus from the editor or a newly opened standard form.

Opening, closing and layout do not change editor content, native selection or history. Existing selection capture/restore and action guards still apply. Preserve an actively focused group's location during responsive layout (bounded wrapping may remain temporarily), then recompute after focus leaves; do not detach the focused control or claim preservation of an open native OS picker during resize. API replacement invalidates saved selection normally. Read-only/composition, locale changes, standard form launch/return focus, multiple editors and detached stale controls keep their existing contracts.

Destroy disconnects the observer, cancels pending work and releases all listeners; setup rollback owns only newly created resources. Core and headless profiles must not gain overflow code. Follow the user-directed gzip policy in `editor-presets.md` and measure raw/gzip/Brotli JS and CSS separately.

Representative acceptance covers: (1) width/priority/tie changes and whole-group node identity, including a native select and hidden host; (2) rich backward selection, keyboard disclosure and one editing Undo without layout history; (3) focus during resize, Escape/outside and no closed-region Tab stops; (4) locale/read-only/composition/API replacement and standard form focus; (5) two-instance cleanup, queued resize and malformed options. Add RU/EN public examples and narrow-host demo smoke tests without repeating the complete editor matrix.

## Selection, focus and keyboard contract

- Preserve the actual editor range and direction before focus enters a toolbar control or panel, including empty blocks and rich/table-cell selections. Restore only a valid current target before an editing action. External document replacement invalidates remembered ranges; do not apply stale drafts to a new document.
- Escape from the toolbar returns focus to the editor even after an external replacement invalidates the remembered range. Use the editor's current safe caret in that case; focus recovery must not mutate the document or create history.
- Use public command state for enabled/active/mixed and re-read at activation. Read-only/composition guards are enforced by the editor/command even for synthetic events, not only disabled button styles. Search navigation and other non-mutating actions remain available read-only where their feature contract permits.
- A toolbar uses `role=toolbar`, an accessible localized label and one roving tab stop among enabled controls. Arrow keys and Home/End follow the chosen orientation; Tab leaves the toolbar. Do not hijack document typing shortcuts while an input/select is focused.
- Native buttons/selects/inputs retain native semantics where sufficient. Toggle controls expose `aria-pressed`; mixed toggles expose the supported mixed state. Disabled controls have programmatic state and are skipped by toolbar navigation. Tooltips supplement visible/icon labels and never supply the only accessible name.
- Popup launchers expose expanded/controls state. Nonmodal property forms use a labelled region/form pattern with no nested native form. Use dialog semantics and focus trapping only for a genuinely modal interaction; restore focus to the invoker or a valid editor target on close.
- Popup and heading IDs are unique per document across mounted and detached UI instances, without requiring secure-context crypto APIs. Creating several UI instances remains supported when `crypto.randomUUID` is unavailable.
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

U1/P1, U2/P2, extended P3 and U3a opt-in overflow are implemented locally; contextual U3 controls remain future work. Each slice ships a working feature rather than stubs for later SDK phases. Later dedicated UI specification updates may narrow exact keyboard/layout details before implementation; ordinary implementation choices do not require a separate permission flow.

Required evidence for the implemented slice:

1. Chromium, Firefox and WebKit behavior tests for selected rich text, empty blocks, backwards ranges, table-cell selections, command state, history, read-only/composition, outside/API replacement, popup keyboard paths, two instances and cleanup. Keep merged-cell regressions when table controls change.
2. Visual/browser examples for wide and narrow hosts, RU/EN, light/dark, compact/standard density, focused/mixed/disabled/error states, zoom and reduced motion. Verify page overflow and focus after responsive moves rather than relying only on snapshots. Record actual visual checks; screenshots alone do not establish screen-reader/mobile support.
3. Real installed-tarball imports/declarations/CSS through the existing five-wrapper consumer profiles, including React StrictMode and Angular 21/22. SSR imports do not touch DOM, register globals or load framework/UI dependencies into core.
4. Individual shell/standard/extended and deduplicated preset closure measurements as minified raw JS, gzip and Brotli, plus CSS separately. Active standard/extended profile guards are 65000/110000 gzip JS bytes and 20000 raw CSS bytes each. Core and optional-entry product caps use gzip; independent adapter/small-feature raw guards follow `editor-presets.md`.
5. RU/EN API and live examples use these public UI factories. The homepage presents ready scenarios while the playground remains the detailed laboratory; neither retains duplicate form/toolbar behavior. Document unsupported contextual/selection/device behavior precisely.

## First implementation decision

The baseline delivers the grouped icon toolbar shell and standard panel composition. Standard includes native block/list/alignment controls, inline formatting/history, color/highlight controls, table insertion and the existing link/image/search forms. Native form controls are allowed when they provide the appropriate interaction; a custom color grid remains separate work. At narrow widths controls wrap within their host by default. U3a adds explicit opt-in priority/More overflow under the contract above; contextual bubbles remain a later follow-up.

Custom action callbacks may invoke existing typed SDK tokens through closures; action IDs remain UI identities only. All mutation paths recheck read-only/composition and restore a valid range. Non-mutating panel/search actions may remain usable read-only. Closing a panel releases its owned controllers/listeners and cancels only its own upload; reopened drafts may be retained as copied per-instance UI values without changing plugin/document state. Standard creation validates required plugins before mounting, uses no editor/schema replacement, and forwards safe localized errors plus optional original diagnostics.

## Optional horizontal-rule action

When the horizontal-rule plugin is installed, ready standard/extended UI includes a localized native button named Horizontal rule / Разделитель, identified by `data-mw-ui-action="horizontal-rule"`, with a small text divider glyph. It uses the public command state and existing selection restoration, roving keyboard navigation, read-only/composition and error/lifecycle handling. Manual standard-UI configurations without this optional plugin remain valid and show no divider action; required image/search/table validation is unchanged. This adds no persisted controls, extra CSS, icons or UI requirement for headless usage.

The core content stylesheet styles the existing schema-v1 HR (also produced by Markdown) through scoped `--mw-horizontal-rule-color` and `--mw-horizontal-rule-spacing`, falling back to the existing border token and 1em. This is content styling shared by existing HR producers, not a core dependency on the optional behavior plugin.

The horizontal-rule action reads `getState(selection.peek())` against the UI-owned remembered Range. This is a side-effect-free state projection; toolbar focus must not disable a valid target when WebKit drops the native selection. Activation still restores the current valid saved range and executes the ordinary guarded command. A projected state never supplies execution authority or moves the document selection.

UI composition guards follow core cancellation: an authoritative API document replacement or enabling read-only clears local composition state without requiring compositionend. Ignore compositionstart while read-only. This applies to the shell and standard panel composition so commands resume after cancellation, while ordinary active composition remains guarded.
