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
  overflow: 'more',
  groupPriorities: [100, 80, 60, 20],
  groups: [
    ['undo', 'redo'],
    ['bold', 'italic', 'underline'],
    ['block', 'list', 'align'],
    ['color', 'background', 'clear'],
  ],
});
```

Available builtin IDs: `undo`, `redo`, `bold`, `italic`, `underline`, `strike`, `code`, `subscript`, `superscript`, `blockquote`, `clear`, `indent`, `outdent`, `block`, `list`, `align`, `color`, `background`. `createDefaultEditorUIGroups()` returns fresh default groups. Duplicate/unknown identifiers are rejected during creation.

Group order defines toolbar order; `groupPriorities` separately defines overflow priority. `block` provides paragraphs, headings and code blocks; `list` provides no list, bullet and ordered lists; `align` provides the four current alignment values. Text/highlight colors use native color inputs and separate reset controls. A full custom palette is not implemented; priority overflow is explicitly enabled as above.

## Wrapping or More

`overflow: 'wrap'` is the default for shell, standard and extended: all groups remain visible with wrapping. `overflow: 'more'` explicitly measures the **toolbar host**, rather than the viewport. It moves existing whole groups into More without copying controls; order, listeners and state remain. An oversized group or extremely narrow host uses bounded wrapping.

Shell `groupPriorities` must contain exactly one finite number per group. Higher values retain groups longer; ties hide later groups first. Invalid modes, lengths or numbers reject before mounting. Standard/extended own their priorities; do not pass them a positional array:

```ts
import { createStandardEditorUI } from '@morfira-dev/wysiwyg/ui/standard';

