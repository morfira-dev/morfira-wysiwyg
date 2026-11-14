# Адаптеры фреймворков

Адаптеры используют общий HTML-контракт и жизненный цикл ядра. Экземпляры создаются после монтирования; Svelte требует соответствующего сборщика. Подключайте CSS один раз в клиентской точке входа. Плагины, placeholder и label фиксируются при создании: для изменения пересоздайте компонент. `readOnly` и значение документа реактивны. Фреймворк в адаптер не встраивается.

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

## Синхронизация

Ввод вызывает пользовательское событие. Возврат того же HTML через binding не заменяет документ и не сбрасывает курсор. Другое внешнее значение заменяет документ, очищает историю и не вызывает обратное событие адаптера. Не преобразовывайте HTML на каждом нажатии: нормализацию лучше выполнять явно при сохранении.

## Проверка устанавливаемых пакетов

```sh
pnpm run build
pnpm run consumers:check
```

Проверка упаковывает все шесть библиотек в настоящие tarball и устанавливает их в отдельный временный проект вне workspace. Все Morfira-зависимости и overrides указывают на эти архивы; source aliases и ссылки на исходники не используются. Версии инструментария и его транзитивные зависимости берутся из текущей установленной среды и проверяются после установки. `pnpm install --offline` не скачивает недостающий кеш: в этом случае проверка явно завершится ошибкой.

Далее выполняются обычные tsc/vue-tsc/svelte-check, production Vite build примеров Vue SFC, React StrictMode и Svelte 5 и девять browser smoke-сценариев в Chromium/Firefox/WebKit. Проверяются controlled feedback, структурный slash с одной нотификацией, история и дальнейший ввод, внешнее значение, реактивный read-only и unmount. Production StrictMode не доказывает dev effect replay; он отдельно проверяется основным adapter suite.

Отчёт `artifacts/consumer-packages.json` содержит версии, SHA-256 архивов, реальные пути разрешения экспортов и результаты браузеров. Временный каталог удаляется в finally. Это проверка устанавливаемых артефактов, а не публикация в npm и не утверждение о состоянии CI.
