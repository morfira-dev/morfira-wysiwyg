# Быстрый старт

Morfira WYSIWYG — самостоятельно реализованный редактор на TypeScript с подключаемыми таблицами и адаптерами Vue, React, Svelte и Angular, а также Web Component без фреймворка. У ядра и плагинов **нет runtime-зависимостей**. Код проекта распространяется по MIT.

## Локальный запуск

Нужны Node.js 22.20+ и pnpm 11.0.7.

```sh
pnpm install --frozen-lockfile
pnpm run docs:dev
```

При локальной разработке пакеты связаны через workspaces. Для установки опубликованной версии в приложение выполните `pnpm add @morfira-dev/wysiwyg`. После изменения исходников библиотеки выполняйте `pnpm run build`. `pnpm run dev` запускает браузерный тестовый стенд.

## Создание редактора

Подготовьте два пустых элемента: `<div id="toolbar"></div><div id="editor"></div>`.

```ts
import { createEditor, createToolbar } from '@morfira-dev/wysiwyg';
import '@morfira-dev/wysiwyg/style.css';

const host = document.querySelector<HTMLElement>('#editor')!;
const editor = createEditor(host, {
  value: '<p>Привет, <strong>Morfira</strong></p>',
  label: 'Текст статьи',
  placeholder: 'Начните писать…',
  onChange: ({ html, source }) => {
    if (source === 'user') console.log(html);
  },
});
const removeToolbar = createToolbar(
  document.querySelector<HTMLElement>('#toolbar')!, editor,
);
// При удалении представления:
removeToolbar();
editor.destroy();
```

Панель необязательна. Удаляйте её UI до уничтожения редактора. Начальный HTML передавайте через `value`; контейнер должен быть пустым.

## Хранение и проверка

`getJSON()` возвращает версионированное дерево `EditorDocument`: текст и разрешённые семантические элементы. Сохраняйте его через `JSON.stringify`, восстанавливайте через `setJSON`. HTML и JSON проходят проверку схемы, URL, допустимых стилей, вложенности и размера. Неизвестная версия документа отклоняется без изменения редактора.

`getHTML()` возвращает поддерживаемый семантический HTML. Обработчики событий, исполняемая разметка и чужие пространства имён не импортируются. Неподдерживаемая разметка нормализуется; произвольная вёрстка не сохраняется. Сервер отвечает за собственную валидацию, авторизацию и правила выдачи контента.

## Браузер и SSR

Импорт ядра не обращается к DOM-глобальным объектам. `createEditor` вызывается только при наличии браузерного элемента. Адаптеры создают и удаляют экземпляр в клиентском lifecycle. Svelte-компонент требует компилятора Svelte в приложении. Ввод, composition и вспомогательные технологии всё равно нужно проверять в целевых окружениях.
