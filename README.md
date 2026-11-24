# Morfira WYSIWYG

[Русский](README.ru.md) · [Documentation](https://morfira-dev.github.io/morfira-wysiwyg/) · [Interactive playground](https://morfira-dev.github.io/morfira-wysiwyg/playground)

Morfira is an MIT-licensed rich text editor with an independently implemented TypeScript core and table engine. The core and plugins have zero runtime dependencies. The Vue, React, Svelte, and Angular adapters use their frameworks as peer dependencies. The Web Component runs without a framework.

## Getting started

```sh
pnpm add @morfira-dev/wysiwyg
```

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { tables, tableCommands } from '@morfira-dev/wysiwyg/plugins/tables';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/plugins/tables.css';

const editor = createEditor(document.querySelector<HTMLElement>('#editor')!, {
  value: '<p>Hello, Morfira!</p>',
  plugins: [tables()],
});

tableCommands(editor).insert(3, 3);
editor.setLocale('en', { 'tables.resizeColumn': 'Column width' });
```

The core import is safe without a DOM. Creating an editor requires a browser element. Use `editor.destroy()` when removing its host. See the [getting started guide](apps/docs/guide.md).

## Adapters and optional features

- Framework adapters use the `/vue`, `/react`, `/svelte`, and `/angular` subpaths. Angular 21 and 22 support standalone `MorfiraEditor`, two-way value binding, Reactive Forms, and `ngModel` via ControlValueAccessor. Use one value binding per instance. See the [adapter guide](apps/docs/adapters.md).
- The `/web-component` entry exports `defineMorfiraEditor()` for explicit browser registration. The light-DOM element has `value`, `readOnly`, `locale`, `translations`, and `plugins` properties and emits `value-change`, `change`, and `ready`. See the [Web Component setup](apps/docs/adapters.md#framework-free-web-component).
- Plugins use selective imports such as `/plugins/tables`, `/plugins/images`, `/plugins/search`, `/plugins/statistics`, `/plugins/markdown`, `/plugins/mentions`, `/plugins/slash`, and `/plugins/suggestions`. Image storage and suggestion providers are application-owned. Standalone Markdown import and export use `/codecs/markdown`. See [plugins](apps/docs/plugins.md) and the [Markdown codec](apps/docs/markdown-codec.md).
- Optional UI forms use `/ui/links`, `/ui/images`, `/ui/search`, and `/ui/forms.css`. Forms follow the editor's language and read-only state and keep drafts. Contextual controls for links, images, and tables use their own imports and an application-owned host. See [UI forms](apps/docs/ui.md), [links](apps/docs/contextual-links.md), [images](apps/docs/contextual-images.md), and [tables](apps/docs/contextual-tables.md).
- English and Russian editor labels are built in. Each editor accepts a locale and custom translations. Use `setLocale()` to update labels without altering the document or history and scoped `--mw-*` CSS variables to theme the editor. See [localization](apps/docs/localization.md) and [theming](apps/docs/theming.md).

New subpaths become available in npm as their packages are released. The repository uses workspace links during development.

## Local development

Use Node.js 22.20+ and pnpm 11.0.7.

```sh
pnpm install --frozen-lockfile
pnpm run docs:dev
```

The documentation site in `apps/docs` uses English at the root and Russian under `/ru/`. Both versions include live examples, a playground, and search. GitHub Actions deploys the site to GitHub Pages after the checks for `main` pass.

- `packages/core` contains the typed document, HTML and JSON validation, selection, transactions, history, and the plugin API.
- `packages/plugins` contains optional features, including the logical table grid and image commands.
- `packages/vue`, `packages/react`, `packages/svelte`, `packages/angular`, and `packages/web-component` contain the adapters.
- `packages/wysiwyg` provides the public package and subpath exports.
- `playground` contains browser fixtures. `specs` defines editing contracts and acceptance criteria.

## Verification

```sh
pnpm exec playwright install chromium firefox webkit
pnpm run check
pnpm run docs:build
pnpm run test:docs
```

`check:static` builds the packages and verifies project rules, declarations, types, package boundaries, tree shaking, and bundle budgets. `check` adds the editor and adapter browser suite. `docs:build:site` builds the site from existing package outputs. The CI matrix covers Chromium, Firefox, and WebKit, with separate documentation and installed-consumer jobs. See the [CI specification](specs/continuous-integration.md).

`size-report.json` tracks minified JavaScript, gzip, Brotli, and CSS separately. The core JavaScript limit is 200,000 gzip bytes and the optional entry and table JavaScript limit is 150,000 gzip bytes. The Standard and Extended profiles have separate limits of 90,000 and 110,000 gzip JavaScript bytes and 20,000 minified CSS bytes each. Each adapter has a 10,000 minified JavaScript byte limit, excluding framework runtimes.

Use `pnpm run consumers:check` and `pnpm run consumers:angular22` to check installed tarballs outside the workspace. Use `pnpm run benchmark -- --browser=chromium,firefox,webkit` for observational measurements. See [testing](apps/docs/testing.md) and [performance](apps/docs/performance.md).

## Document and extension contracts

The editor stores a versioned `EditorDocument` and validates HTML and JSON against its schema. Undo and redo cover input, formatting, paste, and plugin changes. Plugins use per-editor state with validated commands and transactions. See the [core API](apps/docs/api.md), [plugin SDK](apps/docs/plugin-sdk.md), and [security guide](apps/docs/security.md).

See the [roadmap](apps/docs/roadmap.md) for the supported scope and limitations. Physical-device and assistive-technology testing is pending.

## License

[MIT](LICENSE). See [third-party notices](THIRD_PARTY_NOTICES.md) for framework and tooling licenses.
