# Ready presets

A preset is a pure `EditorOptions` factory: it selects ready behavior, copies its owned configuration and returns fresh plugin definitions. `createEditor` creates the editor; UI is a separate opt-in. Factories create no DOM, global handlers, CSS, fonts or server requests.

| Import | Factory | Default capabilities |
| --- | --- | --- |
| `@morfira-dev/wysiwyg/presets/minimal` | `createMinimalPreset` | Core and explicitly supplied application plugins only |
| `@morfira-dev/wysiwyg/presets/standard` | `createStandardPreset` | Tables, images, search, statistics, Markdown shortcuts and autolink |
| `@morfira-dev/wysiwyg/presets/extended` | `createExtendedPreset` | Standard plus mentions/slash with your provider functions |

These compose current features: Markdown shortcuts are not Markdown import/export, mentions remain ordinary editable text, and autolink runs after a native Space. Atomic mentions, node views, decorations and future video/formula modules are not silently included.

Ready controls and a live example are described in [Modern editor UI](/en/editor-ui).

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

Standard installs `tables`, `images`, `search`, `statistics`, `markdown-shortcuts`, `autolink`, then application plugins. Preset-only fields do not leak into `EditorOptions`: the result contains core settings and the composed `plugins` array.

Without `images.upload`, URL insertion remains available; actual file upload needs an application callback. The preset chooses no endpoint, sends no file and inserts no demo placeholder. Pass it as `images: { upload: applicationUpload }` following the [image contract](/en/images).

### Configuration and disabling features

| Option | Value | Behavior |
| --- | --- | --- |
| `tables` | `TableOptions` or `false` | Table diagnostics configuration; `false` omits the plugin |
| `images` | `ImageOptions` or `false` | Upload callback and `maxFileSize`; `false` omits the plugin |
| `search` | `boolean` | Enabled by default; `false` omits the plugin |
| `statistics` | `StatisticsOptions` or `false` | Text-segmentation locale, or omission |
| `markdown` | `MarkdownShortcutOptions` or `false` | `enabled`, `blocks`, `inline`, or omission |
| `autolink` | `AutolinkOptions` or `false` | `enabled`, or omission |

An omitted option enables that plugin with its normal defaults. `autolink: { enabled: false }` installs a disabled plugin with a preference API; `autolink: false` omits the plugin entirely.

The `search()` factory has no initial-query options. After creating the editor, use `searchCommands(editor).setQuery(...)` or the [ready form](/en/ui).

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

When `slash.actions` is omitted, a fresh `createSlashActions()` registry provides ordinary structural formatting: paragraph, heading1–heading6, bulletList, orderedList, blockquote and codeBlock. An explicit `actions` record is copied and **replaces** those defaults without an implicit merge. A provider may return only an action in its installed registry. Table/image slash actions are explicit application callbacks. See [suggestions and actions](/en/suggestions).

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

Plugins and schema are installed before initial HTML import. Semantic attributes and typed commands follow the [SDK](/en/plugin-sdk). Presets add no second plugin resolver: core still rejects duplicate plugin/schema names before setup/mount. Factories reject unknown preset/feature options and malformed configuration shape; core performs full document/schema validation.

Every call returns fresh arrays and built-in plugin definitions. `translations`, directly supplied `schema` definitions, their attribute rules and enum arrays are copied. Callback functions and explicitly provided application plugin objects retain identity; the application remains responsible for their own per-instance behavior. Changing one returned preset does not change later factory results.

## SSR, frameworks and cleanup

Importing and calling factories is safe without `document`, Custom Elements or a framework runtime. Create the editor and UI after browser mount. Providers and upload callbacks are not invoked during configuration.

For wrappers, pass returned settings through the adapter's supported API. For example, `createExtendedPreset(configuration).plugins` is an ordinary plugin array accepted by Vue, React, Svelte, Angular and Web Component. Locale/value/read-only synchronization follows each [adapter contract](/en/adapters).

Presets do not own editor lifetime. Destroying UI leaves its editor usable; destroying the editor releases plugins and associated ready UI. Calling `ui.destroy()` before `editor.destroy()` is also supported; repeated UI destroy is safe.

## Size and limits

Measure headless presets, UI and the final deduplicated closure containing core, plugins, forms and required CSS separately. Keep framework runtimes, source maps, declarations, extra locale alternatives and fonts separate from editor JS.

Working targets: Standard — 200000 minified / 65000 gzip JS bytes and 20000 minified CSS bytes; Extended — 350000 / 110000 JS bytes. They become enforced guards only after a concrete profile is defined and measured; this guide does not change build limits. Report actual size/check results from completed builds.

Responsive wrapping does not imply a priority/More overflow menu or contextual bubbles. Real mobile/IME and screen-reader behavior still needs dedicated verification. Full DOCX/PDF conversion, collaboration and office-style layout are outside these presets.
