# Готовые пресеты

Пресет — чистая фабрика `EditorOptions`: он выбирает готовое поведение, копирует свою конфигурацию и возвращает новые определения плагинов. Редактор создаёт `createEditor`, а панель подключается отдельно. Фабрики не создают DOM, не устанавливают глобальные обработчики, не загружают CSS, шрифты или данные с сервера.

| Импорт | Фабрика | Состав по умолчанию |
| --- | --- | --- |
| `@morfira-dev/wysiwyg/presets/minimal` | `createMinimalPreset` | Только ядро и явно переданные плагины приложения |
| `@morfira-dev/wysiwyg/presets/standard` | `createStandardPreset` | Таблицы, изображения, поиск, статистика, Markdown shortcuts, autolink, разделитель |
| `@morfira-dev/wysiwyg/presets/extended` | `createExtendedPreset` | Standard плюс mentions и slash с вашими provider-функциями |

Это композиции текущих возможностей: Markdown shortcuts не являются Markdown import/export, mentions сохраняют обычный редактируемый текст, autolink поддерживает нативный Space, контролируемый Enter и ограниченную plain-URL вставку из буфера — [точные условия](/autolink). Атомарные mentions, node views, decorations и будущие видео/формулы автоматически не добавляются.

Необязательные [чек-листы](/checklists) пока не входят в эти наборы по умолчанию. Подключай `checklists()` через явный `plugins: [checklists()]` и импортируй его CSS отдельно; наличие кнопок в полной демке не означает автоматическую загрузку в пресете.

Готовые контролы и живой пример — на странице [«Современная панель»](/editor-ui).

## Minimal: небольшой редактор

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { createMinimalPreset } from '@morfira-dev/wysiwyg/presets/minimal';
import { createEditorUI } from '@morfira-dev/wysiwyg/ui/editor';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/ui/editor.css';

const editor = createEditor(editorHost, createMinimalPreset({
  value: '<p>Начните писать</p>',
  locale: 'ru',
}));
const ui = createEditorUI(toolbarHost, editor);

const dispose = () => {
  ui.destroy();
  editor.destroy();
};
```

`editorHost` и `toolbarHost` — разные пустые элементы приложения. Панель располагается вне редактируемой области. Minimal не импортирует необязательные плагины. Форматирование, обычные списки и ссылки уже являются возможностями текущего ядра; название Minimal не означает новую урезанную версию движка.

Панель можно не создавать: используйте API ядра и свои кнопки. Импорт behavior-пресета сам по себе не загружает UI.

## Standard: обычное редактирование

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { createStandardPreset } from '@morfira-dev/wysiwyg/presets/standard';
import { createStandardEditorUI } from '@morfira-dev/wysiwyg/ui/standard';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/plugins/tables.css';
import '@morfira-dev/wysiwyg/ui/editor.css';
import '@morfira-dev/wysiwyg/ui/forms.css';

const options = createStandardPreset({
  value: '<p>Документ</p>',
  locale: 'ru',
  markdown: { blocks: true, inline: true },
  autolink: { enabled: true },
});
const editor = createEditor(editorHost, options);
const ui = createStandardEditorUI(toolbarHost, editor);
```

Standard устанавливает плагины в порядке `tables`, `images`, `search`, `statistics`, `markdown-shortcuts`, `autolink`, `horizontal-rule`, затем плагины приложения. Поля конфигурации пресета не попадают в `EditorOptions`: там остаются параметры ядра и готовый массив `plugins`.

Без `images.upload` вставка по URL доступна; реальная загрузка файлов требует callback приложения. Пресет не выбирает endpoint, не отправляет файл и не вставляет демо-изображение. Callback передаётся как `images: { upload: applicationUpload }` и следует [контракту изображений](/images).

### Конфигурация и отключение возможностей

| Опция | Значение | Поведение |
| --- | --- | --- |
| `tables` | `TableOptions` или `false` | Настройки диагностики таблиц; `false` не устанавливает плагин |
| `images` | `ImageOptions` или `false` | Upload callback и `maxFileSize`; `false` не устанавливает плагин |
| `search` | `boolean` | Поиск включён по умолчанию; `false` не устанавливает плагин |
| `statistics` | `StatisticsOptions` или `false` | Locale сегментации текста или отключение плагина |
| `markdown` | `MarkdownShortcutOptions` или `false` | `enabled`, `blocks`, `inline` или отключение плагина |
| `autolink` | `AutolinkOptions` или `false` | `enabled` или отключение плагина |
| `horizontalRule` | `boolean` | `false` исключает команду разделителя |

