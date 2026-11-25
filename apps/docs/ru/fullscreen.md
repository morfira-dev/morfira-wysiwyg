# Полноэкранный режим

`createFullscreenUI` разворачивает существующую рабочую область редактора на окно. Редактор, панель инструментов и обёртки адаптеров остаются теми же DOM-узлами: документ, текущий курсор, выделение и Undo не пересоздаются. На главной и в [демо](/ru/playground) кнопка «Во весь экран» находится над рабочей областью.

Это необязательный CSS-режим, а не браузерный Fullscreen API. Адресная строка и другие элементы браузера остаются видимыми. Модуль не входит в core или пресеты автоматически, не добавляет типы узлов в документ и не требует framework/runtime-зависимостей.

## Подключение

Контейнер `workspace` должен уже содержать настоящий редактор, панель инструментов и пустой host кнопки. Он принадлежит приложению; модуль не переносит редактор в отдельный overlay и не монтирует адаптер повторно.

```html
<section id="workspace" class="editor-workspace">
  <div id="fullscreen-controls"></div>
  <div id="toolbar"></div>
  <div id="editor"></div>
</section>
```

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { createStandardPreset } from '@morfira-dev/wysiwyg/presets/standard';
import { createStandardEditorUI } from '@morfira-dev/wysiwyg/ui/standard';
import { createFullscreenUI } from '@morfira-dev/wysiwyg/ui/fullscreen';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/plugins/tables.css';
import '@morfira-dev/wysiwyg/ui/editor.css';
import '@morfira-dev/wysiwyg/ui/forms.css';
import '@morfira-dev/wysiwyg/ui/fullscreen.css';

const workspace = document.getElementById('workspace')!;
const fullscreenHost = document.getElementById('fullscreen-controls')!;
const toolbarHost = document.getElementById('toolbar')!;
const editorHost = document.getElementById('editor')!;
const editor = createEditor(editorHost, createStandardPreset({
  locale: 'ru',
  value: '<p>Тот же документ в большой рабочей области.</p>',
}));
const toolbar = createStandardEditorUI(toolbarHost, editor);
const fullscreen = createFullscreenUI(fullscreenHost, editor, {
  target: workspace,
  onChange: (active) => console.log('Fullscreen workspace:', active),
  onError: (error) => console.error(error),
});

