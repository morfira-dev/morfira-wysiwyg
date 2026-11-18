# Готовая панель редактора

Необязательный UI собирает готовый интерфейс поверх публичных команд редактора. Панель не устанавливает плагины, не меняет схему и не требует Vue/React/Svelte/Angular. Поведение выбирается через [пресеты](/presets), интерфейс — отдельным импортом. Главная и [playground](/playground) используют те же публичные фабрики.

## Выбор комплектации

| Импорт | Фабрика | Что подключается |
| --- | --- | --- |
| `@morfira-dev/wysiwyg/ui/editor` | `createEditorUI` | Небольшая панель форматирования и пользовательские действия |
| `@morfira-dev/wysiwyg/ui/standard` | `createStandardEditorUI` | Панель, формы ссылок/изображений/поиска и вставка таблицы |
| `@morfira-dev/wysiwyg/ui/extended` | `createExtendedEditorUI` | Standard UI и существующие меню mentions/slash |

`createEditorUI` не требует table/image/search/suggestion-плагинов. Standard проверяет `tables`, `images` и `search` **до монтажа DOM и listeners**. Extended дополнительно требует `mentions` и `slash`; провайдеры данных задаёт приложение. Если стандартный пресет отключает обязательный модуль, используйте настраиваемый shell вместо Standard UI.

Все импорты безопасны при SSR. Создание UI требует браузерного DOM и пустого host вне `editor.surface`. Непустой host отклоняется без замены содержимого приложения. UI не регистрирует глобальные custom elements и не выполняет сетевые запросы.

## Стандартный редактор

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { createStandardPreset } from '@morfira-dev/wysiwyg/presets/standard';
import { createStandardEditorUI } from '@morfira-dev/wysiwyg/ui/standard';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/plugins/tables.css';
import '@morfira-dev/wysiwyg/ui/editor.css';
import '@morfira-dev/wysiwyg/ui/forms.css';

const editor = createEditor(editorHost, createStandardPreset({
  locale: 'ru',
  value: '<p>Начните писать.</p>',
}));
const ui = createStandardEditorUI(toolbarHost, editor, {
  density: 'comfortable',
  images: { initialValues: { src: '/example.png', alt: 'Описание' } },
  table: { rows: 3, columns: 3 },
  onError: (error) => console.error(error),
});

const dispose = () => {
  ui.destroy();
  editor.destroy();
};
```

URL изображения — пример значения приложения, а не встроенный ассет. Без callback загрузки поддерживается вставка по URL. Для загрузки передайте свой `images.upload` в behavior preset; транспорт, endpoint и авторизация принадлежат приложению. Закрытие панели отменяет только запрос, начатый её формой, и не отменяет более новую загрузку приложения. [Контракт изображений](/images).

CSS импортируется явно. `editor.css` содержит shell и стандартные панели; `forms.css` — переиспользуемые формы. Стили документа/таблиц подключаются отдельно. JavaScript не вставляет styles или шрифты автоматически.

## Небольшой shell

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { createMinimalPreset } from '@morfira-dev/wysiwyg/presets/minimal';
import { createEditorUI } from '@morfira-dev/wysiwyg/ui/editor';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/ui/editor.css';

const editor = createEditor(editorHost, createMinimalPreset({ locale: 'ru' }));
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

Доступные builtin IDs: `undo`, `redo`, `bold`, `italic`, `underline`, `strike`, `code`, `subscript`, `superscript`, `blockquote`, `clear`, `indent`, `outdent`, `block`, `list`, `align`, `color`, `background`. `createDefaultEditorUIGroups()` возвращает свежие группы по умолчанию. Повторные/неизвестные идентификаторы отклоняются при создании.

Порядок групп задаёт порядок панели; `groupPriorities` отдельно задаёт их приоритет при overflow. `block` включает абзац, заголовки и блок кода; `list` — обычный текст, bullet и ordered list; `align` — четыре текущих варианта выравнивания. Цвет и выделение используют нативный color input и отдельный сброс. Полная custom palette пока не реализована; приоритетный overflow включается явно, как в примере.

## Перенос строк или «Ещё»

`overflow: 'wrap'` — значение по умолчанию для shell, standard и extended: все группы остаются видимыми с переносом строк. `overflow: 'more'` явно включает измерение ширины **host панели**, а не viewport. Панель переносит существующие целые группы в «Ещё» без копий controls; порядок, обработчики и состояние сохраняются. Очень широкая группа или узкий host используют ограниченный перенос строк.

В shell `groupPriorities` должен содержать ровно по одному конечному числу на группу. Большее число дольше сохраняет группу на панели; при равенстве раньше скрывается более поздняя группа. Неверный режим, длина или число отклоняются до монтажа. Standard/extended задают собственные приоритеты; позиционный массив им не передаётся:

```ts
import { createStandardEditorUI } from '@morfira-dev/wysiwyg/ui/standard';

