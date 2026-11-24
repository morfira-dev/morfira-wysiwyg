# Ready presets

A preset is a pure `EditorOptions` factory: it selects ready behavior, copies its owned configuration and returns fresh plugin definitions. `createEditor` creates the editor; UI is a separate opt-in. Factories create no DOM, global handlers, CSS, fonts or server requests.

| Import | Factory | Default capabilities |
| --- | --- | --- |
| `@morfira-dev/wysiwyg/presets/minimal` | `createMinimalPreset` | Core and explicitly supplied application plugins only |
| `@morfira-dev/wysiwyg/presets/standard` | `createStandardPreset` | Tables, images, search, statistics, Markdown shortcuts, autolink and horizontal rule |
| `@morfira-dev/wysiwyg/presets/extended` | `createExtendedPreset` | Standard plus mentions/slash with your provider functions |

These compose current features: Markdown shortcuts are not Markdown import/export, mentions remain ordinary editable text, and autolink supports native Space, controlled Enter and bounded plain-URL clipboard completion — [exact conditions](/autolink). Atomic mentions, node views, decorations and future video/formula modules are not silently included.

Optional [checklists](/checklists) are not part of these default sets yet. Pass `checklists()` explicitly through `plugins: [checklists()]` and import its CSS separately; controls in the full demo do not imply automatic preset loading.

Ready controls and a live example are described in [Modern editor UI](/editor-ui).

## Minimal: a small editor

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { createMinimalPreset } from '@morfira-dev/wysiwyg/presets/minimal';
import { createEditorUI } from '@morfira-dev/wysiwyg/ui/editor';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/ui/editor.css';

const editor = createEditor(editorHost, createMinimalPreset({
  value: '<p>Start writing</p>',
  locale: 'en',
}));
const ui = createEditorUI(toolbarHost, editor);

const dispose = () => {
  ui.destroy();
  editor.destroy();
};
```

`editorHost` and `toolbarHost` are distinct empty application elements. UI stays outside editable content. Minimal imports no optional behavior. Formatting, ordinary lists and links already belong to the current core; Minimal does not introduce another reduced editing engine.

Omit the UI factory to use the core API and your own controls. Importing a behavior preset never loads UI by itself.

## Standard: everyday editing

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { createStandardPreset } from '@morfira-dev/wysiwyg/presets/standard';
import { createStandardEditorUI } from '@morfira-dev/wysiwyg/ui/standard';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/plugins/tables.css';
import '@morfira-dev/wysiwyg/ui/editor.css';
import '@morfira-dev/wysiwyg/ui/forms.css';

const options = createStandardPreset({
  value: '<p>Document</p>',
  locale: 'en',
  markdown: { blocks: true, inline: true },
  autolink: { enabled: true },
});
const editor = createEditor(editorHost, options);
const ui = createStandardEditorUI(toolbarHost, editor);
```

Standard installs `tables`, `images`, `search`, `statistics`, `markdown-shortcuts`, `autolink`, `horizontal-rule`, then application plugins. Preset-only fields do not leak into `EditorOptions`: the result contains core settings and the composed `plugins` array.

Without `images.upload`, URL insertion remains available; actual file upload needs an application callback. The preset chooses no endpoint, sends no file and inserts no demo placeholder. Pass it as `images: { upload: applicationUpload }` following the [image contract](/images).

### Configuration and disabling features

| Option | Value | Behavior |
| --- | --- | --- |
| `tables` | `TableOptions` or `false` | Table diagnostics configuration; `false` omits the plugin |
| `images` | `ImageOptions` or `false` | Upload callback and `maxFileSize`; `false` omits the plugin |
| `search` | `boolean` | Enabled by default; `false` omits the plugin |
| `statistics` | `StatisticsOptions` or `false` | Text-segmentation locale, or omission |
| `markdown` | `MarkdownShortcutOptions` or `false` | `enabled`, `blocks`, `inline`, or omission |
| `autolink` | `AutolinkOptions` or `false` | `enabled`, or omission |
| `horizontalRule` | `boolean` | `false` omits the horizontal-rule command |