// workspace содержит fullscreenHost, toolbarHost и editorHost.
// При удалении обёртки адаптера освобождайте принадлежащие ей UI-модули.
const dispose = () => {
  fullscreen.destroy();
  toolbar.destroy();
  editor.destroy();
};
```

`fullscreenHost` — подключённый пустой HTML-элемент того же документа, за пределами редактируемого содержимого. `target` и host должны находиться в light DOM этого документа: ShadowRoot и slotted-обёртки не поддерживаются первым срезом. Существующий light-DOM Web Component можно разворачивать в обычной внешней обёртке. `workspace` — подключённый HTML-предок `editor.element` и host кнопки. `target` не должен находиться внутри редактируемого содержимого или быть его частью. Некорректная конфигурация отклоняется без частично добавленных контролов или изменений стилей.

## API

```ts
import type {
  FullscreenUIOptions,
  FullscreenUIController,
  FullscreenUIMessageKey,
} from '@morfira-dev/wysiwyg/ui/fullscreen';
import { fullscreenUIMessages } from '@morfira-dev/wysiwyg/ui/fullscreen';
```

| API | Поведение |
| --- | --- |
| `createFullscreenUI(host, editor, options)` | Создаёт независимую кнопку для `options.target`. |
| `options.target` | Обязательная рабочая область, содержащая редактор и host кнопки. |
| `options.label?` | Собственное доступное имя кнопки; видимая подпись входа/выхода остаётся локализованной. |
| `options.onChange?` | Уведомление `(active: boolean) => void` после изменения режима, без команды изменения документа. |
| `options.onError?` | Необязательная диагностика доверенного кода приложения. |
| `controller.element` | Существующая нативная кнопка с локализованной подписью и `aria-pressed`. |
| `enter(): boolean` | Возвращает `true`, если эта рабочая область активна; отказывает при конфликте владельца или неподходящем состоянии. |
| `exit(): void` | Возвращает обычную раскладку, освобождает принадлежавшие модулю стили и наблюдение. |
| `toggle(): boolean` | Переключает режим и возвращает итоговое активное состояние. |
| `isActive(): boolean` | Сообщает состояние этого контроллера. |
| `refresh(): void` | Обновляет состояние и локализованную подпись существующего контрола. |
| `destroy(): void` | Идемпотентно освобождает режим, кнопку и подписки. Остальные методы после уничтожения недоступны. |

В одном документе активна только одна рабочая область этого модуля. Вход второго экземпляра не закрывает первый и не меняет его стили. Поиск, форматирование и редактирование продолжают использовать существующие операции редактора. Вход/выход сами по себе не добавляют шаг истории; после работы в развёрнутой области сохраняется текущая позиция, а не старое выделение на момент входа.

## Клавиатура и состояния

Нативная кнопка работает с клавиатуры и показывает «Во весь экран» либо «Выйти из полноэкранного режима». Необработанный `Escape` внутри активной рабочей области закрывает режим. Вложенная форма или меню сначала получает свой `Escape`: модуль не перехватывает уже обработанное действие. `F11` остаётся браузеру.

Read-only не запрещает разворачивать область для чтения. Во время IME-композиции вход отклоняется, чтобы не мешать вводу; после её отмены через API или readonly не нужен дополнительный искусственный `compositionend`. Замена документа приложением в активной области сохраняет режим, но не возвращает устаревшее выделение. Смена локали обновляет ту же кнопку без её пересоздания.

Режим не является модальным диалогом: он не меняет `inert` у остальной страницы и не создаёт глобальную ловушку фокуса. Политика модальных окон и внешних элементов приложения остаётся у приложения. Полное соответствие требованиям доступности, реальные экранные дикторы, мобильные браузеры и ОС IME этим описанием не подтверждаются.

## CSS и внешние overlay

Подключайте `/ui/fullscreen.css` явно. Модуль добавляет рабочей области только принадлежащий ему класс `mw-fullscreen`. Стили страницы не копируются в документ, а содержимое не клонируется.

Рабочая область должна находиться в цепочке предков без transform/filter/perspective и paint/layout containment, меняющих геометрию fixed-элементов; неподдерживаемое окружение отклоняется. Модуль не переносит контейнер к `body` для обхода ограничений и не управляет чужими overlay.

Контекстные панели и маркеры изменения размера могут иметь внешние host-элементы. Их слой должен оставаться выше развёрнутой области, а позиционирование — соответствовать окну. В демо host-элементы контекстных инструментов остаются внешними. Приложение самостоятельно согласует z-index, модальные слои и CSS containment.

На время режима блокируется фоновая прокрутка через отдельные inline overflow-x/y у `body`. При выходе каждый параметр возвращается только если значение и приоритет ещё принадлежат модулю: параллельное изменение приложения не должно затираться. Позиция прокрутки страницы при входе также запоминается: она возвращается при выходе только если приложение или пользователь не изменили принадлежащую окну позицию после блокировки; такое внешнее изменение не перезаписывается. При уничтожении редактора, удалении рабочей области, её переносе в другой документ или потере владения режим освобождает свои ресурсы. Перемещение внутри документа требует повторной проверки цепочки предков.

## Оформление

Настройка не требует изменения стилей ядра:

```css
.editor-workspace {
  --mw-fullscreen-z-index: 900;
  --mw-fullscreen-background: var(--mw-surface, #fff);
  --mw-fullscreen-padding: 16px;
  --mw-fullscreen-button-radius: 6px;
}
```

Также доступны `--mw-fullscreen-button-color`, `--mw-fullscreen-button-background`, `--mw-fullscreen-button-border` и общий `--mw-focus`. Согласуйте слой с внешними контекстными контролами приложения.