const ui = createStandardEditorUI(toolbarHost, editor, { overflow: 'more' });
```

Нативная кнопка «Ещё» имеет `aria-expanded` и `aria-controls`. Это раскрываемая немодальная область с обычными кнопками/select/input, а не ARIA menu. Закрытые controls исключены из навигации. Открытие с клавиатуры переводит фокус к первому доступному control; Escape закрывает область и возвращает фокус кнопке «Ещё». Внешнее действие закрывает её без перехвата фокуса; команда закрывает overflow, сохраняя фокус редактора или открытой формы.

Измерение и открытие не меняют документ, выделение или историю. Фокусируемая группа остаётся на месте при resize до ухода фокуса; сохранение открытого системного picker при resize не обещается. `refresh()` повторно учитывает ширину и локализацию; без ResizeObserver его вызывают явно. Destroy отключает observer и запланированные callbacks. Новых runtime-зависимостей нет; headless-ядро не загружает overflow UI.

На главной и в playground переключатель **«Режим панели»** меняет только UI через destroy/remount, сохраняя редактор, документ, историю и выделение. Режим по умолчанию — перенос строк. При смене режима открытые UI-панели и их несохранённые черновики пересоздаются; это не замена документа. Отдельная [контекстная панель текста](/contextual-toolbar) подключается явно; изменение режима overflow по умолчанию остаётся будущим решением; [контекстные действия таблиц](/contextual-tables) подключаются отдельно. Для точного IMG есть отдельные [контекстные свойства](/contextual-images).

## Действие через SDK

ID пользовательского действия нужен только UI. Типизированная команда сохраняет собственную идентичность и проверку payload; новый строковый command bus не создаётся.

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
    label: 'Выделить полужирным',
    text: 'B+',
    run: (instance) => { instance.commands.execute(emphasize, undefined); },
    enabled: (instance) => instance.commands.getState(emphasize).enabled,
    pressed: (instance) => instance.commands.getState(emphasize).active,
  }]],
});
```

В cleanup вызовите `ui.destroy()` и `unregister()`. Custom action принимает `icon` из небольшого встроенного набора либо безопасный `text`, `enabled`, `pressed` и `mutates` (по умолчанию true). Для немутирующего действия можно задать `mutates: false`. Исходные ошибки передаются в `onError`; пользователь видит безопасное локализованное сообщение. Несколько изменений внутри одного действия оформляйте [SDK-командой/транзакцией](/plugin-sdk).

