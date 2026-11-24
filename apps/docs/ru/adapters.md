# Адаптеры фреймворков

Адаптеры используют общий HTML-контракт и жизненный цикл ядра. Экземпляры создаются после монтирования; Svelte требует соответствующего сборщика. Подключайте CSS один раз в клиентской точке входа. Во Vue/React/Svelte/Angular плагины, placeholder и label фиксируются при создании: для изменения пересоздайте компонент. `readOnly`, значение документа, `locale` и `translations` реактивны. Фреймворк в адаптер не встраивается. Web Component не требует фреймворка и описан отдельно ниже.

## Vue 3.5+

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { MorfiraEditor } from '@morfira-dev/wysiwyg/vue';
import { tables } from '@morfira-dev/wysiwyg/plugins/tables';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/plugins/tables.css';
const html = ref('<p>Привет</p>');
const plugins = [tables()];
</script>

<template>
  <MorfiraEditor v-model="html" :plugins="plugins" label="Статья" />
</template>
```

События: `update:modelValue` с HTML, `change` с `EditorChange`, `ready` с `Editor`. Через ref доступен `getEditor()` после монтирования. Размонтирование уничтожает экземпляр.

## React 18 / 19

```tsx
import { useState } from 'react';
import { MorfiraEditor } from '@morfira-dev/wysiwyg/react';
import '@morfira-dev/wysiwyg/style.css';

export const Article = () => {
  const [value, setValue] = useState('<p>Привет</p>');
  return <MorfiraEditor value={value}
    onChange={({ html }) => setValue(html)} label="Статья" />;
};
```

`onReady(editor)` передаёт экземпляр; forwarded ref предоставляет `getEditor()`. Очистка при монтировании поддерживает цикл StrictMode setup/cleanup. Без `value` документом можно управлять через открытый API. onChange использует актуальный callback из props.

В браузере создание редактора, синхронизация controlled value и read-only выполняются в layout effects. Родительский layout effect может выполнить следующую команду, и подтверждение предыдущего значения не перезапишет эту правку и не сбросит курсор/историю. При серверном рендеринге используется passive effect fallback и выводится только контейнер. Намеренно задержанные или преобразованные значения остаются внешними заменами; адаптер не определяет протокол подтверждения приложения.

## Svelte 5

```svelte
<script lang="ts">
  import { MorfiraEditor } from '@morfira-dev/wysiwyg/svelte';
  import '@morfira-dev/wysiwyg/style.css';
  let html = $state('<p>Привет</p>');
</script>

<MorfiraEditor bind:value={html} label="Статья" />
```

Используйте callback props `onchange` и `onready`; `bind:this` открывает `getEditor()`. `value` поддерживает bind. Svelte 4 этим адаптером не поддерживается.

## Angular 21 / 22

`MorfiraEditor` — standalone-компонент с selector `morfira-editor` и ControlValueAccessor. Импортируйте его непосредственно в `imports` компонента приложения. Для reactive forms подключите `ReactiveFormsModule`:

```ts
import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MorfiraEditor } from '@morfira-dev/wysiwyg/angular';
import type { Editor, EditorTranslations } from '@morfira-dev/wysiwyg';
import '@morfira-dev/wysiwyg/style.css';

@Component({
  selector: 'app-article',
  standalone: true,
  imports: [MorfiraEditor, ReactiveFormsModule],
  template: `<morfira-editor [formControl]="body" [locale]="language"
    [translations]="messages" label="Статья" (ready)="onReady($event)" />`,
})
export class Article {
  readonly body = new FormControl('<p>Привет</p>', { nonNullable: true });
  language = 'ru';
  readonly messages: EditorTranslations = { 'editor.placeholder': 'Текст статьи…' };
  readonly onReady = (editor: Editor) => {
    console.log(editor.getHTML());
  };
}
```

Для template-driven forms подключите `FormsModule` и используйте `[(ngModel)]="html"`. Для прямого HTML-binding без Angular forms используйте `[(value)]="html"`, либо `[value]="html" (valueChange)="html = $event"`. Не совмещайте `[value]` и form binding на одном экземпляре: владельцем значения должна быть одна модель.

Входы: `value`, `readOnly`, `locale`, `translations`, `plugins`, `label`, `placeholder`. Выходы: `valueChange` со строкой HTML, `change` с `EditorChange`, `ready` с `Editor`. Через component ref доступен `getEditor()` после `ready`. Ввод обновляет CVA и outputs, внешние `writeValue`/binding updates остаются тихими. `null` в CVA сбрасывает документ в пустой. `control.disable()` и `[readOnly]` объединяются: любой из них блокирует изменение документа. Выход фокуса за пределы компонента помечает control touched.

Редактор создаётся в `afterNextRender`, не во время SSR, и уничтожается вместе с компонентом. Библиотека поставляется partial-compiled; Angular linker приложения завершает компиляцию, скрытого JIT fallback не требуется. Angular core/common/forms — peers, CSS и runtime Angular в адаптер не встроены. Совместимость Angular 22 проверяется отдельным consumer-профилем с его Node/TypeScript toolchain, а не выводится только из peer range.

## Web Component без фреймворка

Регистрация явная: импорт `/web-component` сам не создаёт custom element и безопасен при SSR. В браузере вызовите `defineMorfiraEditor()`; стандартное имя — `morfira-wysiwyg`:

```ts
import { defineMorfiraEditor } from '@morfira-dev/wysiwyg/web-component';
import type { MorfiraEditorElement } from '@morfira-dev/wysiwyg/web-component';
import type { Editor, EditorChange } from '@morfira-dev/wysiwyg';
import { tables } from '@morfira-dev/wysiwyg/plugins/tables';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/plugins/tables.css';

