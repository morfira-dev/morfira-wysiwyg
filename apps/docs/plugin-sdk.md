<script setup>
import PluginSDKExample from './.vitepress/theme/PluginSDKExample.vue';
</script>

# SDK плагинов и расширяемая схема

Первый этап SDK добавляет типизированные команды и декларативные семантические расширения документа для конкретного экземпляра. Ядро не импортирует плагины и не требует UI. Все примеры используют публичный фасад `@morfira-dev/wysiwyg`; сторонние runtime-зависимости не нужны.

Это расширение существующего формата `EditorDocument` v1. Оно не заменяет движок редактирования и пока не предоставляет custom node views, атомарное выделение, decorations или произвольные новые HTML-теги.

## Живой пример

В примере плагин объявляет block-callout на `blockquote` и inline-reference на `span`. Начальный документ уже содержит оба типа: схема собирается **до импорта HTML и вызова `setup`**. Кнопки намеренно вставляют в конец документа; выбранное в редакторе место не используется. Это логика примера, а не поведение SDK-команд.

<PluginSDKExample />

Reference сохраняет `data-id`, но его подпись остаётся обычным редактируемым текстом. Этот пример не реализует полноценный атомарный mention. Визуальные стили примера не входят в сохраняемый документ.

## Декларативная схема

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import type { EditorPlugin, SchemaNodeSpec } from '@morfira-dev/wysiwyg';
import '@morfira-dev/wysiwyg/style.css';

const nodes: readonly SchemaNodeSpec[] = [
  {
    name: 'app:callout', kind: 'block', tag: 'blockquote',
    attributes: {
      'data-tone': { type: 'enum', values: ['note', 'warning'], required: true },
    },
  },
  {
    name: 'app:reference', kind: 'inline', tag: 'span',
    attributes: {
      'data-id': { type: 'text', maxLength: 64, required: true },
    },
  },
];
const plugin: EditorPlugin = {
  name: 'app:notes',
  schema: nodes,
  setup: (editor) => {
    // Схема уже участвует в начальном импорте.
    const stop = editor.subscribe((change) => console.log(change.html));
    return stop;
  },
};
const editor = createEditor(host, {
  plugins: [plugin],
  value: '<blockquote data-mw-node="app:callout" data-tone="note">Заметка</blockquote>',
});
// editor.destroy() освобождает плагин и его подписку.
```

`host` — пустой браузерный `HTMLElement`. Тот же массив можно передать через `EditorOptions.schema`, если расширение принадлежит приложению без отдельного плагина. Вклады `options.schema` и всех `plugins[].schema` компилируются вместе. Повтор имени отклоняется даже при одинаковых описаниях. Некорректная схема обнаруживается до монтирования и `setup`; определения копируются, поэтому последующие изменения исходного массива не перенастраивают экземпляр.

Имя — namespaced identifier из строчных букв, цифр и дефисов: например, `app:callout`. Сегмент начинается с буквы; нужны минимум два сегмента через `:`. Не более 128 символов и 128 определений на экземпляр.

| `kind` | Разрешённые HTML-обёртки первого этапа |
| --- | --- |
| `block` | `p`, `h1`–`h6`, `blockquote`, `pre`, `figure`, `figcaption` |
| `inline` | `span`, `strong`, `em`, `u`, `s`, `sub`, `sup`, `code` |

`data-mw-node` хранит имя семантического типа. Дополнительные атрибуты объявляются только как lowercase `data-*`; пространство `data-mw-*` зарезервировано. Нельзя разрешить `onclick`, `style`, произвольный URL-атрибут или foreign namespace через описание расширения. Обычная проверка HTML, URL и стилей продолжает действовать.

## Правила атрибутов

Все сохраняемые значения атрибутов — строки. Максимум 64 дополнительных правила на определение.

| Правило | Контракт |
| --- | --- |
| `{ type: 'text', minLength?, maxLength?, singleLine?, required? }` | Строка: минимум 0 по умолчанию, максимум 256 по умолчанию (до 20000). `singleLine: true` запрещает C0/DEL и разделители строк Unicode |
| `{ type: 'enum', values, required? }` | Одно из 1–64 заданных строковых значений |
| `{ type: 'integer', min, max, required? }` | Строка целого числа в границах safe integers; нормализуется в каноническую запись |
| `{ type: 'url', required? }` | Безопасный URL по правилам ссылок ядра: `http`, `https`, `mailto`, `tel` или допустимая относительная ссылка |

`required` проверяет присутствие атрибута. Для непустой строки укажите `minLength: 1`; минимум должен быть целым числом от 0 до `maxLength`. Прикладные команды могут дополнительно проверять формат и разрешения. Необъявленные дополнительные атрибуты не сохраняются. Любая строка ограничена 20000 символами. Описания с неизвестными полями, неподходящим tag/kind и небезопасными именами отклоняются.

## HTML, JSON и отдельный codec

```ts
import { createDocumentSchema, sanitizeHTML } from '@morfira-dev/wysiwyg';

const schema = createDocumentSchema(nodes);
const document = schema.parseHTML(
  '<span data-mw-node="app:reference" data-id="TASK-42">Задача</span>',
);
const html = schema.documentHTML(document);
const checked = schema.validateDocument(document);
const fragment = schema.renderDocument(checked);
const clean = schema.sanitizeHTML(html);

