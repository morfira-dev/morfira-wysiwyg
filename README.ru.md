# Morfira WYSIWYG

[English](README.md) · [Документация](https://morfira-dev.github.io/morfira-wysiwyg/ru/) · [Интерактивный редактор](https://morfira-dev.github.io/morfira-wysiwyg/ru/playground)

Самостоятельный модульный редактор на строгом TypeScript, MIT. Ядро и плагины не имеют сторонних runtime-зависимостей. Адаптеры Vue / React / Svelte / Angular подключают фреймворки через peers; Web Component работает без фреймворка. Редактор развивается; границы и планы описаны в документации.

## Локальный запуск

Node.js 22.20+ и pnpm 11.0.7.

```sh
pnpm install
pnpm run docs:dev
```

Документация на русском и английском, поиск и интерактивный редактор находятся в `apps/docs`. Сайт обновляется через GitHub Actions после успешных проверок ветки `main`.

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
editor.setLocale('en', { 'tables.resizeColumn': 'Column width' });
```

Публичные входы: `@morfira-dev/wysiwyg`, `/vue`, `/react`, `/svelte`, `/angular`, `/web-component` и выборочные `/plugins/tables`, `/plugins/images`, `/plugins/search`, `/plugins/statistics`, `/plugins/markdown`, `/plugins/mentions`, `/plugins/slash`, `/plugins/suggestions`. Внутри репозитория пакеты связаны через workspaces; доступность новых входов в npm зависит от выпущенной версии. Импорт ядра безопасен без DOM; создание редактора требует браузерного элемента.

## Локализация и новые обёртки

Готовые формы подключаются отдельно: `/ui/links`, `/ui/images`, `/ui/search` и общий `/ui/forms.css`. Они не требуют фреймворка или CSS документации и не входят в граф ядра. `/ui/images` использует плагин изображений, `/ui/search` — поиска; ссылки работают с командами ядра.

```ts
import { createLinkForm } from '@morfira-dev/wysiwyg/ui/links';
import '@morfira-dev/wysiwyg/ui/forms.css';

const form = createLinkForm(document.querySelector<HTMLElement>('#link-controls')!, editor);
// При удалении экрана: form.destroy(); затем editor.destroy().
```

Контроллеры предоставляют `element`, `refresh`, `getValues`, `setValues`, `destroy`, наследуют locale/read-only и сохраняют drafts. Примеры всех трёх форм: [RU](apps/docs/ru/ui.md) / [EN](apps/docs/ui.md).

`locale` и `translations` принадлежат экземпляру. Встроены RU/EN, неизвестные языки используют английский fallback; отдельные строки или свой язык задаются record переводов. `setLocale()` меняет встроенные подписи без изменения документа/истории; явные пользовательские labels остаются приоритетными. Полный каталог: [RU](apps/docs/ru/localization.md) / [EN](apps/docs/localization.md).

Angular 21/22: импортируйте standalone `MorfiraEditor` из `@morfira-dev/wysiwyg/angular` в `imports` компонента. Поддерживаются `[(value)]`, Reactive Forms и `ngModel` через CVA; не совмещайте form binding и `[value]` на одном экземпляре. Angular остаётся peer dependency. Примеры: [RU](apps/docs/ru/adapters.md#angular-21--22) / [EN](apps/docs/adapters.md#angular-21--22).

Для Web Component регистрация в браузере явная, CSS подключается отдельно:

```ts
import { defineMorfiraEditor } from '@morfira-dev/wysiwyg/web-component';
import type { MorfiraEditorElement } from '@morfira-dev/wysiwyg/web-component';
import '@morfira-dev/wysiwyg/style.css';

defineMorfiraEditor();
const field = document.createElement('morfira-wysiwyg') as MorfiraEditorElement;
field.locale = 'en';
field.value = '<p>Hello</p>';
field.addEventListener('value-change', (event) => {
  console.log((event as CustomEvent<string>).detail);
});
document.querySelector('#editor-host')!.append(field);
```

Light DOM, свойства `value/readOnly/locale/translations/plugins`, события `value-change/change/ready`; автоматической связи с HTML forms пока нет. [Контракт и примеры](apps/docs/ru/adapters.md#web-component-без-фреймворка).

Контекстные действия со ссылкой подключаются отдельно через `/ui/contextual-link` и `/ui/contextual-link.css` вместе с `/ui/forms.css`. `createContextualLinkUI(host, editor)` показывает предпросмотр и Open/Edit/Remove при курсоре внутри текстовой ссылки; редактирование использует существующую форму, форматирование и историю. Пустой overlay-host размещается вне содержимого редактора. Пресеты модуль автоматически не подключают. Контракт, безопасность URL и примеры: [RU](apps/docs/ru/contextual-links.md) / [EN](apps/docs/contextual-links.md).

Контекстные свойства изображения доступны отдельно через `/ui/contextual-image` и `/ui/contextual-image.css`. `createContextualImageUI(host, editor)` использует настоящее выделение одного IMG и открывает существующую форму в режиме `mode: 'edit'`: Enter обновляет, вставка и загрузка исключены. Default-режим самостоятельной формы остаётся `all`. Примеры и границы: [RU](apps/docs/ru/contextual-images.md) / [EN](apps/docs/contextual-images.md).

## Структура

- `packages/core`: типизированное дерево документа, HTML/JSON-валидация, Selection/Range, история, транзакции, API плагинов и необязательная панель.
- `packages/plugins`: собственная логическая сетка таблиц, UI и необязательные команды изображений с upload callback.
- `packages/vue`, `packages/react`, `packages/svelte`, `packages/angular`: компоненты и синхронизация значения.
- `packages/web-component`: явно регистрируемый light-DOM custom element.
- `packages/wysiwyg`: единый публичный пакет с subpath exports.
- `apps/docs`: двуязычный сайт; `playground`: браузерный стенд.
- `AGENTS.md`, `skills/morfira-sdd/SKILL.md`, `specs/`: требования, SDD-процесс и критерии поведения.

## Проверки

```sh
pnpm exec playwright install chromium firefox webkit
pnpm run check
pnpm run docs:build
pnpm run test:docs
```

Проверяются стрелочные const-реализации, MIT, runtime-границы, типы, декларации, сборка, размер и браузерное поведение. `size-report.json` содержит minified JS, gzip, Brotli и CSS отдельно. По уточнению пользователя исходные бюджеты считаются в gzip: core JS 200000 байт, optional/table JS 150000. Готовые Standard/Extended сохраняют более строгие лимиты 90000/110000 gzip байт JS и 20000 minified байт CSS; raw JS измеряется без прежних preset-ограничений. Каждый адаптер ограничен отдельно 10000 minified байт JS, без runtime фреймворков.

GitHub CI автоматически проверяет PR и `main` через Release; для ветки без PR доступен ручной Check. Дублирующий non-main push trigger убран, устаревшие проверки PR отменяются без отмены публикации `main`. CI выполняет одну сборку и статические проверки, затем запускает полную браузерную матрицу в 14 задачах (4 шарда Chromium, 6 Firefox и 4 WebKit), а документацию и оба профиля установленных пакетов — параллельно. Релиз ждёт общий успешный `check`. Локальная `pnpm run check` остаётся полной проверкой; `check:static` — её часть до браузеров, `docs:build:site` собирает сайт из уже проверенных библиотек. Цель полного цикла — семь минут. Методика и фактические замеры: [continuous integration](specs/continuous-integration.md).

## Контракты

Документ хранится как `EditorDocument` версии 1. HTML и JSON проходят схему, allowlist элементов/атрибутов/URL/стилей и ограничения ресурсов. Прежний формат прототипа автоматически не мигрируется; HTML можно импортировать в поддерживаемую схему. Плагины используют `transact`, `providePlugin`, `getPlugin`; прямого внешнего движка нет.

Тема задаётся `--mw-*` переменными на обёртке. Реализации используют const-стрелки; только обязательные platform prototype callbacks Web Component делегируют стрелочной lifecycle-логике. Версии пакетов ведутся независимо через semantic-release по Conventional Commits; внутренние зависимости обновляет multi-semantic-release. Настройка OIDC и запуск релизов описаны в [инструкции](./specs/releases.md) и двуязычной документации (`apps/docs/ru/testing.md`). Коммиты, ветки, публикации и деплой требуют отдельного запроса.

## Ограничения

Ввод опирается на браузерный contenteditable и имеет браузерные особенности. Границы поддержки офисной вставки, больших документов и браузерного ввода описаны в [документации](apps/docs/ru/roadmap.md). Проверки на физических устройствах и с ассистивными технологиями пока не выполнены.

## Лицензия

[MIT](./LICENSE). У фреймворков и инструментов сохраняются собственные лицензии — см. [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

Изображения: [контракт](specs/images.md), [документация](apps/docs/ru/images.md), [English](apps/docs/images.md). Необязательный `/plugins/images` предоставляет команды и отменяемый upload callback; реальное хранилище подключает приложение.

Поиск и замена: необязательный `/plugins/search` (локальная разработка), [RU](apps/docs/ru/search.md) / [EN](apps/docs/search.md), [контракт](specs/search.md). Буквальный поиск, регистр, целое слово, текущая/массовая замена с историей.

Статистика: `/plugins/statistics` (локальная разработка), [RU](apps/docs/ru/statistics.md) / [EN](apps/docs/statistics.md). Unicode-графемы и слова документа/выделения через платформенный Intl.Segmenter.

Markdown shortcuts: необязательный `/plugins/markdown` (локальная разработка), [RU](apps/docs/ru/markdown.md) / [EN](apps/docs/markdown.md), [контракт](specs/markdown-shortcuts.md). Преобразования при вводе с историей, без Markdown-парсера и конвертации вставки.

Mentions/slash: локальные `/plugins/mentions`, `/plugins/slash` и необязательное меню `/plugins/suggestions` + `/plugins/suggestions.css`; [RU](apps/docs/ru/suggestions.md) / [EN](apps/docs/suggestions.md). Асинхронные провайдеры приложения, отмена, клавиатура, редактируемые упоминания без постоянных ID, текстовые шаблоны и готовые структурные команды через расширяемый реестр.

Архитектура расширений: [события и составные транзакции RU](apps/docs/ru/events.md) / [EN](apps/docs/events.md). Готовые основные плагины подключаются выборочно; tree-shaking проверяется командой `pnpm run check:tree-shaking`. Правила владения кодом: [spec](specs/code-organization.md). Тяжёлый офисный паритет не является целью проекта.

Проверка пакетов вне workspace: после `pnpm run build` запустите `pnpm run consumers:check` (восемь tarball, offline cache, Vue/React/Svelte/Angular 21/Web Component и пятнадцать сценариев в трёх браузерах). Отдельный `pnpm run consumers:angular22` проверяет Angular 22 и его TypeScript toolchain ещё тремя сценариями; нужен совместимый Node 22.22.3+ или 24.15+, возможно получение dev toolchain из сети. Эти числа описывают покрытие инструмента, а не результат последнего запуска. Бенчмарк ядра: `pnpm run benchmark -- --browser=chromium,firefox,webkit`; результаты в `artifacts/performance-baseline.json` наблюдательные, без timing-порогов в CI. Методика: [RU](apps/docs/ru/performance.md) / [EN](apps/docs/performance.md).


Контекстная панель таблиц подключается отдельно через `/ui/contextual-table` и `/ui/contextual-table.css`: `createContextualTableUI(host, editor)` даёт операции над строками/столбцами, объединение и разделение с учётом rowspan/colspan и истории. Наблюдение за областью — выборочный `getTableSelection(editor, range?)` из `/plugins/tables`; панель не включается в пресеты автоматически. Подключение, клавиатура и ограничения: [RU](apps/docs/ru/contextual-tables.md) / [EN](apps/docs/contextual-tables.md).
