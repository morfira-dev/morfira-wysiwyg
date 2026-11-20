# Special characters

`createSpecialCharacterUI` is a separate panel for typographic, mathematical and currency symbols such as ©, ™, €, and ±. It provides search, keyboard navigation and localized names. Insertion uses ordinary text through existing editor operations: no new node type, HTML widget or service markup is stored in the document.

The module is optional and is not installed by core or presets. On the homepage and in the [playground](/en/playground), open “Special characters”: the sample selects “amount” so one activation can replace it with €. Executed validation and measured sizes are recorded separately; a working example does not establish coverage of every device or accessibility tool.

## Setup

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { createSpecialCharacterUI } from '@morfira-dev/wysiwyg/ui/special-characters';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/ui/special-characters.css';

const editor = createEditor(editorHost, {
  locale: 'en',
  value: '<p>Price: </p>',
});
const panel = createSpecialCharacterUI(characterHost, editor, {
  onError: (error) => console.error(error),
});

const dispose = () => {
  panel.destroy();
  editor.destroy();
};
```

`characterHost` must be an empty connected HTML element in the editor's document, outside its content. No additional plugin is required. JavaScript does not import CSS automatically; the module loads no fonts and adds no runtime dependencies.

## API

| Export | Purpose |
| --- | --- |
| `createSpecialCharacterUI(host, editor, options?)` | Create the panel and its instance-owned subscriptions |
| `SpecialCharacter` | Catalog item: `id`, `text`, `label` |
| `SpecialCharacterUIOptions` | Optional `label`, `characters`, `onError` |
| `SpecialCharacterUIController` | `element`, `refresh()`, `destroy()` |
| `SpecialCharacterUIMessageKey` | Localized panel message key |
| `specialCharacterUIMessages` | Built-in RU/EN messages |

`label` supplies an application-owned group name. Without `characters`, a small built-in catalog is used. `refresh()` updates the panel against its active editor; it does not authorize a stale selection. `destroy()` is idempotent and releases the panel's listeners, subscriptions and DOM. Do not reuse a disposed controller. Destroying the editor also cleans up its owned panel.

## Custom catalog

```ts
import { createSpecialCharacterUI } from '@morfira-dev/wysiwyg/ui/special-characters';
import type { SpecialCharacter } from '@morfira-dev/wysiwyg/ui/special-characters';

const characters: readonly SpecialCharacter[] = [
  { id: 'euro', text: '€', label: 'Euro' },
  { id: 'copyright', text: '©', label: 'Copyright' },
  { id: 'angle-pair', text: '<>', label: 'Angle brackets' },
];
const panel = createSpecialCharacterUI(characterHost, editor, { characters });
```

The catalog replaces the built-in one and is copied during setup. Later application changes do not alter an existing instance. Allow 1–256 entries with unique nonempty ASCII IDs, at most 64 characters. Labels must be nonempty strings of at most 160 UTF-16 units; inserted text is bounded to 16 Unicode code points and 64 UTF-16 units. Control characters, line/paragraph separators, bidi embedding/override/isolate controls and unpaired surrogates are rejected. This is a catalog of short textual symbols, not an HTML-template or long-snippet inserter.

Custom labels belong to the application and are not translated automatically. The example's `<>` is inserted literally, without HTML interpretation. Displaying a glyph requires a suitable application font; the module does not guarantee every symbol exists in system fonts.

## Selection, Undo and safety

Select text or place the caret in a supported text context, then use search and a character button. The panel saves a native Range before focus moves to its controls. Both endpoints must stay in one ordinary text flow: a paragraph/heading, list body, quote or cell; inline marks and links are preserved. Cross-block ranges and rectangular cell selections are unsupported. This is not a general replacement policy for selected tables, images, structural intervals or protected semantic nodes; atomic mentions cannot be partially replaced through this panel.

One insertion creates one history step and one user-change notification. Undo restores the original document and selection, including its direction. Search, catalog navigation and locale refresh never modify the document or history. External document replacement invalidates the remembered target: a fresh editor selection is required before another insertion. A retained stale button cannot insert into replacement content or another instance.

Read-only and IME composition block insertion while search remains observational. Guards are checked again after restoring focus; application callbacks cannot replace the document/selection and authorize an insertion at the old target. Names and symbols use text rendering, and insertion delegates to validated core operations. This is neither a server trust boundary nor a security certification.

## Keyboard and localization

Search matches the symbol, ID and current label literally, without regular expressions. Eight columns use roving tabindex: Tab enters the catalog, arrows move focus, Home/End reach row edges, and Ctrl/Meta+Home/End reach the entire filtered set's edges. Enter/Space activate the native button. Escape restores a still-valid saved editor selection; it does not revive stale targets.

Built-in captions follow `editor.setLocale('ru' | 'en')` and the editor's translation overrides. Locale changes retain the query and insertion target. Appearance uses scoped `--mw-*` variables, and panel CSS works without documentation-site styles. Native controls and keyboard scenarios do not establish full screen-reader, touch-device or arbitrary zoom accessibility.

## Size boundaries

Measure `/ui/special-characters` with its selected shared helpers and the separate `standard-special-characters-ready` profile, counting shared chunks once. This does not promise that every combination of optional modules fits the standard profile. See [architecture and size](/en/architecture) and [testing](/en/testing) for measurement rules and current validation.

## Dialog presentation

For an initially closed native dialog, pass `presentation: 'dialog'`, then call
`ui.open()` from an application button. `ui.close()` dismisses it; `ui.isOpen()`
reports visibility. Inline stays the default. Open preserves the editor target
before focusing search; insertion closes the dialog and returns the document
caret. Escape/Close cancels without history. External replacement, read-only and
destruction invalidate the target. Native dialog support is required; no polyfill
is included. The homepage/playground use this mode.
