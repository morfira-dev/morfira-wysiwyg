# Morfira WYSIWYG

Самостоятельный модульный редактор на строгом TypeScript, MIT. Ядро и плагины не имеют runtime-зависимостей. Адаптеры Vue / React / Svelte подключают фреймворки через peers. Редактор развивается; границы и планы описаны в документации.

## Локальный запуск

Node.js 22.14+ и pnpm 11.0.7.

```sh
pnpm install
pnpm run docs:dev
```

Документация на русском и английском, поиск и интерактивный редактор находятся в `apps/docs`. Публикация не выполняется.

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
```

Публичные входы: `@morfira-dev/wysiwyg`, `/vue`, `/react`, `/svelte`, `/plugins/tables`, `/plugins/images` (новый локальный модуль). Пакеты опубликованы в npm; внутри репозитория связаны через workspaces. Импорт ядра безопасен без DOM; создание редактора требует браузерного элемента.

## Структура

- `packages/core`: типизированное дерево документа, HTML/JSON-валидация, Selection/Range, история, транзакции, API плагинов и необязательная панель.
- `packages/plugins`: собственная логическая сетка таблиц, UI и необязательные команды изображений с upload callback.
- `packages/vue`, `packages/react`, `packages/svelte`: компоненты и синхронизация значения.
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

Проверяются стрелочные const-реализации, MIT, runtime-границы, типы, декларации, сборка, размер и браузерное поведение. `size-report.json` содержит minified JS, gzip, Brotli и CSS отдельно. Бюджеты: core JS 200000 байт, table JS 150000, каждый адаптер 10000, без runtime фреймворков.

## Контракты

Документ хранится как `EditorDocument` версии 1. HTML и JSON проходят схему, allowlist элементов/атрибутов/URL/стилей и ограничения ресурсов. Прежний формат прототипа автоматически не мигрируется; HTML можно импортировать в поддерживаемую схему. Плагины используют `transact`, `providePlugin`, `getPlugin`; прямого внешнего движка нет.

Тема задаётся `--mw-*` переменными на обёртке. Все реализации функций используют const-стрелки. Версии пакетов ведутся независимо через semantic-release по Conventional Commits; внутренние зависимости обновляет multi-semantic-release. Настройка OIDC и запуск релизов описаны в [инструкции](./specs/releases.md) и двуязычной документации (`apps/docs/testing.md`). Коммиты, ветки, публикации и деплой требуют отдельного запроса.

## Ограничения

Ввод опирается на браузерный contenteditable и имеет браузерные особенности. Реальные Word/Excel-сценарии, большие документы, полная IME/mobile-проверка, доступность, resize изображений мышью и совместное редактирование требуют дальнейшей работы. Прошедшие тесты не означают полного функционального паритета или сертификации безопасности.

## Лицензия

[MIT](./LICENSE). У фреймворков и инструментов сохраняются собственные лицензии — см. [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

Изображения: [контракт](specs/images.md), [документация](apps/docs/images.md), [English](apps/docs/en/images.md). Необязательный `/plugins/images` предоставляет команды и отменяемый upload callback; реальное хранилище подключает приложение.