const ui = createStandardEditorUI(toolbarHost, editor, { overflow: 'more' });
```

The native More disclosure has `aria-expanded` and `aria-controls`. Its nonmodal region contains ordinary buttons/selects/inputs, not ARIA menu items. Closed controls are excluded from navigation. Keyboard opening focuses the first enabled control; Escape closes it and returns focus to More. Outside interaction dismisses it without stealing focus; an action closes overflow while keeping focus in the editor or a newly opened form.

Measurement and opening do not change content, selection or history. An actively focused group stays in place during resize until focus leaves; preservation of an open OS picker during resize is not promised. `refresh()` recomputes widths and localized labels; call it explicitly without ResizeObserver. Destroy disconnects observers and scheduled callbacks. There are no new runtime dependencies, and headless core does not load overflow UI.

On the homepage and playground, **Toolbar layout** remounts only UI while preserving the editor, document, history and selection. The default is wrapping. Switching modes recreates open UI panels and their unsaved drafts; it does not replace the document. The separate [text contextual toolbar](/en/contextual-toolbar) is explicitly installed; changing the default overflow mode remains a future decision. [Table context actions](/en/contextual-tables) are explicitly installed separately. Exact IMG selection has separate [contextual image properties](/en/contextual-images).

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

The application defines these providers. If `slash.actions` is absent, the preset supplies the current structural `createSlashActions()` set. Extended UI owns two suggestion menus and the standard toolbar, but installs no behavior or provider. Do not mount a second menu for the same suggestion controller. Mentions retain plain text by default; explicit `mentions.persistent: true` in extended preset configuration enables [editable ID references](/en/persistent-mentions). The demo additionally enables [atomic navigation and deletion](/en/atomic-mentions); this is not a universal atom SDK. [Suggestions and limits](/en/suggestions).

## Selection, keyboard and state

The toolbar remembers the actual DOM Range and selection direction before controls take focus, including empty blocks. Only a valid target is restored before a mutation. External document replacement invalidates the old target and closes the Standard panel; select text in the editor again. Opening/closing panels and changing language/theme create no undo revision.

There is one roving toolbar tab stop. Arrow keys on button rows and Home/End move focus; Tab leaves the toolbar. Native selects/color inputs retain their own keys; **Alt+ArrowLeft/ArrowRight** moves between controls when the current control is native. Escape returns focus to the editor; inside an open Standard panel it first closes the panel and returns focus to its launcher. Outside interaction dismisses only the owned panel without stealing focus from the clicked target.

`aria-pressed` reflects active/mixed formats, and keyboard navigation skips disabled controls. Read-only blocks mutations while allowing search/navigation. Composition protects mutating controls, and Standard launchers avoid opening a distracting panel. Reusable controls create no nested native `<form>` and do not submit the application's form on Enter.

## Language, appearance and lifecycle

Built-in UI uses RU/EN catalogs `ui.editor.*` and `ui.standard.*`; forms use `ui.links.*`, `ui.images.*` and `ui.search.*`. `editor.setLocale(...)` updates labels/messages without replacing the document or drafts. Explicit `label` and custom action labels belong to the application; `label: (editor) => ...` can react to locale changes.

Density is `comfortable` or `compact`. Scoped CSS uses `--mw-*`: existing surface/text/accent/border/hover tokens plus `--mw-ui-font-size`, `--mw-ui-control-size`, `--mw-ui-icon-size`, `--mw-ui-padding`, `--mw-ui-group-gap`, `--mw-ui-control-gap`, `--mw-ui-control-radius`, `--mw-ui-radius`, `--mw-popup-surface`, `--mw-popup-shadow`, `--mw-ui-panel-padding`, `--mw-ui-error`. Theme changes do not rewrite content styles. Responsive wrapping, explicit More/priority overflow and reduced motion are supported; the separate [text contextual toolbar](/en/contextual-toolbar) is implemented with staged local validation recorded in the [roadmap](/en/roadmap#verification-and-limits); table context controls have a separate [explicit module](/en/contextual-tables); [contextual image properties](/en/contextual-images) are a separate explicit module.

Controllers expose `element`, `refresh()` and idempotent `destroy()`. Destroying UI leaves the editor and application-owned search state usable; editor destruction automatically disposes related UI. Detached controls are inert. Every subscription, form and menu has cleanup. Desktop browser tests do not certify mobile/IME or screen-reader behavior.

Measure minified JS, gzip, Brotli and CSS separately, counting shared chunks once. Framework runtimes, maps and declarations are excluded from runtime size. See [presets](/en/presets) for profile contents and limits.

You can separately install [link actions at the caret](/en/contextual-links): a validated address preview, Open/Edit/Remove and the existing form. This independent `/ui/contextual-link` changes neither presets nor ready toolbar; image/table contexts remain outside this first slice.


Explicit [contextual image properties](/en/contextual-images) add summary/Properties/Remove for exact native IMG selection, using edit-only forms and existing image commands. Presets remain unchanged; image drag resize/crop and broader node selection are not implied.

## Contextual table actions

The explicit [contextual table toolbar](/en/contextual-tables) adds row/column insertion and deletion, merge/split over the existing logical grid, native Range restoration and one-command Undo. Install `/ui/contextual-table` and its CSS alongside `tables()` and table CSS; presets are unchanged. `getTableSelection(editor, range?)` returns observational `TableSelectionState`, `registerSelectionHost(host)` owns external controls, and `tableSelectionChange` is a typed per-editor notification, not RPC. The guide documents spans, disabled states, keyboard/lifecycle restrictions and independent gzip budgets.


Optional [table size picker](/en/table-picker) uses an explicit factory and CSS import; [image clipboard/drop input](/en/image-input) delegates to the application-owned images upload callback. Neither changes preset defaults.


[Table and cell properties](/en/table-properties) use independent `/plugins/table-properties` and `/ui/table-properties` entries: table width/placement and selected-cell background/border color/vertical alignment. The form applies only dirty fields in one Undo, uses existing `/ui/forms.css`, and is outside preset defaults.

## Floating insertion UI and docked search

Use `presentation: 'floating'` in standard/extended UI for compact anchored link
and table popovers and an image dialog. The compatible default is `inline`.
Search is a **nonmodal strip below the toolbar**: it stays open while you edit or
click the document. It has no backdrop, inert document or focus trap. Escape or
Close dismisses it. Tables retain the grid and numeric dimensions 1–100. Popovers
fit the viewport and close on outside activation; modal image forms use native
dialog focus containment. Every operation retains normal validation and history.

```ts
const ui = createStandardEditorUI(host, editor, {
  presentation: 'floating',
  table: { picker: createTablePicker },
});
```

Both factories are independently imported from `/ui/standard` and `/ui/table-picker`;
include their documented CSS. `images.presentation` and `table.presentation` can
override the common setting for application-specific layout. No media embed or
video processing capability is implied by this presentation option.
