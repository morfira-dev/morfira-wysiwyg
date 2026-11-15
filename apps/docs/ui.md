# Переиспользуемые UI-формы

Формы ссылок, изображений и поиска — готовый необязательный интерфейс поверх публичных команд редактора. Они не зависят от Vue/React/Angular/Svelte или CSS сайта документации. Главная страница и playground используют эти же фабрики.

Каждый JS-вход подключается отдельно. Стили импортируются явно; импорт UI не регистрирует глобальные элементы и безопасен на сервере. Создание формы требует браузерного DOM.

| Фабрика | Публичный вход | Требуемый плагин |
| --- | --- | --- |
| `createLinkForm` | `@morfira-dev/wysiwyg/ui/links` | Не нужен: используются команды ядра |
| `createImageForm` | `@morfira-dev/wysiwyg/ui/images` | `images()` |
| `createSearchForm` | `@morfira-dev/wysiwyg/ui/search` | `search()` |

Общий CSS: `@morfira-dev/wysiwyg/ui/forms.css`. Отсутствие необходимого плагина обнаруживается до монтирования формы. Ни один UI-модуль не требуется для работы ядра.

Контейнеры форм изображений и поиска должны находиться вне `editor.surface`: сама поверхность и её потомки отклоняются до монтирования и установки обработчиков. Используйте отдельный соседний контейнер. См. [границы безопасности](/security).

## Ссылки без фреймворка

Добавьте два пустых контейнера:

```html
<div id="link-editor"></div>
<div id="link-controls"></div>
```

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { createLinkForm } from '@morfira-dev/wysiwyg/ui/links';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/ui/forms.css';

const editor = createEditor(document.querySelector<HTMLElement>('#link-editor')!, {
  locale: 'ru', value: '<p>Выделите текст для ссылки.</p>',
});
const form = createLinkForm(document.querySelector<HTMLElement>('#link-controls')!, editor, {
  initialValues: { href: 'https://example.com', newTab: true },
  onError: (error) => console.error('Link command failed', error),
});

editor.setSelection(0, 8);
form.refresh();

const dispose = () => {
  form.destroy();
  editor.destroy();
};
// Вызовите dispose() при удалении экрана.
```

Форма создаёт/обновляет ссылку и снимает её, сохраняет выделение при переходе в поля. Заголовок, новая вкладка и URL используют существующую валидацию команд. Поле `text` нужно для новой ссылки без выделения; оно не заменяет текст существующей ссылки. Для `_blank` ядро сохраняет безопасный `rel`.

## Изображения и загрузка приложения

Контейнеры: `<div id="image-editor"></div>` и `<div id="image-controls"></div>`.

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { images } from '@morfira-dev/wysiwyg/plugins/images';
import type { ImageValue } from '@morfira-dev/wysiwyg/plugins/images';
import { createImageForm } from '@morfira-dev/wysiwyg/ui/images';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/ui/forms.css';

const editor = createEditor(document.querySelector<HTMLElement>('#image-editor')!, {
  locale: 'ru', value: '<p>Место для изображения.</p>',
  plugins: [images({
    maxFileSize: 5 * 1024 * 1024,
    upload: async (file, { signal }) => {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch('/api/uploads', { method: 'POST', body, signal });
      if (!response.ok) throw new Error('Upload endpoint rejected the file.');
      return await response.json() as ImageValue;
    },
  })],
});
const form = createImageForm(document.querySelector<HTMLElement>('#image-controls')!, editor, {
  initialValues: { src: '/assets/photo.png', alt: 'Описание', width: '320' },
});
editor.setSelection(0);

const dispose = () => {
  form.destroy();
  editor.destroy();
};
```

`/api/uploads` — пример API вашего приложения, не поставляемый сервер. Он должен вернуть `ImageValue` с URL и необязательными alt/размерами/подписью. Плагин проверяет возвращённые метаданные. Выбор файла не означает автоматическую загрузку в какое-либо внешнее хранилище Morfira: транспорт полностью принадлежит приложению.

Форма поддерживает URL, alt, подпись, размеры, вставку, обновление и удаление выбранного изображения, выбор файла и отмену. Пустые поля размеров снимают соответствующие ограничения при обновлении. Удаление формы отменяет только её собственный upload; поздний результат не вставляется. Resize мышью, crop и drag/drop не добавляются этим модулем.

Для своего интерфейса можно передать отдельный сигнал в `imageCommands(editor).upload(file, { signal })`; тип опций — `ImageUploadOptions`. Это отменяет именно данный запрос. `cancelUpload()` остаётся командой отмены текущей загрузки редактора. [Подробнее об изображениях](/images).

## Поиск и замена

Контейнеры: `<div id="search-editor"></div>` и `<div id="search-controls"></div>`.

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { search } from '@morfira-dev/wysiwyg/plugins/search';
import { createSearchForm } from '@morfira-dev/wysiwyg/ui/search';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/ui/forms.css';

