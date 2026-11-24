# Выбор размера таблицы

На [главной](/ru/#editor) и в [playground](/ru/playground) откройте кнопку таблицы в панели форматирования. Наведение или фокус меняют только предпросмотр; нажатие вставляет таблицу одним шагом Undo. Быстрая сетка ограничена **8 × 8**. Числовые поля рядом по-прежнему позволяют задать **1–100** строк и столбцов.

## Подключение готовой панели

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { createStandardPreset } from '@morfira-dev/wysiwyg/presets/standard';
import { createStandardEditorUI } from '@morfira-dev/wysiwyg/ui/standard';
import { createTablePicker } from '@morfira-dev/wysiwyg/ui/table-picker';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/plugins/tables.css';
import '@morfira-dev/wysiwyg/ui/forms.css';
import '@morfira-dev/wysiwyg/ui/editor.css';
import '@morfira-dev/wysiwyg/ui/table-picker.css';

const editor = createEditor(editorHost, createStandardPreset());
const ui = createStandardEditorUI(toolbarHost, editor, {
  table: { picker: createTablePicker },
});
// При размонтировании сначала ui.destroy(), затем editor.destroy().
```

Пресет устанавливает поведение таблиц; отдельная фабрика добавляет только выбор размера. Без `table.picker` панель сохраняет прежние поля и кнопку, не загружая реализацию сетки. Runtime-переключатель не удаляет уже импортированный код из бандла.

## Самостоятельный виджет

```ts
import { createLocale } from '@morfira-dev/wysiwyg';

const picker = createTablePicker(emptyHost, {
  locale: createLocale('ru'), disabled: false, rows: 3, columns: 3,
  onSelect: (rows, columns) => console.log(rows, columns),
});
picker.refresh({ locale: createLocale('en'), disabled: true });
picker.destroy();
```

Виджет возвращает `element`, `refresh(state)` и идемпотентный `destroy()`. Он не изменяет редактор и не вызывает команды таблиц самостоятельно. Начальные размеры — целые 1–100; для значений больше восьми ограничивается только предпросмотр. `refresh` меняет язык и disabled, сохраняя текущий предпросмотр. Host должен быть пустым. Обработчик приложения отвечает за сохранение выделения и проверку команды; готовая панель делает это сама.

Стрелки перемещают фокус без перехода через край. Home/End выбирают край строки, Ctrl/Meta+Home/End — край матрицы; Enter/Space подтверждают. Tab выходит из единственной точки табуляции, Escape закрывает содержащую панель. Это группа обычных кнопок без focus trap, не ARIA grid. Во время IME выбор не подтверждается. Read-only, внешняя замена документа и уничтожение панели не позволяют устаревшему callback вставить таблицу.

Имена кнопок и status локализованы через `EditorLocale` и экспортируемый `tablePickerMessages`; переопределения `ui.tablePicker.label` и `ui.tablePicker.insert` выводятся как текст. Отдельный CSS использует `.mw-table-picker*` и `--mw-*` переменные. Импорт не обращается к DOM; оформление и поведение таблиц подключаются отдельно. Объединения и проверка вложенных таблиц остаются контрактом [табличных команд](/ru/plugins).
