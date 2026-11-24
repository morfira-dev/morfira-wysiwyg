<script setup>
import TextToolsExample from '../.vitepress/theme/TextToolsExample.vue';
</script>

# Интервалы и перенос форматирования

Два независимых плагина дополняют обычное оформление: `textLayout()` управляет
межстрочным интервалом и отступами абзацев, `formatPainter()` переносит inline-
форматирование. Они не включаются в пресеты автоматически и не имеют runtime-
зависимостей. UI и CSS подключаются отдельно.

<TextToolsExample />

## Подключение

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { textLayout, textLayoutCommands } from '@morfira-dev/wysiwyg/plugins/text-layout';
import { formatPainter, formatPainterCommands } from '@morfira-dev/wysiwyg/plugins/format-painter';
import { createTextLayoutUI } from '@morfira-dev/wysiwyg/ui/text-layout';
import { createFormatPainterUI } from '@morfira-dev/wysiwyg/ui/format-painter';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/ui/text-layout.css';
import '@morfira-dev/wysiwyg/ui/format-painter.css';

const editor = createEditor(host, { plugins: [textLayout(), formatPainter()] });
const spacing = textLayoutCommands(editor);
const painter = formatPainterCommands(editor);
const layoutUI = createTextLayoutUI(layoutHost, editor);
const painterUI = createFormatPainterUI(painterHost, editor);
// Хосты — пустые подключённые элементы снаружи документа редактора.
// При размонтировании: layoutUI.destroy(); painterUI.destroy(); editor.destroy();
```

## Интервалы

| Метод | Значение |
| --- | --- |
| `setLineHeight(value)` | Число 0.5–4, максимум три десятичных знака; `false` сбрасывает |
| `setSpaceBefore(value)` | Целое 0–96 px перед абзацем; `false` сбрасывает |
| `setSpaceAfter(value)` | Целое 0–96 px после абзаца; `false` сбрасывает |
| `getState()` | `disabled`, `lineHeight`, `spaceBefore`, `spaceAfter` и три `*Mixed` |

Состояние показывает явные значения, не вычисленные стили темы. Отсутствие и
смешанное значение возвращают `false`, смешанность отмечается отдельно. UI
показывает импортированное допустимое значение как «Текущий», если его нет в
готовом списке. Сброс восстанавливает наследование/правила CSS приложения.

Цель — обычный P/H1–H6 у курсора или соседние такие блоки одного родителя и
одной ячейки. Поддерживаются блоки внутри пункта списка и цитаты. Между пунктами,
ячейками, через вложенные ветки, PRE, semantic nodes или блоки с изображениями
команда недоступна. Конечный блок включается даже при конце выделения в его
начале. Команда сохраняет реальные узлы и направление выделения; одно изменение
— один Undo. Read-only/composition блокируют редактирование.

`line-height`, `margin-top`, `margin-bottom` сохраняются через HTML/JSON и без
плагина, только на P/H1–H6 и в указанных диапазонах. Произвольные CSS, проценты,
функции и отрицательные отступы не разрешены. Номер schema v1 не меняется;
старые читатели могут потерять новые стили. Соседние вертикальные отступы могут
схлопываться по обычным правилам CSS: это не фиксированное расстояние в пикселях.

## Перенос форматирования

`capture(): boolean` запоминает единообразное форматирование у курсора или в
выделении **внутри одного обычного абзаца/заголовка**. Копируются bold, italic,
underline, strike, code, subscript, superscript, цвет, фон, семейство и размер
шрифта. Отсутствующие параметры становятся сбросом соответствующего формата.
Смешанный источник отклоняется, предыдущий снимок сохраняется.

`apply(): boolean` заменяет эти форматы только у выделенного текста одного
обычного блока. Ссылки, текст за пределами выделения, структура, ID упоминаний,
отступы и тип заголовка не копируются. Блоки с semantic nodes/изображениями и
структурные выделения не поддерживаются. Применение — одна транзакция истории.
Снимок остаётся доступен для следующих применений; `clear()` очищает его.
`getState()` возвращает `captured`, `canCapture`, `canApply`.

Снимок принадлежит экземпляру: замена документа через API и destroy его
очищают. Capture не изменяет документ или историю, допускается в read-only и
отклоняется при composition. Apply запрещён в read-only/composition и повторно
проверяет точные границы после фокуса, чтобы callback не перенаправил старую
команду на новое выделение. Внешний UI использует revision-bound selection handles
и отказывается применять устаревшую цель. UI реагирует на RU/EN locale, read-only
и destroy; все слушатели удаляются вместе с контроллером.

Новые проверки и размеры фиксируются по фактическому прогону в [статусе](/ru/testing).
Доступность физических устройств и скринридеров этим примером не подтверждается.


CSS готовых элементов управления использует нативную вложенность селекторов: Chrome 112+, Firefox 117+, Safari 16.5+. Команды плагинов не зависят от этого CSS.

CSS двух необязательных UI использует native nesting: Chrome 112+, Firefox 117+,
Safari 16.5+. Это требование только этих стилей, не headless-команд или ядра.
Для более старых CSS-движков приложение может преобразовать стили своим сборщиком.
