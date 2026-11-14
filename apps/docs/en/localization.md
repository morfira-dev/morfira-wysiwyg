# Interface localization

Language belongs to each editor instance. Russian and English strings are included without a global registry or an i18n-library dependency. Interface language does not translate the document or change Unicode-statistics configuration.

## Creation and live switching

```ts
import { createEditor, createToolbar } from '@morfira-dev/wysiwyg';
import { tables } from '@morfira-dev/wysiwyg/plugins/tables';

const editor = createEditor(editorHost, {
  locale: 'en-GB',
  value: '<p>Hello</p>',
  plugins: [tables()],
});
const disposeToolbar = createToolbar(toolbarHost, editor);

const stop = editor.events.on('localechange', ({ locale }) => {
  console.log('UI language:', locale);
});
editor.setLocale('ru');

// When removing the view:
stop();
disposeToolbar();
editor.destroy();
```

The default is `ru` to preserve previous behavior. String resolution follows `translations[key]` → exact language → base language → English. Therefore `en-GB` uses the English dictionary, while `de-CH`, which has no built-in dictionary, receives English strings until the application supplies translations. Language tags are validated and canonicalized with `Intl.getCanonicalLocales`.

`setLocale(locale, translations?)` **replaces** overrides: omitting its second argument clears previous overrides. Invalid tags or translation values are rejected before changing state. `getLocale()` and `localechange` provide independent snapshots. An equivalent configuration emits no duplicate event.

Changing language does not replace document DOM, emit document `change`, or reset selection or undo/redo. It works in read-only mode and during composition, but is rejected inside a document transaction. Menus update their existing elements while retaining active options and in-flight requests.

## Custom language and individual strings

```ts
import type { EditorTranslations } from '@morfira-dev/wysiwyg';

const spanish: EditorTranslations = {
  'editor.label': 'Editor de texto',
  'editor.placeholder': 'Empieza a escribir…',
  'toolbar.label': 'Formato',
  'toolbar.bold': 'Negrita',
  'tables.rowAbove': 'Insertar fila arriba',
  'suggestions.empty': 'Sin sugerencias',
};
editor.setLocale('es-MX', spanish);
```

Unspecified strings in this partial translation fall back to English. Supplied records are copied; mutating the application's object does not change installed translations. Strings use text DOM properties: `<strong>` in a translation remains literal text.

Explicit editor `label`/`placeholder`, custom `ToolbarAction.label`, `ToolbarOptions.label` and `SuggestionMenuOptions.labels` take precedence over built-in translations. These strings belong to the application and are not rewritten automatically. `SuggestionMenuOptions.locale: 'ru' | 'en'` pins an individual menu's language; otherwise the menu inherits the editor language. Previously a menu without locale always used English; it now inherits its instance configuration.

Mention/slash result labels, descriptions and application-provider errors remain application data. `createSlashActions()` contains callbacks rather than built-in option names. Localize your provider to rename these results. Table clipboard status is localized, while `onClipboardError` continues receiving the original diagnostic `Error`.

## Built-in key catalog

Import dictionaries to inspect keys or type a custom translation without loading other plugins:

```ts
import { editorMessages, toolbarMessages } from '@morfira-dev/wysiwyg';
import { tablesMessages } from '@morfira-dev/wysiwyg/plugins/tables';
import { suggestionMessages } from '@morfira-dev/wysiwyg/plugins/suggestions';

const tableKeys = Object.keys(tablesMessages.en);
```

| Key | Русский | English |
| --- | --- | --- |
| `editor.label` | Текстовый редактор | Text editor |
| `editor.placeholder` | Начните писать… | Start writing… |
| `toolbar.label` | Форматирование | Formatting |
| `toolbar.undo` | Отменить | Undo |
| `toolbar.redo` | Повторить | Redo |
| `toolbar.bold` | Полужирный | Bold |
| `toolbar.italic` | Курсив | Italic |
| `toolbar.underline` | Подчёркнутый | Underline |
| `toolbar.header` | Заголовок | Heading |
| `toolbar.bulletList` | Маркированный список | Bulleted list |
| `toolbar.orderedList` | Нумерованный список | Numbered list |
| `toolbar.indent` | Увеличить отступ | Increase indent |
| `toolbar.outdent` | Уменьшить отступ | Decrease indent |
| `toolbar.blockquote` | Цитата | Block quote |
| `toolbar.clear` | Очистить форматирование | Clear formatting |
| `tables.rowAbove` | Строка выше | Insert row above |
| `tables.rowBelow` | Строка ниже | Insert row below |
| `tables.columnLeft` | Столбец слева | Insert column left |
| `tables.columnRight` | Столбец справа | Insert column right |
| `tables.merge` | Объединить ячейки | Merge cells |
| `tables.split` | Разделить ячейку | Split cell |
| `tables.deleteRow` | Удалить строку | Delete row |
| `tables.deleteColumn` | Удалить столбец | Delete column |
| `tables.remove` | Удалить таблицу | Delete table |
| `tables.background` | Цвет ячейки | Cell color |
| `tables.border` | Цвет границы | Border color |
| `tables.resizeColumn` | Изменить ширину столбца | Resize column |
| `tables.clipboardError` | Не удалось скопировать или вставить диапазон таблицы. | Unable to copy or paste this table range. |
| `suggestions.label` | Подсказки | Suggestions |
| `suggestions.loading` | Загрузка подсказок… | Loading suggestions… |
| `suggestions.empty` | Нет подсказок | No suggestions |
| `suggestions.error` | Не удалось загрузить подсказки | Unable to load suggestions |
| `suggestions.results` | Подсказок: {count} | {count} suggestions |

Key types are `EditorTranslationKey`, `ToolbarTranslationKey`, `TablesMessageKey` and `SuggestionMessageKey` from their respective entries. Only the suggestion menu substitutes `{count}`; core has no general ICU/pluralization template engine.

## Localizing your plugin

```ts
import { localize } from '@morfira-dev/wysiwyg';

const messages = {
  en: { 'myPlugin.insert': 'Insert note' },
  es: { 'myPlugin.insert': 'Insertar nota' },
};
const update = () => {
  button.textContent = localize(editor.getLocale(), 'myPlugin.insert', messages);
};
const stopLocale = editor.events.on('localechange', update);
update();
// When removing the UI:
stopLocale();
```

The plugin owns its dictionary and subscription. The `myPlugin.*` namespace avoids collisions with built-in strings. An English fallback is required for each used key; the helper reports a missing string. Core does not import optional-module dictionaries.

## Try without replacing the document

Change “Editor interface language”: the default toolbar below changes its accessible labels. Article text and history stay unchanged. On the homepage, extended forms and custom laboratory labels remain in the page language because they are explicitly supplied.

<EditorDemo />
