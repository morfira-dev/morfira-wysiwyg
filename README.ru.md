# Morfira WYSIWYG

[English](README.md) · [Документация](https://morfira-dev.github.io/morfira-wysiwyg/ru/) · [Интерактивный редактор](https://morfira-dev.github.io/morfira-wysiwyg/ru/playground)

Morfira — редактор форматированного текста под лицензией MIT с самостоятельно реализованными ядром на TypeScript и табличной системой. У ядра и плагинов нет runtime-зависимостей. Адаптеры Vue, React, Svelte и Angular подключают фреймворки через peer dependencies. Web Component работает без фреймворка.

## Быстрый старт

```sh
pnpm add @morfira-dev/wysiwyg
```

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { tables, tableCommands } from '@morfira-dev/wysiwyg/plugins/tables';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/plugins/tables.css';

const editor = createEditor(document.querySelector<HTMLElement>('#editor')!, {
  value: '<p>Привет, Morfira!</p>',
  plugins: [tables()],
});

tableCommands(editor).insert(3, 3);
editor.setLocale('ru', { 'tables.resizeColumn': 'Ширина столбца' });
```

Импорт ядра безопасен без DOM. Создание редактора требует браузерного элемента. При удалении его контейнера вызывайте `editor.destroy()`. См. [быстрый старт](apps/docs/ru/guide.md).

## Адаптеры и дополнительные возможности

- Адаптеры фреймворков доступны через `/vue`, `/react`, `/svelte` и `/angular`. Angular 21 и 22 поддерживают standalone-компонент `MorfiraEditor`, двустороннюю привязку значения, Reactive Forms и `ngModel` через ControlValueAccessor. Используйте один способ привязки значения на экземпляр. См. [адаптеры](apps/docs/ru/adapters.md).
- `/web-component` экспортирует `defineMorfiraEditor()` для явной регистрации в браузере. Light-DOM-элемент имеет свойства `value`, `readOnly`, `locale`, `translations`, `plugins` и события `value-change`, `change`, `ready`. См. [подключение Web Component](apps/docs/ru/adapters.md#web-component-без-фреимворка).
- Плагины подключаются выборочными импортами: `/plugins/tables`, `/plugins/images`, `/plugins/search`, `/plugins/statistics`, `/plugins/markdown`, `/plugins/mentions`, `/plugins/slash` и `/plugins/suggestions`. Хранилище изображений и провайдеры подсказок принадлежат приложению. Независимый импорт и экспорт Markdown доступен через `/codecs/markdown`. См. [плагины](apps/docs/ru/plugins.md) и [Markdown-кодек](apps/docs/ru/markdown-codec.md).
- Готовые UI-формы подключаются через `/ui/links`, `/ui/images`, `/ui/search` и `/ui/forms.css`. Они учитывают язык и read-only редактора и сохраняют черновики. Контекстные панели ссылок, изображений и таблиц используют отдельные импорты и контейнер приложения. См. [формы](apps/docs/ru/ui.md), [ссылки](apps/docs/ru/contextual-links.md), [изображения](apps/docs/ru/contextual-images.md) и [таблицы](apps/docs/ru/contextual-tables.md).
- Английские и русские подписи встроены. Каждый редактор принимает локаль и пользовательские переводы. `setLocale()` обновляет подписи без изменения документа и истории; scoped CSS-переменные `--mw-*` позволяют настроить оформление. См. [локализация](apps/docs/ru/localization.md) и [темизация](apps/docs/ru/theming.md).

Новые subpath-импорты становятся доступны в npm по мере выпуска пакетов. При разработке в репозитории используются workspace-ссылки.

Готовый пример [поля редактора](apps/docs/ru/editor-field.md) объединяет подпись, ошибки, сохранение и панель. Отдельный `/content-view` с `/content-view.css` показывает сохранённый HTML/JSON без редактора; загрузка изображений и навигация по ссылкам включаются явно. См. [отображение контента](apps/docs/ru/content-view.md).

## Локальный запуск

Нужны Node.js 22.20+ и pnpm 11.0.7.

```sh
pnpm install --frozen-lockfile
pnpm run docs:dev
```

Сайт документации находится в `apps/docs`: английская версия — в корне, русская — под `/ru/`. Обе версии содержат живые примеры, интерактивный редактор и поиск.

## Документ и расширения

Редактор хранит версионированный `EditorDocument` и проверяет HTML и JSON по схеме. Undo и Redo охватывают ввод, форматирование, вставку и изменения плагинов. Состояние плагинов принадлежит экземпляру редактора; изменения выполняются через проверенные команды и транзакции. См. [API ядра](apps/docs/ru/api.md), [SDK плагинов](apps/docs/ru/plugin-sdk.md) и [безопасность](apps/docs/ru/security.md).

## Лицензия

[MIT](LICENSE). Лицензии фреймворков и инструментов перечислены в [сторонних уведомлениях](THIRD_PARTY_NOTICES.md).