Если опция отсутствует, соответствующий плагин включён с его обычными настройками. `autolink: { enabled: false }` устанавливает отключённый плагин с доступным API переключения; `autolink: false` не устанавливает его.

У фабрики `search()` нет настроек начального запроса. После создания редактора задайте запрос через `searchCommands(editor).setQuery(...)` либо используйте [готовую форму](/ui).

```ts
const options = createStandardPreset({
  images: false,
  search: false,
  statistics: false,
});
```

Готовая Standard-панель требует установленных таблиц, изображений и поиска и проверяет это до монтирования. Если эти возможности отключены, выберите `createEditorUI` с подходящими контролами или собственный интерфейс.

**Отключение во время конфигурации не доказывает tree-shaking.** Standard статически импортирует свой набор реализаций. Если нужен меньший JS-набор, используйте Minimal и отдельные `/plugins/*` импорты. Замеряйте итоговую выбранную сборку.

## Extended: ваши mentions и slash

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
  locale: 'ru',
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

`findPeople` и `findCommands` принадлежат приложению. Обе настройки и обе функции `provide` обязательны; можно явно вернуть `[]`, чтобы показать пустое состояние. Фабрика не вызывает providers и не выполняет сетевых запросов. Плагин вызывает их только при соответствующем взаимодействии после создания редактора.

Если `slash.actions` не передан, создаётся новый registry из `createSlashActions()` для обычного структурного форматирования: paragraph, heading1–heading6, bulletList, orderedList, blockquote, codeBlock. Если `actions` передан явно, он копируется и **заменяет** этот набор, без неявного объединения. Provider может вернуть action только из установленного registry. Таблицы/изображения в slash подключаются вашими явными callbacks. См. [подсказки и команды](/suggestions).

Порядок Extended: встроенные Standard-плагины, `mentions`, `slash`, затем плагины приложения. Behavior-пресет не импортирует menu view автоматически. `createExtendedEditorUI` из примера отдельно компонует Standard UI и оба меню подсказок; ему нужны установленные mentions/slash и явный `/plugins/suggestions.css`. Для собственного интерфейса отдельно подключите `createSuggestionMenu`, выбранный controller и `/plugins/suggestions.css`; клавиатурное поведение providers доступно и без menu view.

## Параметры ядра и SDK

Все пресеты принимают обычные `value`, `locale`, `translations`, `readOnly`, `placeholder`, `label`, `historyLimit`, `onChange`, а также `plugins` и `schema`. Типы опций экспортируются из соответствующих entrypoints: `MinimalPresetOptions`, `StandardPresetOptions`, `ExtendedPresetOptions`.

```ts
const options = createStandardPreset({
  plugins: [applicationPlugin],
  schema: applicationSchema,
  translations: { 'ui.editor.bold': 'Сделать жирным' },
  onChange: (change) => saveDraft(change.html),
});
```

Плагины и схема устанавливаются до импорта начального HTML. Семантические атрибуты и типизированные команды следуют [SDK](/plugin-sdk). Пресет не содержит второго resolver плагинов: повтор имени плагина или schema node по-прежнему отклоняет ядро до setup/монтирования. Неизвестные preset/feature-опции и неправильная структура конфигурации отклоняются фабрикой; полная проверка документа и схемы выполняется ядром.

Каждый вызов создаёт новые массивы и определения встроенных плагинов. `translations`, переданные напрямую `schema` definitions, их атрибуты и enum-массивы копируются. Callback-функции и явно переданные объекты плагинов приложения сохраняют идентичность; их собственная per-instance безопасность остаётся обязанностью приложения. Изменение возвращённого пресета влияет только на этот результат, а не на последующие вызовы фабрики.

## SSR, фреймворки и cleanup

Импорт и вызов фабрик допустимы без `document`, Custom Elements и framework runtime. `createEditor` и UI создавайте после browser mount. Providers и upload callbacks не вызываются во время конфигурации.

Для обёрток передавайте поля готовых опций через поддерживаемый API адаптера; например, массив `createExtendedPreset(configuration).plugins` — обычный массив плагинов для Vue, React, Svelte, Angular и Web Component. Locale/value/read-only синхронизируются по контракту соответствующего [адаптера](/adapters).

