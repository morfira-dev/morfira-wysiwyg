# Ready editor toolbar

Optional UI composes a ready interface over the editor's public commands. It installs no plugins, changes no schema and requires no Vue/React/Svelte/Angular runtime. Choose behavior through [presets](/en/presets), and import its interface separately. The homepage and [playground](/en/playground) use the same public factories.

## Choose a composition

| Import | Factory | What it loads |
| --- | --- | --- |
| `@morfira-dev/wysiwyg/ui/editor` | `createEditorUI` | Small formatting toolbar and application actions |
| `@morfira-dev/wysiwyg/ui/standard` | `createStandardEditorUI` | Toolbar, link/image/search forms and table insertion |
| `@morfira-dev/wysiwyg/ui/extended` | `createExtendedEditorUI` | Standard UI plus current mention/slash menus |

`createEditorUI` requires no table/image/search/suggestion plugins. Standard validates `tables`, `images` and `search` **before mounting DOM or listeners**. Extended additionally requires `mentions` and `slash`; the application supplies their providers. If a standard preset disables required behavior, use the configurable shell instead of Standard UI.

Imports are SSR-safe. Mounting requires browser DOM and an empty host outside `editor.surface`. A nonempty host is rejected without replacing application content. UI imports register no global custom elements and make no network requests.

## Standard editor

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { createStandardPreset } from '@morfira-dev/wysiwyg/presets/standard';
import { createStandardEditorUI } from '@morfira-dev/wysiwyg/ui/standard';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/plugins/tables.css';
import '@morfira-dev/wysiwyg/ui/editor.css';
import '@morfira-dev/wysiwyg/ui/forms.css';

const editor = createEditor(editorHost, createStandardPreset({
  locale: 'en',
  value: '<p>Start writing.</p>',
}));
const ui = createStandardEditorUI(toolbarHost, editor, {
  density: 'comfortable',
  images: { initialValues: { src: '/example.png', alt: 'Description' } },
  table: { rows: 3, columns: 3 },
  onError: (error) => console.error(error),
});

const dispose = () => {
  ui.destroy();
  editor.destroy();
};
```

The image URL is application data, not a bundled asset. URL insertion works without an upload callback. For uploads, pass your `images.upload` into the behavior preset; transport, endpoint and authorization belong to the application. Closing a panel cancels only its form's request and cannot cancel a newer application upload. [Image contract](/en/images).

CSS imports are explicit. `editor.css` contains the shell and standard panels; `forms.css` contains reusable forms. Content/table styles are separate. JavaScript injects no styles or fonts.

## Small shell

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { createMinimalPreset } from '@morfira-dev/wysiwyg/presets/minimal';
import { createEditorUI } from '@morfira-dev/wysiwyg/ui/editor';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/ui/editor.css';

const editor = createEditor(editorHost, createMinimalPreset({ locale: 'en' }));
const ui = createEditorUI(toolbarHost, editor, {
  density: 'compact',
  groups: [
    ['undo', 'redo'],
    ['bold', 'italic', 'underline'],
    ['block', 'list', 'align'],
    ['color', 'background', 'clear'],
  ],
});
```

Available builtin IDs: `undo`, `redo`, `bold`, `italic`, `underline`, `strike`, `code`, `subscript`, `superscript`, `blockquote`, `clear`, `indent`, `outdent`, `block`, `list`, `align`, `color`, `background`. `createDefaultEditorUIGroups()` returns fresh default groups. Duplicate/unknown identifiers are rejected during creation.

Group order describes toolbar order, not command priority. `block` provides paragraphs, headings and code blocks; `list` provides no list, bullet and ordered lists; `align` provides the four current alignment values. Text/highlight colors use native color inputs and separate reset controls. A full custom palette and priority overflow are not implemented yet.

## An action using the SDK

Application action IDs identify UI only. The typed command keeps its own identity and payload validation; there is no second string command bus.

```ts
import { createEditorCommand } from '@morfira-dev/wysiwyg';
import { createEditorUI } from '@morfira-dev/wysiwyg/ui/editor';

const emphasize = createEditorCommand<void>('app:emphasize');
const unregister = editor.commands.register(emphasize, {
  validate: (payload) => {
    if (payload !== undefined) throw new TypeError('Expected no payload.');
  },
  execute: (instance) => instance.format('bold', true),
  isEnabled: (instance) => (instance.getSelection()?.length ?? 0) > 0,
  isActive: (instance) => Boolean(instance.getFormats().bold),
});
const ui = createEditorUI(toolbarHost, editor, {
  groups: [['undo', 'redo'], [{
    id: 'app:emphasize',
    label: 'Emphasize selection',
    text: 'B+',
    run: (instance) => { instance.commands.execute(emphasize, undefined); },
    enabled: (instance) => instance.commands.getState(emphasize).enabled,
    pressed: (instance) => instance.commands.getState(emphasize).active,
  }]],
});
```