defineMorfiraEditor();
const field = document.createElement('morfira-wysiwyg') as MorfiraEditorElement;
field.value = '<p>Привет</p>';
field.locale = 'ru';
field.translations = { 'tables.resizeColumn': 'Ширина колонки' };
field.plugins = [tables()];
field.addEventListener('value-change', (event) => {
  const html = (event as CustomEvent<string>).detail;
  console.log(html);
});
field.addEventListener('change', (event) => {
  if (!(event instanceof CustomEvent)) return;
  const change = (event as CustomEvent<EditorChange>).detail;
  console.log(change.source);
});
field.addEventListener('ready', (event) => {
  const editor = (event as CustomEvent<Editor>).detail;
  console.log(editor.getHTML());
});
document.querySelector('#editor-host')!.append(field);
```

Элемент использует light DOM, поэтому импортируйте CSS вручную и задавайте `--mw-*` на обёртке/самом элементе. Свойства `value`, `readOnly`, `locale`, `translations`, `label` и `placeholder` можно обновлять после подключения. `plugins` задаются до подключения или после отключения; изменение списка у работающего редактора отклоняется. `getEditor()` возвращает текущий экземпляр только пока элемент подключён.

Поддерживаются атрибуты `value`, `readonly`, `locale`, `label`, `placeholder`; переводы и плагины передавайте свойствами. `readonly` — boolean presence attribute: даже `readonly="false"` включает режим чтения, поэтому для выключения удалите атрибут или установите `field.readOnly = false`. Для HTML-значений предпочтительно свойство `value`.

События `value-change`, `change`, `ready` — native CustomEvent с `detail`; они всплывают. Внешняя установка `value` не создаёт обратных событий, same-value feedback сохраняет курсор/историю. Disconnect уничтожает редактор, reconnect восстанавливает последний проверенный HTML в новом экземпляре с новой историей. Это пока **не form-associated custom element**: автоматических FormData/валидации/disabled-связи с `<form>` нет, приложение связывает значение самостоятельно.

## Реактивная локализация

Все четыре framework-адаптера и Web Component передают `locale` и `translations` в instance-local API. Для обновления translations передавайте новый record; язык не заменяет документ и не создаёт пользовательского change. Явные label/placeholder и пользовательские подписи остаются приоритетными. Языковые теги, fallback и каталог ключей — в [руководстве локализации](/ru/localization).

## Синхронизация

Ввод вызывает пользовательское событие. Возврат того же HTML через binding не заменяет документ и не сбрасывает курсор. Другое внешнее значение заменяет документ, очищает историю и не вызывает обратное событие адаптера. Не преобразовывайте HTML на каждом нажатии: нормализацию лучше выполнять явно при сохранении.

## Проверка устанавливаемых пакетов

```sh
pnpm run build
pnpm run consumers:check
# Отдельный Angular 22 профиль, на совместимом Node:
pnpm run consumers:angular22
```

Проверка рассчитана на восемь библиотек в настоящих tarball и отдельный временный проект вне workspace. Все Morfira-зависимости и overrides указывают на эти архивы; source aliases и ссылки на исходники не используются. Версии инструментария и его транзитивные зависимости берутся из текущей установленной среды и проверяются после установки. Базовый `pnpm install --offline` не скачивает недостающий кеш: в этом случае проверка явно завершится ошибкой.

Базовый профиль охватывает tsc/vue-tsc/svelte-check, Angular AOT/linker, production-примеры Vue SFC, React StrictMode, Svelte 5, Angular 21 и Web Component: пятнадцать browser smoke-сценариев в Chromium/Firefox/WebKit. `consumers:angular22` добавляет ещё три сценария и отдельный TypeScript toolchain во временном проекте; ему нужен Node 22.22.3+ из ветки 22 либо совместимый Node 24.15+. Профиль может потребовать сеть для получения Angular 22 toolchain, не изменяя root lockfile. Проверяются controlled feedback, структурный slash с одной нотификацией, история и дальнейший ввод, внешнее значение, реактивные locale/read-only и unmount. Production StrictMode не доказывает dev effect replay; он отдельно проверяется основным adapter suite. Перечисление покрытия — контракт инструмента, а не утверждение о результате последнего запуска.

Отчёты `artifacts/consumer-packages.json` и `artifacts/consumer-angular22.json` содержат версии, SHA-256 архивов, реальные пути разрешения экспортов и результаты браузеров соответствующего профиля. Временный каталог удаляется в finally. Это проверка устанавливаемых артефактов, а не публикация в npm и не утверждение о состоянии CI.