## Extended и меню подсказок

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
  locale: 'ru',
  mentions: { provide: applicationPeopleProvider },
  slash: { provide: applicationCommandProvider },
}));
const ui = createExtendedEditorUI(toolbarHost, editor, { density: 'compact' });
```

Провайдеры в примере определяет приложение. При отсутствии `slash.actions` preset подключает текущие структурные действия `createSlashActions()`. Extended UI владеет двумя меню подсказок и стандартной панелью, но не добавляет новые плагины или провайдеры. Не создавайте второе меню для того же suggestion controller. Текущие mentions остаются редактируемым текстом без постоянных ID/атомарного выделения. [Подсказки и ограничения](/suggestions).

## Выделение, клавиатура и состояние

Панель сохраняет настоящий DOM Range и направление выделения до перехода в controls, включая пустые блоки. Перед изменением восстанавливается только допустимая цель. Внешняя замена документа сбрасывает старую цель и закрывает Standard panel; повторно выделите текст в редакторе. Открытие/закрытие панели, смена языка и темы не создают undo-ревизии.

В toolbar один roving tab stop. Стрелки в ряду кнопок и Home/End перемещают фокус; Tab выходит из панели. Нативные select/color input сохраняют собственные клавиши; **Alt+ArrowLeft/ArrowRight** переводит фокус между controls, когда текущий control нативный. Escape возвращает фокус редактору; в открытой Standard panel сначала закрывает панель и возвращает фокус launcher-кнопке. Outside click закрывает только принадлежащую UI панель и не перехватывает фокус внешнего target.

`aria-pressed` отражает активный или mixed формат, disabled controls пропускаются клавиатурной навигацией. Read-only блокирует изменение документа; поиск/навигация остаются доступны. Во время composition mutating controls защищены редактором, а Standard launchers не открывают отвлекающую панель. Переиспользуемые формы не создают вложенных native `<form>` и не отправляют форму приложения по Enter.

## Язык, оформление и lifecycle

Builtin UI использует RU/EN-каталоги `ui.editor.*` и `ui.standard.*`, формы — свои `ui.links.*`, `ui.images.*`, `ui.search.*`. `editor.setLocale(...)` обновляет подписи и сообщения без замены документа и черновиков. Явный `label` и custom action labels принадлежат приложению; callback `label: (editor) => ...` позволяет им реагировать на locale.

Плотность — `comfortable` или `compact`. Scoped CSS использует `--mw-*`: существующие surface/text/accent/border/hover плюс `--mw-ui-font-size`, `--mw-ui-control-size`, `--mw-ui-icon-size`, `--mw-ui-padding`, `--mw-ui-group-gap`, `--mw-ui-control-gap`, `--mw-ui-control-radius`, `--mw-ui-radius`, `--mw-popup-surface`, `--mw-popup-shadow`, `--mw-ui-panel-padding`, `--mw-ui-error`. Стили документа не переписываются при смене темы. Поддерживаются responsive wrapping, явный More/priority overflow и reduced motion; отдельная [текстовая контекстная панель](/contextual-toolbar) реализована и прошла локальную поэтапную проверку, описанную в [дорожной карте](/roadmap#проверки-и-ограничения); контекстные инструменты таблиц имеют [отдельный модуль](/contextual-tables); [свойства изображения](/contextual-images) подключаются отдельным модулем.

Контроллеры предоставляют `element`, `refresh()` и идемпотентный `destroy()`. Destroy UI оставляет редактор и application-owned search state рабочими; editor destroy автоматически освобождает связанный UI. Отсоединённые controls инертны. Все подписки, формы и меню имеют cleanup. Desktop browser tests не являются сертификацией mobile/IME или скринридеров.

Размеры измеряются отдельно как minified JS, gzip, Brotli и CSS, с устранением общих чанков. Framework runtime, карты исходников и декларации не входят в runtime-size. Состав и ограничения профилей — на странице [пресетов](/presets).

Дополнительно можно явно подключить [действия ссылки у курсора](/contextual-links): просмотр безопасного адреса, Open/Edit/Remove и существующая форма. Это отдельный `/ui/contextual-link`, без изменения пресета или ready toolbar; image/table contexts остаются вне первого среза.


Явные [контекстные свойства изображения](/contextual-images) добавляют описание/Свойства/Удалить для точного нативного IMG-выделения, с edit-only формой и существующими командами images. Пресеты не меняются; resize/crop и более широкая модель выделения не подразумеваются.

## Контекстные действия таблиц

Явно подключаемая [контекстная панель таблиц](/contextual-tables) добавляет вставку/удаление строк и столбцов, merge/split поверх существующей логической сетки, восстановление native Range и один шаг Undo на команду. Подключите `/ui/contextual-table` и его CSS вместе с `tables()` и CSS таблиц; пресеты не меняются. `getTableSelection(editor, range?)` возвращает наблюдаемый `TableSelectionState`, `registerSelectionHost(host)` задаёт владение внешними контролами, а `tableSelectionChange` — типизированное уведомление экземпляра, не RPC. Гайд описывает spans, недоступные действия, клавиатуру/lifecycle и отдельные gzip-бюджеты.


Необязательный [выбор размера таблицы](/table-picker) подключается явным импортом фабрики и CSS; [вставка изображения из буфера/drop](/image-input) использует callback загрузки приложения. Пресеты автоматически их не включают.


[Свойства таблиц и ячеек](/table-properties) подключаются отдельными `/plugins/table-properties` и `/ui/table-properties`: ширина/расположение таблицы, фон/цвет границ/вертикальное выравнивание выбранных ячеек. Форма применяет только изменённые поля одним Undo, использует существующий `/ui/forms.css` и не входит в пресеты.