Call `ui.destroy()` and `unregister()` during cleanup. A custom action accepts an `icon` from the small built-in set or safe `text`, plus `enabled`, `pressed` and `mutates` (default true). Set `mutates: false` for non-mutating actions. Original errors go to `onError`; users see a safe localized message. Compose multiple changes through an [SDK command/transaction](/en/plugin-sdk).

## Extended suggestion menus

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { createExtendedPreset } from '@morfira-dev/wysiwyg/presets/extended';
import { createExtendedEditorUI } from '@morfira-dev/wysiwyg/ui/extended';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/plugins/tables.css';
import '@morfira-dev/wysiwyg/plugins/suggestions.css';
import '@morfira-dev/wysiwyg/ui/editor.css';
import '@morfira-dev/wysiwyg/ui/forms.css';

const editor = createEditor(editorHost, createExtendedPreset({
  locale: 'en',
  mentions: { provide: applicationPeopleProvider },
  slash: { provide: applicationCommandProvider },
}));
const ui = createExtendedEditorUI(toolbarHost, editor, { density: 'compact' });
```

The application defines these providers. If `slash.actions` is absent, the preset supplies the current structural `createSlashActions()` set. Extended UI owns two suggestion menus and the standard toolbar, but installs no behavior or provider. Do not mount a second menu for the same suggestion controller. Current mentions remain editable text without durable IDs or atomic selection. [Suggestions and limits](/en/suggestions).

## Selection, keyboard and state

The toolbar remembers the actual DOM Range and selection direction before controls take focus, including empty blocks. Only a valid target is restored before a mutation. External document replacement invalidates the old target and closes the Standard panel; select text in the editor again. Opening/closing panels and changing language/theme create no undo revision.

There is one roving toolbar tab stop. Arrow keys on button rows and Home/End move focus; Tab leaves the toolbar. Native selects/color inputs retain their own keys; **Alt+ArrowLeft/ArrowRight** moves between controls when the current control is native. Escape returns focus to the editor; inside an open Standard panel it first closes the panel and returns focus to its launcher. Outside interaction dismisses only the owned panel without stealing focus from the clicked target.

`aria-pressed` reflects active/mixed formats, and keyboard navigation skips disabled controls. Read-only blocks mutations while allowing search/navigation. Composition protects mutating controls, and Standard launchers avoid opening a distracting panel. Reusable controls create no nested native `<form>` and do not submit the application's form on Enter.

## Language, appearance and lifecycle

Built-in UI uses RU/EN catalogs `ui.editor.*` and `ui.standard.*`; forms use `ui.links.*`, `ui.images.*` and `ui.search.*`. `editor.setLocale(...)` updates labels/messages without replacing the document or drafts. Explicit `label` and custom action labels belong to the application; `label: (editor) => ...` can react to locale changes.

Density is `comfortable` or `compact`. Scoped CSS uses `--mw-*`: existing surface/text/accent/border/hover tokens plus `--mw-ui-font-size`, `--mw-ui-control-size`, `--mw-ui-icon-size`, `--mw-ui-padding`, `--mw-ui-group-gap`, `--mw-ui-control-gap`, `--mw-ui-control-radius`, `--mw-ui-radius`, `--mw-popup-surface`, `--mw-popup-shadow`, `--mw-ui-panel-padding`, `--mw-ui-error`. Theme changes do not rewrite content styles. Responsive wrapping and reduced motion are supported; More/priority overflow and contextual bubbles remain follow-up work.

Controllers expose `element`, `refresh()` and idempotent `destroy()`. Destroying UI leaves the editor and application-owned search state usable; editor destruction automatically disposes related UI. Detached controls are inert. Every subscription, form and menu has cleanup. Desktop browser tests do not certify mobile/IME or screen-reader behavior.

Measure minified JS, gzip, Brotli and CSS separately, counting shared chunks once. Framework runtimes, maps and declarations are excluded from runtime size. See [presets](/en/presets) for profile contents and limits.
