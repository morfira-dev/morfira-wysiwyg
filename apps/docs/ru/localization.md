# Локализация интерфейса

Язык — состояние конкретного редактора. Встроены русские и английские подписи; глобального реестра и зависимости от i18n-библиотеки нет. Язык документа, его содержимое и настройки Unicode-статистики не меняются вместе с языком интерфейса.

## Создание и переключение

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

// При удалении представления:
stop();
disposeToolbar();
editor.destroy();
```

По умолчанию используется `ru`, чтобы сохранить прежнее поведение. При поиске строки приоритет такой: `translations[key]` → точный язык → базовый язык → английский. Поэтому `en-GB` использует английский словарь, а неизвестный встроенным словарям `de-CH` получает английские строки, пока приложение не передаст перевод. Языковые теги проверяются и приводятся к каноническому виду через `Intl.getCanonicalLocales`.

`setLocale(locale, translations?)` **заменяет** overrides: без второго аргумента прежние overrides очищаются. Невалидный тег или значения переводов отклоняются до изменения состояния. `getLocale()` и событие `localechange` возвращают независимые snapshots. Эквивалентная настройка не создаёт повторное событие.

Смена языка не заменяет DOM документа, не создаёт `change`, не сбрасывает выделение или undo/redo. Она доступна в read-only и во время composition, но запрещена внутри document transaction. Меню обновляют свои элементы, сохраняя активный вариант и выполняющийся запрос.

## Свой язык и отдельные строки

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

Остальные строки этого частичного перевода будут английскими. Переданные записи копируются; изменение объекта приложения не изменяет установленный перевод. Строки выводятся через текстовые DOM-свойства: `<strong>` в переводе останется буквальным текстом.

Явные `label`/`placeholder` редактора, пользовательские `ToolbarAction.label`, `ToolbarOptions.label` и `SuggestionMenuOptions.labels` имеют приоритет над встроенными переводами. Они принадлежат приложению и не переписываются автоматически. `SuggestionMenuOptions.locale: 'ru' | 'en'` фиксирует язык конкретного меню; без него меню наследует язык редактора. Раньше меню подсказок без locale всегда было английским — теперь оно наследует настройку экземпляра.

Подписи результатов mention/slash, descriptions и ошибки application provider остаются данными приложения. `createSlashActions()` содержит функции, а не встроенные названия пунктов. Для переименования таких результатов локализуйте свой provider. Clipboard status таблиц локализуется, а `onClipboardError` по-прежнему получает первоначальный диагностический `Error`.

## Каталог встроенных ключей

Словари можно импортировать для просмотра ключей или типизации собственного перевода. Это не подключает другие плагины:

```ts
import { editorMessages, toolbarMessages } from '@morfira-dev/wysiwyg';
import { tablesMessages } from '@morfira-dev/wysiwyg/plugins/tables';
import { suggestionMessages } from '@morfira-dev/wysiwyg/plugins/suggestions';

const tableKeys = Object.keys(tablesMessages.en);
```

| Ключ | Русский | English |
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

Типы ключей: `EditorTranslationKey`, `ToolbarTranslationKey`, `TablesMessageKey`, `SuggestionMessageKey` из соответствующих входов. `{count}` подставляет только меню подсказок; общего ICU/pluralization-шаблонизатора в ядре нет.

## Локализация своего плагина

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
// При удалении UI:
stopLocale();
```

Плагин владеет словарём и подпиской. Ключи пространства `myPlugin.*` избегают пересечения со встроенными строками. Английский fallback обязателен для используемого ключа; helper сообщает об отсутствующей строке. Ядро не импортирует словари необязательных модулей.

## Попробовать без замены документа

Переключите «Язык интерфейса редактора»: стандартная панель ниже изменит доступные подписи. Текст статьи и история останутся прежними. На главной расширенные формы и пользовательские подписи стенда остаются на языке страницы — они переданы явно.

<EditorDemo />