Пресет не владеет lifetime редактора. Уничтожение UI оставляет редактор рабочим; уничтожение редактора освобождает его плагины и связанный готовый UI. В приложении допустимо явно вызвать `ui.destroy()` перед `editor.destroy()`; повторный destroy UI безопасен.

## Размер и ограничения

Измеряйте отдельно headless-пресет, UI и итоговый deduplicated closure с ядром, плагинами, формами и требуемыми CSS. Framework runtimes, карты исходников, декларации, дополнительные локали и шрифты не смешиваются с JS редактора.

Сборка проверяет измеренные headless- и ready-профили: Standard — максимум 80000 gzip байт JS; Extended — 110000 gzip байт JS. По прямому решению пользователя от 2026-11-18 лимит Standard увеличен с 65000 до 80000: при последнем измеренном максимуме 64602 байта запас составляет 15398 вместо 398 байт. Это запас для полезных повседневных функций и поддерживаемого кода; отсутствие лишних runtime-зависимостей, выборочные импорты и tree-shaking остаются обязательными. Исходные лимиты ядра 200000 и optional-entry 150000 gzip байт, лимиты адаптеров и CSS не изменены; дублирующие raw JS guards профилей 200000/350000 по-прежнему сняты. Raw размер остаётся отдельным измерением. Каждый профиль ограничен 20000 байт minified CSS. Minimal измеряется отдельно без дополнительного preset-лимита. Фактические raw/gzip/Brotli/CSS сохраняются в `size-report.json`; framework runtime не входит в эти комплектации.

### Текущие измерения оптимизации

Ниже сохранён исторический замер от 2026-11-16 с действовавшим тогда лимитом 65000. Изменение бюджета 2026-11-18 не пересчитывает эти результаты; фактические новые размеры публикуются после сборки.

Сборка 2026-11-16 сохраняет прежние фабрики, плагины, функции и тестовый набор. Самая насыщенная standard-комплектация сократилась с **64999 до 64482 байт gzip JS**: экономия **517 байт**, запас до 65000 — **518 байт**. Ориентир запаса 2000 байт пока **не достигнут**. Production-сборка и её параметры сжатия прежние; новые зависимости не добавлены. CSS не изменялся.

| Комплектация | JS raw | JS gzip | JS Brotli | CSS raw | CSS gzip | CSS Brotli |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Ядро | 89148 | 27637 | 24281 | 3293 | 1164 | 962 |
| Standard ready | 200151 | 59394 | 50946 | 11504 | 3747 | 3038 |
| Standard + контекстная панель таблиц | 210933 | 62866 | 53729 | 12787 | 4322 | 3500 |
| Standard + шрифты + свойства списков + LTR/RTL + текстовый contextual UI | 216326 | 64482 | 54754 | 11974 | 4019 | 3260 |
| Extended ready | 221339 | 65528 | 56052 | 12700 | 4239 | 3414 |

Все значения — десятичные байты из генерируемого `size-report.json`; JS и CSS учитываются раздельно, общие чанки выбранной комплектации — один раз. Framework runtimes, source maps, декларации и шрифты исключены. Набор со шрифтами/свойствами списков/LTR/RTL/contextual UI — явно выбранная композиция, а не новые настройки Standard по умолчанию. Ядро пока превышает мягкую цель 80000 raw JS байт на **9148**. Эти измерения не являются результатом регрессионных тестов или замером скорости ввода; итог полного `check` и актуальная проверка примеров фиксируются в `specs/verification-backlog.md`.

По умолчанию UI использует перенос строк; явный `overflow: 'more'` включает проверенный приоритетный overflow целых групп. Текстовая [контекстная панель](/contextual-toolbar), [действия ссылок](/contextual-links), [свойства изображений](/contextual-images) и [панель таблиц](/contextual-tables) подключаются отдельными необязательными модулями, вне настроек пресетов по умолчанию. Реальные mobile/IME и скринридеры требуют отдельной проверки. Полные DOCX/PDF, совместное редактирование и офисный layout не входят в пресеты.

Команда [разделителя](/horizontal-rule) включена в standard/extended по умолчанию, с кнопкой в готовой панели. `horizontalRule: false` отключает её экземпляр; runtime-флаг не удаляет статические импорты. Для более узкого бандла используй выборочную композицию.

Необязательные [шрифты и размер текста](/fonts) также подключаются явно через `plugins: [fonts()]`, без дополнительного CSS. Настроенные команды — ограниченный px/family-профиль, а не загрузчик шрифтов; штатные пресеты и ready toolbar не добавляют их автоматически.
