<script setup>
import PluginExtensionsExample from './.vitepress/theme/PluginExtensionsExample.vue';
</script>

# Узлы, атомы, представления и decorations

Необязательный `@morfira-dev/wysiwyg/sdk` объединяет инструменты для расширений приложения. Он не входит в ядро и готовые пресеты автоматически, не требует framework runtime и не меняет версию сохраняемой схемы.

<PluginExtensionsExample />

## Пользовательские узлы

`nodeExtension(spec, options)` регистрирует собственную семантику поверх разрешённых элементов схемы v1. `nodeCommands(editor, name)` возвращает `insert(text, attributes)`, `update(target, attributes, text?)` и `remove(target)`. Атрибуты и буквальный текст проходят кодек экземпляра до изменения документа; команды участвуют в истории и соблюдают read-only/composition.

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { nodeExtension, nodeCommands } from '@morfira-dev/wysiwyg/sdk';

const editor = createEditor(host, {
  plugins: [nodeExtension({
    name: 'app:issue', kind: 'inline', tag: 'span',
    attributes: {
      'data-id': { type: 'text', minLength: 1, maxLength: 64, required: true },
    },
    content: { type: 'text', minLength: 1, maxLength: 64, singleLine: true },
  }, { atomic: true })],
});
const issues = nodeCommands(editor, 'app:issue');
issues.insert('ISSUE-42', { 'data-id': '42' });
```

Это не разрешение на произвольные теги, `iframe`, обработчики событий, стили или foreign namespaces. Схема проверяет данные, а регистрация плагинов и исполняемые callbacks остаются доверенным кодом приложения. ID узла не заменяет серверную авторизацию.

## Атомарные узлы

`atomic: true` предназначен для inline `span` с непустым ограниченным однострочным текстом. Навигация и Backspace/Delete обрабатывают токен целиком в поддержанном обычном текстовом потоке. HTML/JSON сохраняют семантический маркер и атрибуты; runtime `contenteditable=false` не сохраняется. Зарегистрированная схема нужна и принимающему редактору.

Операции через неподдержанные структурные границы отказывают, а не превращают список или таблицу в плоский текст. Полноценный выбор произвольных block widgets и визуальная навигация смешанного bidi этим контрактом не заявляются. [Упоминания](/atomic-mentions) сохраняют собственный проверенный контракт; новый SDK не подменяет его.

## Представления узлов

`createNodeViews(host, editor, { name, create })` создаёт управляемые представления **во внешнем host**, рядом с сохраняемым документом. `create(context)` возвращает `{ element, update?, destroy? }`. Контекст содержит фактический `node`, проверенные `attributes`, `text`, `editor` и наблюдательный `getRect()`.

Каждый фактический узел имеет свой lifecycle. Изменение обновляет контекст, удаление и уничтожение редактора освобождают представление. Host внутри `editor.surface` запрещён. Ошибки callback не должны оставлять частично созданный UI или подписки.

Это полезно для карточки, инспектора свойств или собственного UI рядом с узлом. Это **не** произвольный in-document renderer с редактируемым `contentDOM`. HTML представления не попадает в `getHTML()` / `getJSON()`; приложение располагает внешний UI самостоятельно. Изменения данных выполняйте через `nodeCommands` и обычные команды редактора.

## Текстовые позиции и транзакции

`editor.positions` отслеживает UTF-16-смещения в `surface.textContent`. Пустые блоки, BR и изображения могут иметь одинаковые текстовые смещения; для точных DOM-границ используйте [сохранённое выделение](/plugin-sdk#сохраненное-выделение-для-внешнего-ui).

```ts
const position = editor.positions.track(6, 1);
if (!position) throw new Error('The editor is not ready for position tracking.');
editor.transact((surface) => {
  const first = surface.querySelector('p')!.firstChild as Text;
  first.insertData(0, '++');
}, { mapping: [{ from: 0, to: 0, insert: '++' }] });
const result = editor.positions.resolve(position); // { index: 8, deleted: false }
editor.positions.release(position);
```

- `track(index, association?)`: непрозрачная позиция экземпляра; `-1` остаётся перед вставкой на границе, `1` — после неё.
- `resolve(handle)`: новая копия `{ index, deleted }` или `undefined` для истёкшей/чужой цели. Удалённая позиция не является актуальной целью команды.
- `release(handle)`: идемпотентное освобождение.
- `subscribe(listener)`: уведомления об описанном mapping или инвалидации, с отдельной отпиской.

`mapping` — ограниченная последовательность `{ from, to, insert }`: координаты каждого шага относятся к тексту после предыдущего. Результат должен точно совпасть с текстом после транзакции; неверное описание откатывает изменение. План принадлежит внешней транзакции. Поддержанные undo/redo используют обратные/прямые шаги истории.

Неописанный ввод, замена документа и неподдержанные изменения сбрасывают позиции. Редактор не угадывает соответствие повторяющихся строк и не обещает универсальный structural mapping. Даже форматирование с изменением HTML требует явного пустого `mapping: []`, если приложение берёт ответственность за совместимость текстовых координат. Обычные команды продолжают работать без mapping, но не сохраняют отслеживаемые цели автоматически.

Для runtime-аннотации зарегистрированного текстового атома SDK использует `editor.positions.setPresentation(node, false)`; `undefined` снимает аннотацию. Этот узкий API проверяет один фактический schema-span и учитывает только собственное изменение `contenteditable`. Он не разрешает произвольные атрибуты или обход неизвестных DOM-изменений. Точные selection handles по-прежнему истекают после реального изменения DOM.

## Decorations

`createDecorations(editor, { name })` владеет одной записью нативного CSS Highlight registry. `set([{ from, to }])` заменяет подсветки, `getState()` сообщает поддержку и количество, `destroy()` удаляет только собственную запись. Укажите безопасное уникальное имя и стиль:

```css
::highlight(app-annotation) { background: #ffdf6e; color: #171717; }
```

Диапазоны следуют поддержанным mapping-транзакциям. Истёкшие или удалённые цели удаляются. В неподдержанном браузере состояние `unsupported`: нет тяжёлого fallback или скрытых сохраняемых обёрток. Это диапазонные decorations; произвольные inline widget decorations не входят в этот этап.

## Очистка и безопасность

Освобождайте отслеживаемые позиции, уничтожайте decorations и node views при unmount. Не переносите handles между редакторами и не сохраняйте их в backend. View callbacks не sandbox: не вставляйте непроверенный HTML и не запускайте недоверенный код. Фронтенд-проверки не заменяют проверку данных, загрузок и доступа на сервере.

Фактические результаты запусков приведены в [проверках](/testing). Наличие API и примера само по себе не означает полного покрытия устройств, accessibility или Office-совместимости.
