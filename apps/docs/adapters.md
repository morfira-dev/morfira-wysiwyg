# Адаптеры фреймворков

Адаптеры используют общий HTML-контракт и жизненный цикл ядра. Экземпляры создаются после монтирования; Svelte требует соответствующего сборщика. Подключайте CSS один раз в клиентской точке входа. Плагины, placeholder и label фиксируются при создании: для изменения пересоздайте компонент. `readOnly` и значение документа реактивны. Фреймворк в адаптер не встраивается.

## Vue 3.5+

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { MorfiraEditor } from '@morfira/wysiwyg/vue';
import { tables } from '@morfira/wysiwyg/plugins/tables';
import '@morfira/wysiwyg/style.css';
import '@morfira/wysiwyg/plugins/tables.css';
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
import { MorfiraEditor } from '@morfira/wysiwyg/react';
import '@morfira/wysiwyg/style.css';

export const Article = () => {
  const [value, setValue] = useState('<p>Привет</p>');
  return <MorfiraEditor value={value}
    onChange={({ html }) => setValue(html)} label="Статья" />;
};
```

`onReady(editor)` передаёт экземпляр; forwarded ref предоставляет `getEditor()`. Очистка при монтировании поддерживает цикл StrictMode setup/cleanup. Без `value` документом можно управлять через открытый API. onChange использует актуальный callback из props.

## Svelte 5

```svelte
<script lang="ts">
  import { MorfiraEditor } from '@morfira/wysiwyg/svelte';
  import '@morfira/wysiwyg/style.css';
  let html = $state('<p>Привет</p>');
</script>

<MorfiraEditor bind:value={html} label="Статья" />
```

Используйте callback props `onchange` и `onready`; `bind:this` открывает `getEditor()`. `value` поддерживает bind. Svelte 4 этим адаптером не поддерживается.

## Синхронизация

Ввод вызывает пользовательское событие. Возврат того же HTML через binding не заменяет документ и не сбрасывает курсор. Другое внешнее значение заменяет документ, очищает историю и не вызывает обратное событие адаптера. Не преобразовывайте HTML на каждом нажатии: нормализацию лучше выполнять явно при сохранении.