// Обычный sanitizer не подключает приложение/плагины и удаляет marker metadata.
const fallback = sanitizeHTML(html);
```

У редактора доступен неизменяемый `editor.schema` с теми же пятью методами. Схема действует на initial HTML, `setHTML`, `setJSON`, `getHTML`, `getJSON`, вставку, транзакции, native input и историю. Последующая правка не должна стирать зарегистрированные метаданные.

- Неизвестный marker в HTML удаляется вместе с его расширенными метаданными; безопасная обычная HTML-обёртка и содержимое сохраняются по базовым правилам.
- Неизвестный marker при явном JSON-импорте отклоняется, чтобы отсутствие расширения не скрывало потерю данных.
- Известный marker с неверным tag, отсутствующим required-атрибутом или некорректным значением отклоняется на обеих границах.
- Текущий формат остаётся v1. Старый читатель без поддержки расширения может потерять метаданные: передавайте одинаковые определения в редактор, импорт и отображение.

Импорт модулей и компиляция описаний безопасны без DOM. HTML parse/render и создание редактора требуют браузерного DOM. Codec не регистрирует глобальные плагины и не загружает UI.

## Типизированные команды

```ts
import { createEditorCommand } from '@morfira-dev/wysiwyg';

const insertReference = createEditorCommand<{ id: string; label: string }>('app:insert-reference');
const unregister = editor.commands.register(insertReference, {
  validate: (payload) => {
    if (!payload || typeof payload !== 'object' ||
        !('id' in payload) || typeof payload.id !== 'string' ||
        !payload.id.trim() || payload.id.length > 64 ||
        !('label' in payload) || typeof payload.label !== 'string') {
      throw new TypeError('Invalid reference payload.');
    }
    return { id: payload.id, label: payload.label };
  },
  execute: (instance, payload) => {
    const span = instance.surface.ownerDocument.createElement('span');
    span.setAttribute('data-mw-node', 'app:reference');
    span.setAttribute('data-id', payload.id);
    span.textContent = payload.label;
    instance.insertHTML(span.outerHTML);
  },
  isEnabled: (instance) => instance.getSelection() !== undefined,
  isActive: () => false,
  isMixed: () => false,
});

const state = editor.commands.getState(insertReference);
const accepted = editor.commands.execute(insertReference, { id: 'TASK-42', label: 'Задача' });
unregister();
unregister(); // Идемпотентно.
```

Токен неизменяем и выбирается по **идентичности объекта**, а имя используется для диагностики. Два отдельно созданных токена с одинаковым именем — разные команды. Сохраните токен и экспортируйте его из модуля плагина. Payload типизирован при регистрации и вызове; вход из сети/формы всё равно требует runtime-валидации.

| Метод | Поведение |
| --- | --- |
| `register(token, definition)` | Одна регистрация токена на экземпляр; возвращает idempotent unregister |
| `getState(token)` | Новый snapshot `{ enabled, active, mixed }`; `enabled` учитывает read-only/composition |
| `execute(token, payload)` | Возвращает `false`, если команда заблокирована; иначе выполняет синхронно в транзакции и возвращает `true` |

Неизвестная регистрация вызывает исключение. Принятая команда без изменения документа может вернуть `true` без новой истории. Вложенные команды объединяются в одну транзакцию/undo; ошибка валидации или выполнения откатывает документ и историю. Состояния и validator должны быть синхронными и без побочных эффектов; async/thenable callbacks не поддерживаются. `execute` может вызывать существующие команды редактора внутри общей транзакции.

Команды — доверенный код приложения, а не sandbox. Внешние запросы завершайте до транзакции; не планируйте асинхронную мутацию DOM после возврата callback. События остаются уведомлениями, а не заменой команд. UI обновляет состояние через существующие change/selection/read-only события.

При уничтожении редактора регистрации очищаются. Плагин возвращает cleanup, который вызывает свои unregister и отписки; повторный unregister безопасен и не удаляет более позднюю регистрацию. Остальные вызовы после уничтожения редактора отклоняются.

## Границы первого этапа и вес

Семантический wrapper ещё не отдельный renderer и не атом: дети редактируются нативно. Схема фиксируется при создании экземпляра; live-перерегистрация не предоставляется. Операции с новой моделью выделения, decorations и node views — следующие этапы SDK.

Основной импорт не подключает optional plugins/UI или framework runtime. Стили импортируются явно. Размер ядра и выбранных плагинов измеряется в minified/gzip/Brotli, CSS отдельно, общие чанки считаются один раз. Смотрите [архитектуру и вес](/architecture), [события](/events), [планы и ограничения](/roadmap).

Первый этап проверяет идентичность узла и его атрибуты; произвольные правила дочернего содержимого пока не регистрируются.

Для расширений, наблюдающих завершённый ввод, см. [подтверждения контролируемого ввода](/events#подтверждения-контролируемого-ввода): `EditorInputCommit` охватывает только проверенные контролируемые пути Enter/clipboard, а не любой ввод или отменяемое преобразование. Последующая команда остаётся отдельной операцией истории.