const editor = createEditor(document.querySelector<HTMLElement>('#search-editor')!, {
  locale: 'ru', value: '<p>Один пример. Ещё один пример.</p>', plugins: [search()],
});
const form = createSearchForm(document.querySelector<HTMLElement>('#search-controls')!, editor, {
  initialValues: { query: 'пример', wholeWord: true },
});

const draft = form.getValues();
form.setValues({ replacement: 'текст' });

const dispose = () => {
  form.destroy();
  editor.destroy();
};
```

Запрос и параметры — drafts до нажатия «Найти». Если они отличаются от индексированного запроса, навигация/замена недоступны, чтобы случайно не заменить старые результаты. Enter в запросе запускает поиск; Enter в поле замены выполняет доступную замену текущего совпадения. IME-подтверждение не перехватывается.

Поиск, переходы и очистка доступны в read-only; замена заблокирована. Команды используют индекс совпадений, а не выделение внутри поля формы. Массовая замена отменяется одним Undo. Удаление UI не очищает состояние поиска, принадлежащее приложению. [Границы буквального поиска](/search).

## Контроллер и значения

Все фабрики возвращают контроллер одного жизненного цикла:

| Поле/метод | Назначение |
| --- | --- |
| `element` | Собственный корневой `HTMLElement`; можно добавить класс или изменить размещение |
| `getValues()` | Независимая копия текущих drafts |
| `setValues(partial)` | Частичное обновление drafts без изменения документа |
| `refresh()` | Обновить UI из актуального состояния редактора/плагина |
| `destroy()` | Снять подписки/обработчики и удалить только собственный UI; повторный вызов допустим |

После уничтожения остальные методы контроллера выбрасывают ошибку; старые DOM-кнопки не выполняют команды. Уничтожение редактора автоматически удаляет формы. При ручном удалении контейнера сначала вызовите `destroy()` — отключение произвольного DOM-узла не является автоматическим lifecycle-сигналом.

| Значения | Поля |
| --- | --- |
| `LinkFormValues` | `href`, `title`, `text`: string; `newTab`: boolean |
| `ImageFormValues` | `src`, `alt`, `caption`, `width`, `height`: string |
| `SearchFormValues` | `query`, `replacement`: string; `caseSensitive`, `wholeWord`: boolean |

Размеры в image drafts — строки полей ввода, а в `ImageValue` — числа. Такая разница сохраняет пустое/ошибочное поле для исправления пользователем; в документ попадают только проверенные значения. `initialValues`, необязательные `label` и `onError` находятся в соответствующих `LinkFormOptions`, `ImageFormOptions`, `SearchFormOptions`.

## Выделение, ошибки и встраивание

Формы — немодальные панели с `role="form"`, не вложенные HTML `<form>`. Их можно поставить внутрь формы приложения. Кнопки не отправляют её; Enter в полях обрабатывает локальное действие.

Ссылки и изображения запоминают настоящий DOM Range перед переходом в поля, включая пустые блоки и обратное выделение. Внешняя замена документа сбрасывает старую цель: сначала выберите место в новом документе. Ввод в поля и смена языка не должны перезаписывать drafts. Поиск использует пересчитанный индекс плагина и не восстанавливает устаревший Range.

Невалидная команда сохраняет документ и введённые поля. Пользователь видит локализованное сообщение; `onError` получает исходную диагностическую ошибку. Не выводите её через `innerHTML`. Формы не обещают полноценный аудит доступности или поддержку всех системных IME.

## Локализация и оформление

```ts
editor.setLocale('en', {
  'ui.links.href': 'Destination URL',
  'ui.images.caption': 'Caption',
  'ui.search.find': 'Find now',
});
```

Словари экспортируются как `linkFormMessages`, `imageFormMessages`, `searchFormMessages` из своих UI-входов; типы ключей — `LinkFormMessageKey`, `ImageFormMessageKey`, `SearchFormMessageKey`. Fallback и приоритет overrides соответствуют [общей локализации](/localization). Явный `options.label` имеет приоритет над словарём.

CSS ограничен `.mw-form`. Он использует общие `--mw-text`, `--mw-muted`, `--mw-surface`, `--mw-border`, `--mw-accent` и необязательные `--mw-form-font-size`, `--mw-form-gap`, `--mw-form-padding`, `--mw-form-radius`, `--mw-form-control-radius`, `--mw-form-error`. На главной и в [playground](/playground) показаны эти же публичные модули; дополнительный demo-engine подключать не требуется.

Для форматирования непустого выделения доступен отдельный [контекстный UI](/contextual-toolbar), а не новый behavior-плагин: `/ui/contextual` и явный `/ui/contextual.css`. Он не устанавливается пресетами и использует существующие команды/историю.

Для курсора внутри текстовой ссылки есть отдельные [контекстные действия ссылки](/contextual-links): `/ui/contextual-link`, явные core/forms/contextual-link CSS, безопасное открытие, существующая форма редактирования и удаление с Undo. Непустое выделение остаётся задачей текстовой панели; пресеты этот UI не подключают.