An omitted option enables that plugin with its normal defaults. `autolink: { enabled: false }` installs a disabled plugin with a preference API; `autolink: false` omits the plugin entirely.

The `search()` factory has no initial-query options. After creating the editor, use `searchCommands(editor).setQuery(...)` or the [ready form](/ui).

```ts
const options = createStandardPreset({
  images: false,
  search: false,
  statistics: false,
});
```

The ready Standard UI requires installed tables, images and search, and checks them before mounting. If those features are disabled, use `createEditorUI` with appropriate controls or application-owned UI.

**A configuration flag does not establish tree-shaking.** Standard statically imports its behavior implementations. For a smaller JS selection, compose Minimal with separate `/plugins/*` imports and measure that resulting bundle.

## Extended: application mentions and slash

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { createExtendedPreset } from '@morfira-dev/wysiwyg/presets/extended';
import { createExtendedEditorUI } from '@morfira-dev/wysiwyg/ui/extended';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/plugins/tables.css';
import '@morfira-dev/wysiwyg/plugins/suggestions.css';
import '@morfira-dev/wysiwyg/ui/editor.css';
import '@morfira-dev/wysiwyg/ui/forms.css';

const options = createExtendedPreset({
  locale: 'en',
  mentions: {
    provide: ({ query, signal }) => findPeople(query, signal),
    debounceMs: 120,
  },
  slash: {
    provide: ({ query, signal }) => findCommands(query, signal),
  },
});
const editor = createEditor(editorHost, options);
const ui = createExtendedEditorUI(toolbarHost, editor);
```

`findPeople` and `findCommands` belong to the application. Both configurations and both `provide` functions are required; returning `[]` explicitly supplies the empty state. Factories never call providers or issue requests. Plugins call them only after editor creation and the relevant interaction.

When `slash.actions` is omitted, a fresh `createSlashActions()` registry provides ordinary structural formatting: paragraph, heading1–heading6, bulletList, orderedList, blockquote and codeBlock. An explicit `actions` record is copied and **replaces** those defaults without an implicit merge. A provider may return only an action in its installed registry. Table/image slash actions are explicit application callbacks. See [suggestions and actions](/suggestions).

Extended orders Standard built-ins, `mentions`, `slash`, then application plugins. The behavior preset does not import menu views automatically. The example’s `createExtendedEditorUI` separately composes Standard UI and both suggestion menus; it requires installed mentions/slash and explicit `/plugins/suggestions.css`. For custom UI, separately import `createSuggestionMenu`, the chosen controller and `/plugins/suggestions.css`; provider keyboard behavior also works without a menu view.

## Core options and SDK

All presets accept normal `value`, `locale`, `translations`, `readOnly`, `placeholder`, `label`, `historyLimit`, `onChange`, plus `plugins` and `schema`. Each entry exports its options type: `MinimalPresetOptions`, `StandardPresetOptions`, `ExtendedPresetOptions`.

```ts
const options = createStandardPreset({
  plugins: [applicationPlugin],
  schema: applicationSchema,
  translations: { 'ui.editor.bold': 'Emphasize' },
  onChange: (change) => saveDraft(change.html),
});
```

Plugins and schema are installed before initial HTML import. Semantic attributes and typed commands follow the [SDK](/plugin-sdk). Presets add no second plugin resolver: core still rejects duplicate plugin/schema names before setup/mount. Factories reject unknown preset/feature options and malformed configuration shape; core performs full document/schema validation.

Every call returns fresh arrays and built-in plugin definitions. `translations`, directly supplied `schema` definitions, their attribute rules and enum arrays are copied. Callback functions and explicitly provided application plugin objects retain identity; the application remains responsible for their own per-instance behavior. Changing one returned preset does not change later factory results.

## SSR, frameworks and cleanup

Importing and calling factories is safe without `document`, Custom Elements or a framework runtime. Create the editor and UI after browser mount. Providers and upload callbacks are not invoked during configuration.

For wrappers, pass returned settings through the adapter's supported API. For example, `createExtendedPreset(configuration).plugins` is an ordinary plugin array accepted by Vue, React, Svelte, Angular and Web Component. Locale/value/read-only synchronization follows each [adapter contract](/adapters).

Presets do not own editor lifetime. Destroying UI leaves its editor usable; destroying the editor releases plugins and associated ready UI. Calling `ui.destroy()` before `editor.destroy()` is also supported; repeated UI destroy is safe.

## Size and limits

Measure headless presets, UI and the final deduplicated closure containing core, plugins, forms and required CSS separately. Keep framework runtimes, source maps, declarations, extra locale alternatives and fonts separate from editor JS.

The build enforces measured headless and ready profiles: Standard — at most 90000 gzip JS bytes; Extended — 110000 gzip JS bytes. On 2026-11-18 the user explicitly raised Standard from 65000 to 80000 bytes: the last measured largest selection of 64602 bytes has 15398 bytes of reserve instead of 398. This permits useful everyday features and maintainable code; avoiding unnecessary runtime dependencies, selective imports and tree-shaking remain mandatory. The original core 200000-byte and optional-entry 150000-byte gzip limits, adapter guards and CSS limits are unchanged; duplicate profile raw JS guards of 200000/350000 remain retired. Raw size remains a separately reported measurement. Each profile is limited to 20000 minified CSS bytes. Minimal is measured separately without an additional preset guard. Actual raw/gzip/Brotli/CSS sizes are saved in `size-report.json`; framework runtimes are excluded from these profiles.

### Current optimization measurements

The dated 2026-11-16 measurement below retains the 65000-byte guard used at that time. The 2026-11-18 policy change does not recalculate those results; new actual sizes are reported after building.

The 2026-11-16 build preserves the existing factories, plugins, features and test set. The largest standard selection decreased from **64999 to 64482 gzip JS bytes**: **517 bytes saved**, leaving **518 bytes** below 65000. The 2000-byte reserve target is **not met yet**. Production build and compression settings are unchanged; no new dependency was retained. CSS is unchanged.

| Selection | JS raw | JS gzip | JS Brotli | CSS raw | CSS gzip | CSS Brotli |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Core | 89148 | 27637 | 24281 | 3293 | 1164 | 962 |
| Standard ready | 200151 | 59394 | 50946 | 11504 | 3747 | 3038 |
| Standard + table context | 210933 | 62866 | 53729 | 12787 | 4322 | 3500 |
| Standard + fonts + list properties + LTR/RTL + text-context UI | 216326 | 64482 | 54754 | 11974 | 4019 | 3260 |
| Extended ready | 221339 | 65528 | 56052 | 12700 | 4239 | 3414 |

All values are decimal bytes from generated `size-report.json`; JS and CSS are separate, with shared chunks counted once per selected composition. Framework runtimes, source maps, declarations and fonts are excluded. The fonts/list-properties/LTR/RTL/contextual selection is explicit composition, not new Standard defaults. Core remains **9148 raw JS bytes** above its soft 80000-byte target. These measurements do not establish regression-test success or input performance; the complete `check` outcome and current example validation are recorded in `specs/verification-backlog.md`.

UI wraps by default; explicit `overflow: 'more'` enables verified priority-based whole-group overflow. The text [contextual toolbar](/contextual-toolbar), [link actions](/contextual-links), [image properties](/contextual-images) and [table panel](/contextual-tables) are separate optional modules outside preset defaults. Real mobile/IME and screen-reader behavior still needs dedicated verification. Full DOCX/PDF conversion, collaboration and office-style layout are outside these presets.

The [horizontal-rule command](/horizontal-rule) is included in standard/extended by default, with a ready toolbar button. `horizontalRule: false` omits its instance; a runtime flag does not erase static imports. Use selective composition for a narrower bundle.

Optional [font-family/size commands](/fonts) are also installed explicitly through `plugins: [fonts()]`, with no additional CSS. Configured commands provide a bounded px/family profile rather than a font loader; preset defaults and ready toolbar do not add them automatically.


Current user-approved Standard allowance (2026-11-23): **90000 gzip JS bytes**. The last measured largest Standard composition is 79961 bytes, leaving **10039 bytes**. Extended and all other guards are unchanged. Historical paragraphs retain their former thresholds.
