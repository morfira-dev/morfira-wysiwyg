<script setup>
import CodeBlocksExample from '../.vitepress/theme/CodeBlocksExample.vue';
</script>

# Блоки кода

Необязательный плагин сохраняет буквальный исходник, язык, пробелы, табуляции и переносы строк. Отдельная модалка позволяет вставить или изменить код, выбрать язык и скопировать исходник. Подсветка подключается приложением отдельно и не меняет сохраняемый документ.

<CodeBlocksExample />

## Подключение

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { codeBlocks, codeBlockCommands } from '@morfira-dev/wysiwyg/plugins/code-blocks';
import { createCodeBlockForm, createCodeBlockView } from '@morfira-dev/wysiwyg/ui/code-blocks';
import '@morfira-dev/wysiwyg/ui/code-blocks.css';

const editor = createEditor(host, { plugins: [codeBlocks()] });
const commands = codeBlockCommands(editor);
const form = createCodeBlockForm(formHost, editor);
const view = createCodeBlockView(viewHost, editor); // Без провайдера — буквальный текст.
editor.setSelection(0);
commands.insert({ source: 'const sum = (a, b) => a + b;\n', language: 'javascript' });
// Контейнеры formHost/viewHost — вне editor.surface в том же document.
```

## API и клавиатура

`codeBlocks({ languages? })` принимает 1–32 уникальных ID языка `[a-z][a-z0-9-]{0,31}`; `plaintext` всегда доступен и входит в лимит. По умолчанию доступны plaintext, typescript, javascript, html, css, json и bash. Никакая грамматика автоматически не загружается.

`commands.languages` — неизменяемый список. `insert({source, language?})` вставляет PRE в курсор внутри обычного корневого абзаца/заголовка, сохраняя части до и после. Выделение нескольких блоков, списки и таблицы не поддерживаются этой командой. `update(actualPRE, value)`, `remove(actualPRE)`, `get(actualPRE)` и `exit(actualPRE)` работают только с актуальным корневым PRE данного редактора; изменения участвуют в Undo/Redo.

Внутри PRE Enter и Shift+Enter вставляют LF, Tab — буквальную табуляцию, Ctrl/⌘+Enter создаёт обычный абзац после блока. Backspace в начале и Delete в конце не сливают код с соседями. Внутренний обычный ввод/удаление и IME остаются нативными; во время composition команды не вмешиваются. Вставка принимает только plain text, без интерпретации HTML или файлов. Shift+Tab сохраняет стандартное перемещение фокуса.

`form.open()` запоминает актуальную позицию вставки; `form.open(actualPRE)` открывает редактирование. `getValue()`/`setValue({source,language?})` читают/меняют черновик, `close()` отменяет его, `destroy()` очищает форму. Обычный Enter внутри textarea сохраняет перенос; Ctrl/⌘+Enter применяет. Копирование использует Clipboard API по нажатию, отказ не меняет документ. При размонтировании вызовите `form.destroy()`, `view.destroy()` и `editor.destroy()`.

## Необязательная подсветка

```ts
const view = createCodeBlockView(viewHost, editor, {
  highlight: async ({ source, language, signal }) => {
    // Приложение само выбирает и при необходимости лениво загружает провайдер.
    // Верните UTF-16 интервалы, а не HTML.
    return source.startsWith('const')
      ? [{ from: 0, to: 5, kind: 'keyword' as const }]
      : [];
  },
});
```

Разрешены `keyword`, `string`, `number`, `comment`, `operator`, `punctuation`, `type`; до 4096 непересекающихся упорядоченных интервалов внутри исходника. Результат строится через text nodes и span с фиксированными CSS-классами. Ошибка/невалидный ответ оставляют буквальный текст. Новые версии исходника и destroy отменяют запрос через `AbortSignal` и игнорируют опоздавшие ответы. UI и CSS подключаются отдельно; `--mw-code-*`, `--mw-*` позволяют настроить вид.

## Границы и безопасность

Сохраняется schema-v1 PRE с `data-mw-node="morfira:code-block"`, разрешённым `data-language` и текстом до 20000 UTF-16 единиц. CRLF/CR нормализуются в LF, остальные пробелы и trailing LF сохраняются. HTML/JSON проходят общую валидацию; принимающему редактору нужен тот же плагин для сохранения метаданных языка. Старый читатель может сохранить PRE-текст, потеряв метаданные.

Исходник не выполняется. Готового редактора кода, компилятора, сетевого загрузчика грамматик и arbitrary HTML подсветки нет. Гарантии реальных IME/устройств отдельно не заявляются. Провайдер — доверенный код приложения; CSP и серверная валидация сохраняют свои границы.

Дополнительный CSS форм и предпросмотра использует native CSS nesting: Chrome 112+, Firefox 117+, Safari 16.5+. Это требование отдельного UI-стиля; команды и сохраняемый формат не зависят от него.
