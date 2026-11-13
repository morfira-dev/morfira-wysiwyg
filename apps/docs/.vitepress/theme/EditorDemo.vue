<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { useData } from 'vitepress';
import type { Editor, ToolbarAction } from '@morfira-dev/wysiwyg';
import type { ImageCommands, ImageValue } from '@morfira-dev/wysiwyg/plugins/images';
import type { TableCommands, TableClipboardData } from '@morfira-dev/wysiwyg/plugins/tables';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/plugins/tables.css';

const props = defineProps<{ full?: boolean }>();
const { lang } = useData();
const ru = computed(() => lang.value === 'ru');
const t = (russian: string, english: string) => ru.value ? russian : english;
const host = ref<HTMLElement>(); const toolbar = ref<HTMLElement>();
const dark = ref(false); const readOnly = ref(false); const ready = ref(false);
const output = ref(''); const outputFormat = ref<'html' | 'json'>('html');
const message = ref(''); const failed = ref(false); const count = ref(0); const words = ref(0);
const undoAvailable = ref(false); const redoAvailable = ref(false); const source = ref('initial');
const sample = ref('showcase');
let labRange: Range | undefined; const heading = ref('0'); const list = ref(''); const alignment = ref('left');
const rows = ref(3); const columns = ref(3); const fromRow = ref(1); const fromColumn = ref(1); const toRow = ref(1); const toColumn = ref(2);
const cellColor = ref('#eeeaff'); const borderColor = ref('#6658e8'); const widthColumn = ref(1); const widthValue = ref(180);
const buffer = ref('Название\tЗначение\nЯдро\tTypeScript\nЛицензия\tMIT'); const bufferFormat = ref<'text' | 'html'>('text');
const url = ref('https://example.com'); const imageURL = ref('/logo.svg'); const imageAlt = ref('Morfira'); const imageWidth = ref<number | string>(64); const imageHeight = ref<number | string>(''); const imageCaption = ref('');
const selectedImage = ref(false); const uploading = ref(false); let imageAPI: ImageCommands | undefined; let inspectedImage = '';
const accent = ref('#6658e8'); const fontSize = ref(16); const padding = ref(28); const radius = ref(12);
const themeStyle = computed(() => ({ '--mw-accent': accent.value, '--mw-font-size': `${fontSize.value}px`, '--mw-padding': `${padding.value}px`, '--mw-radius': `${radius.value}px` }));
const textColor = ref('#6658e8'); const highlight = ref('#fff59d'); const activeStyles = ref('');
const linkTitle = ref(''); const linkText = ref(''); const linkNewTab = ref(false); const editingLink = ref(false);
let inspectedLink = '';
let editor: Editor | undefined; let commands: TableCommands | undefined; let disposeToolbar: (() => void) | undefined;
let unsubscribe: (() => void) | undefined; let unselect: (() => void) | undefined; let cancelled = false;

const article = () => t(
  '<h2>Место для ваших идей.</h2><p>Хороший редактор помогает сосредоточиться на <strong>содержании</strong>. Выделите текст, попробуйте форматирование или добавьте таблицу.</p><p>Маленькое ядро. Только нужные плагины. Ваш дизайн.</p>',
  '<h2>A place for your ideas.</h2><p>A good editor lets you focus on <strong>the content</strong>. Select text, try formatting, or add a table.</p><p>A small core. The plugins you need. Your design.</p>',
);
const tableSample = () => `<h2>${t('Таблицы без лишнего', 'Tables, without the weight')}</h2><p>${t('Выделяйте ячейки, меняйте структуру и вставляйте диапазоны.', 'Select cells, change the structure, and paste ranges.')}</p><table style="width:100%"><thead><tr><th scope="col">${t('Раздел', 'Area')}</th><th scope="col">${t('Возможность', 'Feature')}</th><th scope="col">${t('Статус', 'Status')}</th></tr></thead><tbody><tr><td rowspan="2"><p>${t('Таблицы', 'Tables')}</p></td><td><p>${t('Объединение ячеек', 'Merged cells')}</p></td><td><p>✓</p></td></tr><tr><td><p>HTML / TSV</p></td><td><p>✓</p></td></tr></tbody></table><p><br></p>`;
const listSample = () => t(
  '<h2>Списки, которые слушаются</h2><p>Enter делит пункт, пустой пункт завершает список. Tab и Shift+Tab меняют вложенность вне таблиц; Backspace в начале объединяет пункты.</p><ul><li>Подготовить материал<ol><li>Собрать ссылки</li><li><strong>Проверить факты</strong></li></ol></li><li>Написать черновик</li><li>Опубликовать</li></ul><p>Выдели несколько пунктов и попробуй нумерацию или кнопки отступа.</p>',
  '<h2>Lists that follow your lead</h2><p>Enter splits an item; an empty item exits the list. Tab and Shift+Tab change nesting outside tables; Backspace at the start joins items.</p><ul><li>Prepare the material<ol><li>Collect links</li><li><strong>Check the facts</strong></li></ol></li><li>Write a draft</li><li>Publish</li></ul><p>Select several items and try numbering or the indentation buttons.</p>',
);
const stylingSample = () => `<h2>${t('Цвета и ссылки', 'Colors and links')}</h2><p><span style="color: #6658e8">${t('Цветной текст', 'Colored text')}</span> · <span style="background-color: #fff59d">${t('Важная мысль', 'An important thought')}</span> · <a href="https://example.com" target="_blank" title="Example">${t('Редактируемая ссылка', 'Editable link')}</a></p><p>${t('Выдели часть текста или поставь курсор внутри ссылки. Поля справа сохраняют позицию.', 'Select some text or place the caret in a link. The fields on the right preserve your position.')}</p>`;
const imageSample = () => `<h2>${t('Изображения с подписью', 'Images with captions')}</h2><p>${t('Нажми на изображение и измени размеры, alt или подпись справа.', 'Click the image and edit dimensions, alt text or caption on the right.')}</p><figure><img src="/logo.svg" alt="Morfira" width="160" height="160"><figcaption>${t('Логотип Morfira — редактируемая подпись', 'Morfira logo — an editable caption')}</figcaption></figure><p>${t('Здесь можно продолжить текст.', 'Continue writing here.')}</p>`;
const showcase = () => article() + `<h3>${t('Форматирование', 'Formatting')}</h3><p><strong>${t('Полужирный', 'Bold')}</strong> · <em>${t('Курсив', 'Italic')}</em> · <u>${t('Подчёркнутый', 'Underline')}</u> · <s>${t('Зачёркнутый', 'Strike')}</s> · <code>inline code</code> · H<sub>2</sub>O · x<sup>2</sup></p><blockquote>${t('Редактор должен помогать писать, а не отвлекать.', 'An editor should help you write and stay out of your way.')}</blockquote><ul><li>TypeScript</li><li>MIT</li></ul><ol><li>${t('Выделить', 'Select')}</li><li>${t('Отформатировать', 'Format')}</li></ol><pre>const editor = createEditor(host);</pre><p><a href="https://example.com">${t('Пример ссылки', 'Example link')}</a> · <img src="/logo.svg" alt="Morfira" width="48"></p>` + listSample() + stylingSample() + imageSample() + tableSample();
const refresh = () => {
  if (!editor) return;
  const text = editor.getText().trim(); count.value = text.length; words.value = text ? text.split(/\s+/).length : 0;
  undoAvailable.value = editor.canUndo(); redoAvailable.value = editor.canRedo();
  const range = window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0) : undefined;
  if (range && editor.surface.contains(range.startContainer) && editor.surface.contains(range.endContainer)) labRange = range.cloneRange();
  uploading.value = imageAPI?.isUploading() ?? false;
  if (range && editor.surface.contains(range.startContainer)) {
    const image = imageAPI?.getSelected(); selectedImage.value = Boolean(image);
    const signature = image ? JSON.stringify(image) : '';
    if (image && signature !== inspectedImage) { imageURL.value = image.src; imageAlt.value = image.alt ?? ''; imageWidth.value = image.width ?? ''; imageHeight.value = image.height ?? ''; imageCaption.value = image.caption ?? ''; }
    inspectedImage = signature;
  }
  const formats = editor.getFormats(); const mixed = formats.mixed as string[] | undefined;
  heading.value = mixed?.includes('header') ? 'mixed' : String(formats.header ?? 0);
  list.value = mixed?.includes('list') ? 'mixed' : String(formats.list || '');
  activeStyles.value = ['color', 'background'].map((name) => mixed?.includes(name) ? t('Разное', 'Mixed') : String(formats[name] ?? '—')).join(' / ');
  if (range && editor.surface.contains(range.startContainer)) {
    const node = range.startContainer; const anchor = (node instanceof Element ? node : node.parentElement)?.closest('a');
    editingLink.value = Boolean(anchor);
    const signature = anchor?.outerHTML ?? '';
    if (anchor && signature !== inspectedLink) { url.value = anchor.getAttribute('href') ?? ''; linkTitle.value = anchor.getAttribute('title') ?? ''; linkNewTab.value = anchor.getAttribute('target') === '_blank'; }
    inspectedLink = signature;
  }
  alignment.value = mixed?.includes('align') ? 'mixed' : String(formats.align ?? 'left');
};
const imageClick = (event: MouseEvent) => { if (event.target instanceof HTMLImageElement) refresh(); };
const notify = (text: string, error = false) => { message.value = text; failed.value = error; };
const run = (action: (instance: Editor) => void, mutation = true) => {
  if (!editor || (mutation && readOnly.value)) return;
  try {
    if (labRange && editor.surface.contains(labRange.startContainer) && editor.surface.contains(labRange.endContainer)) { const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(labRange.cloneRange()); }
    editor.focus(); action(editor); refresh(); notify('');
  }
  catch (error) { notify(error instanceof Error ? error.message : String(error), true); }
};
const tableRun = (action: (api: TableCommands) => void, mutation = true) => run(() => { if (commands) action(commands); }, mutation);
const format = (name: string, value: unknown) => run((instance) => instance.format(name, value));
const loadSample = () => run((instance) => { instance.setHTML(sample.value === 'empty' ? '<p><br></p>' : sample.value === 'images' ? imageSample() : sample.value === 'styling' ? stylingSample() : sample.value === 'lists' ? listSample() : sample.value === 'tables' ? tableSample() : sample.value === 'article' ? article() : showcase()); output.value = ''; });
const insertTable = () => tableRun((api) => api.insert(Number(rows.value), Number(columns.value)));
const toggleReadOnly = () => { readOnly.value = !readOnly.value; editor?.setReadOnly(readOnly.value); refresh(); };
const snapshot = (type: 'html' | 'json') => {
  if (!editor) return; outputFormat.value = type; output.value = type === 'html' ? editor.getHTML() : JSON.stringify(editor.getJSON(), null, 2); notify('');
};
const applySource = () => run((instance) => {
  if (outputFormat.value === 'json') instance.setJSON(JSON.parse(output.value)); else instance.setHTML(output.value);
  source.value = 'api';
});
const copyRange = (cut: boolean) => tableRun((api) => {
  const data: TableClipboardData = cut ? api.cut() : api.copy(); buffer.value = bufferFormat.value === 'html' ? data.html : data.text;
}, cut);
const pasteRange = () => tableRun((api) => api.paste(bufferFormat.value === 'html' ? { html: buffer.value } : { text: buffer.value }));
const preserveLabSelection = (event: PointerEvent) => {
  const control = event.target instanceof Element ? event.target.closest('button,input,select,textarea,summary') : null;
  if (props.full && control && !editor?.element.contains(control)) {
    const selection = window.getSelection(); const range = selection?.rangeCount ? selection.getRangeAt(0) : undefined;
    if (range && editor?.surface.contains(range.startContainer) && editor.surface.contains(range.endContainer)) labRange = range.cloneRange();
    event.stopPropagation();
  }
};
const insertLink = () => run((instance) => {
  const create = !instance.getSelection()?.length && !instance.getFormats().link;
  if (create && !linkText.value) throw new Error(t('Укажите подпись новой ссылки или выделите текст.', 'Enter new link text or select text.'));
  instance.format('link', { href: url.value, title: linkTitle.value, target: linkNewTab.value ? '_blank' : '_self', ...(create ? { text: linkText.value } : {}) });
});
const imageValue = (): ImageValue => ({ src: imageURL.value, alt: imageAlt.value, caption: imageCaption.value, ...(imageWidth.value !== '' ? { width: Number(imageWidth.value) } : {}), ...(imageHeight.value !== '' ? { height: Number(imageHeight.value) } : {}) });
const insertImage = () => run(() => imageAPI?.insert(imageValue()));
const updateImage = () => run(() => imageAPI?.update({ ...imageValue(), width: imageWidth.value === '' ? null : Number(imageWidth.value), height: imageHeight.value === '' ? null : Number(imageHeight.value) }));
const uploadImage = (event: Event) => {
  const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return;
  run(() => {
    const operation = imageAPI!.upload(file); uploading.value = imageAPI!.isUploading();
    void operation.then((inserted) => { if (!cancelled) notify(inserted ? t('Демо-изображение вставлено. Файл не отправлялся.', 'Demo image inserted. The file was not uploaded.') : t('Загрузка отменена.', 'Upload cancelled.')); }).catch((error: unknown) => { if (!cancelled) notify(String(error), true); }).finally(() => { uploading.value = false; input.value = ''; });
  });
};
const demoUpload = (_file: File, { signal }: { signal: AbortSignal }): Promise<ImageValue> => new Promise((resolve, reject) => {
  const abort = () => { window.clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new DOMException('Cancelled', 'AbortError')); };
  const timer = window.setTimeout(() => { signal.removeEventListener('abort', abort); resolve({ src: '/logo.svg', alt: 'Morfira demo', width: 160, height: 160, caption: t('Демо результата callback загрузки', 'Demo upload callback result') }); }, 1200);
  if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
});
onMounted(async () => {
  const [{ createEditor, createToolbar }, { tables, tableCommands }, { images, imageCommands }] = await Promise.all([import('@morfira-dev/wysiwyg'), import('@morfira-dev/wysiwyg/plugins/tables'), import('@morfira-dev/wysiwyg/plugins/images')]);
  if (cancelled) return;
  editor = createEditor(host.value!, {
    label: t('Попробуйте Morfira', 'Try Morfira'), plugins: [images({ upload: demoUpload }), tables({ onClipboardError: (error) => notify(error.message, true) })],
    value: props.full ? showcase() : article(),
    onChange: (change) => { source.value = change.source; refresh(); },
  });
  commands = tableCommands(editor); imageAPI = imageCommands(editor);
  editor.surface.addEventListener('click', imageClick);
  const marks: ToolbarAction[] = [
    { label: t('Отменить', 'Undo'), text: '↶', run: (instance) => instance.undo(), enabled: (instance) => instance.canUndo() },
    { label: t('Повторить', 'Redo'), text: '↷', run: (instance) => instance.redo(), enabled: (instance) => instance.canRedo() },
    { label: t('Полужирный', 'Bold'), text: 'B', format: 'bold' },
    { label: t('Курсив', 'Italic'), text: 'I', format: 'italic' },
    { label: t('Подчёркнутый', 'Underline'), text: 'U', format: 'underline' },
    { label: t('Зачёркнутый', 'Strike'), text: 'S̶', format: 'strike' },
    { label: t('Строчный код', 'Inline code'), text: '‹›', format: 'code' },
    { label: t('Нижний индекс', 'Subscript'), text: 'x₂', format: 'subscript' },
    { label: t('Верхний индекс', 'Superscript'), text: 'x²', format: 'superscript' },
    { label: t('Маркированный список', 'Bullet list'), text: '☷', format: 'list', value: 'bullet' },
    { label: t('Нумерованный список', 'Ordered list'), text: '1.', format: 'list', value: 'ordered' },
    { label: t('Увеличить отступ', 'Indent list'), text: '⇥', format: 'indent', value: 1, enabled: (instance) => Boolean(instance.getFormats().canIndent) },
    { label: t('Уменьшить отступ', 'Outdent list'), text: '⇤', format: 'indent', value: -1, enabled: (instance) => Boolean(instance.getFormats().canOutdent) },
    { label: t('Очистить форматирование', 'Clear formatting'), text: 'Tx', format: 'clear', enabled: (instance) => Boolean(instance.getSelection()?.length) },
    { label: t('Цитата', 'Blockquote'), text: '❝', format: 'blockquote' },
    { label: t('Блок кода', 'Code block'), text: '{ }', format: 'code-block' },
  ];
  disposeToolbar = props.full ? createToolbar(toolbar.value!, editor, marks, { label: t('Форматирование', 'Formatting') }) : createToolbar(toolbar.value!, editor);
  unsubscribe = editor.subscribe(refresh); unselect = editor.onSelectionChange(refresh); ready.value = true; refresh();
});
onBeforeUnmount(() => { cancelled = true; editor?.surface.removeEventListener('click', imageClick); unsubscribe?.(); unselect?.(); disposeToolbar?.(); editor?.destroy(); });
</script>

<template>
  <section class="demo-shell" :class="{ 'dark-demo': dark, 'demo-full': full }" :style="themeStyle" :aria-label="t('Стенд возможностей', 'Feature laboratory')" @pointerdown="preserveLabSelection">
    <header v-if="full" class="lab-heading">
      <div><span class="lab-eyebrow">MORFIRA LAB</span><h2>{{ t('Попробуй всё, что уже работает.', 'Try everything that works today.') }}</h2><p>{{ t('Один документ, все команды и прозрачный результат.', 'One document, every command, and a visible result.') }}</p></div>
      <span class="lab-badge">TypeScript · MIT · {{ t('без runtime-зависимостей', 'zero runtime dependencies') }}</span>
    </header>
    <div class="demo-controls">
      <template v-if="full">
        <label>{{ t('Документ', 'Document') }}<select v-model="sample" :aria-label="t('Пример документа', 'Document sample')"><option value="showcase">{{ t('Все форматы', 'All formats') }}</option><option value="article">{{ t('Статья', 'Article') }}</option><option value="lists">{{ t('Списки и вложенность', 'Lists and nesting') }}</option><option value="images">{{ t('Изображения', 'Images') }}</option><option value="styling">{{ t('Цвета и ссылки', 'Colors and links') }}</option><option value="tables">{{ t('Таблицы', 'Tables') }}</option><option value="empty">{{ t('Пустой', 'Empty') }}</option></select></label>
        <button :disabled="!ready || readOnly" @click="loadSample">{{ t('Загрузить пример', 'Load sample') }}</button>
      </template>
      <button v-else :disabled="!ready || readOnly" @click="insertTable">{{ t('+ Таблица 3 × 3', '+ Table 3 × 3') }}</button>
      <button @click="dark = !dark">{{ t('Сменить тему', 'Toggle theme') }}</button>
      <button :disabled="!ready" @click="toggleReadOnly">{{ readOnly ? t('Редактировать', 'Edit') : t('Только чтение', 'Read only') }}</button>
      <button :disabled="!ready" @click="snapshot('html')">HTML</button><button v-if="full" :disabled="!ready" @click="snapshot('json')">JSON</button>
    </div>
    <div v-if="message" class="lab-message" :class="{ 'is-error': failed }" :role="failed ? 'alert' : 'status'">{{ message }}</div>
    <div class="demo-workspace">
      <div class="demo-editing">
        <div v-if="full" class="lab-block-controls">
          <label>{{ t('Блок', 'Block') }}<select v-model="heading" :disabled="!ready || readOnly" :aria-label="t('Формат блока', 'Block format')" @change="heading !== 'mixed' && format('header', Number(heading) || false)"><option value="mixed" disabled>{{ t('Разное', 'Mixed') }}</option><option value="0">{{ t('Абзац', 'Paragraph') }}</option><option v-for="level in 6" :key="level" :value="String(level)">H{{ level }}</option></select></label>
          <label>{{ t('Список', 'List') }}<select v-model="list" :disabled="!ready || readOnly" :aria-label="t('Тип списка', 'List type')" @change="list !== 'mixed' && format('list', list || false)"><option value="mixed" disabled>{{ t('Разное', 'Mixed') }}</option><option value="">{{ t('Нет', 'None') }}</option><option value="bullet">{{ t('Маркеры', 'Bullet') }}</option><option value="ordered">{{ t('Нумерация', 'Ordered') }}</option></select></label>
          <label>{{ t('Выравнивание', 'Alignment') }}<select v-model="alignment" :disabled="!ready || readOnly" :aria-label="t('Выравнивание текста', 'Text alignment')" @change="alignment !== 'mixed' && format('align', alignment)"><option value="mixed" disabled>{{ t('Разное', 'Mixed') }}</option><option value="left">{{ t('Слева', 'Left') }}</option><option value="center">{{ t('По центру', 'Center') }}</option><option value="right">{{ t('Справа', 'Right') }}</option><option value="justify">{{ t('По ширине', 'Justify') }}</option></select></label>
        </div>
        <fieldset v-if="full" :disabled="!ready || readOnly" class="lab-inline-actions lab-color-controls">
          <label>{{ t('Цвет текста', 'Text color') }}<input v-model="textColor" type="color"></label><button @click="format('color', textColor)">{{ t('Применить цвет', 'Apply color') }}</button><button @click="format('color', false)">{{ t('Сбросить цвет', 'Reset color') }}</button>
          <label>{{ t('Выделение цветом', 'Highlight color') }}<input v-model="highlight" type="color"></label><button @click="format('background', highlight)">{{ t('Применить выделение', 'Apply highlight') }}</button><button @click="format('background', false)">{{ t('Сбросить выделение', 'Reset highlight') }}</button>
          <span>{{ t('Текст / фон', 'Text / background') }}: {{ activeStyles }}</span>
        </fieldset>
        <div ref="toolbar"></div><div ref="host"></div>
        <div class="demo-status"><span>{{ count }} {{ t('символов', 'characters') }}<template v-if="full"> · {{ words }} {{ t('слов', 'words') }}</template></span><span v-if="full">undo {{ undoAvailable ? '●' : '○' }} · redo {{ redoAvailable ? '●' : '○' }} · {{ source }}</span><span v-else>{{ t('Таблицы: контекстное меню по правой кнопке', 'Tables: right-click for actions') }}</span></div>
        <p v-if="full" class="lab-hint">{{ t('Выделяй текст перед форматированием. Кликни в ячейку перед табличной командой. Ctrl/Cmd+Z — отмена; Ctrl/Cmd+B/I/U — формат; Enter — новый пункт, пустой — выход; Tab/Shift+Tab — вложенность. В таблице Tab — следующая ячейка.', 'Select text before formatting. Click a cell before a table command. Ctrl/Cmd+Z undoes; Ctrl/Cmd+B/I/U formats; Enter splits an item; an empty item exits. Tab/Shift+Tab nests lists; in tables Tab moves to the next cell.') }}</p>
      </div>
      <aside v-if="full" class="demo-inspector">
        <details open><summary>{{ t('Таблицы', 'Tables') }}</summary><fieldset :disabled="!ready || readOnly">
          <div class="lab-fields"><label>{{ t('Строки', 'Rows') }}<input v-model.number="rows" type="number" min="1" max="100"></label><label>{{ t('Столбцы', 'Columns') }}<input v-model.number="columns" type="number" min="1" max="100"></label></div>
          <button @click="insertTable">{{ t('Вставить таблицу', 'Insert table') }}</button>
          <div class="lab-button-grid"><button @click="tableRun((api) => api.rowAbove())">{{ t('Строка выше', 'Row above') }}</button><button @click="tableRun((api) => api.rowBelow())">{{ t('Строка ниже', 'Row below') }}</button><button @click="tableRun((api) => api.columnLeft())">{{ t('Столбец слева', 'Column left') }}</button><button @click="tableRun((api) => api.columnRight())">{{ t('Столбец справа', 'Column right') }}</button><button @click="tableRun((api) => api.merge())">{{ t('Объединить', 'Merge') }}</button><button @click="tableRun((api) => api.split())">{{ t('Разделить', 'Split') }}</button><button @click="tableRun((api) => api.deleteRow())">{{ t('Удалить строку', 'Delete row') }}</button><button @click="tableRun((api) => api.deleteColumn())">{{ t('Удалить столбец', 'Delete column') }}</button></div>
          <button class="lab-danger" @click="tableRun((api) => api.remove())">{{ t('Удалить таблицу', 'Delete table') }}</button>
          <hr><p class="lab-hint">{{ t('Прямоугольное выделение: номера с 1.', 'Rectangle selection: positions start at 1.') }}</p>
          <div class="lab-fields"><label>{{ t('От строки', 'From row') }}<input v-model.number="fromRow" type="number" min="1"></label><label>{{ t('От столбца', 'From column') }}<input v-model.number="fromColumn" type="number" min="1"></label><label>{{ t('До строки', 'To row') }}<input v-model.number="toRow" type="number" min="1"></label><label>{{ t('До столбца', 'To column') }}<input v-model.number="toColumn" type="number" min="1"></label></div>
          <button @click="tableRun((api) => api.select({ row: fromRow - 1, column: fromColumn - 1 }, { row: toRow - 1, column: toColumn - 1 }), false)">{{ t('Выделить диапазон', 'Select range') }}</button>
          <div class="lab-fields"><label>{{ t('Фон ячеек', 'Cell background') }}<input v-model="cellColor" type="color" @change="tableRun((api) => api.background(cellColor))"></label><label>{{ t('Границы', 'Cell borders') }}<input v-model="borderColor" type="color" @change="tableRun((api) => api.border(borderColor))"></label><label>{{ t('Номер столбца', 'Column number') }}<input v-model.number="widthColumn" type="number" min="1"></label><label>{{ t('Ширина, px', 'Width, px') }}<input v-model.number="widthValue" type="number" min="40" max="4000"></label></div>
          <button @click="tableRun((api) => api.columnWidth(widthColumn - 1, widthValue))">{{ t('Применить ширину', 'Apply width') }}</button>
        </fieldset></details>
        <details><summary>{{ t('Ссылки и изображения', 'Links and images') }}</summary><fieldset :disabled="!ready || readOnly">
          <label>{{ t('Адрес ссылки', 'Link URL') }}<input v-model="url" type="text"></label><label>{{ t('Заголовок ссылки', 'Link title') }}<input v-model="linkTitle" type="text"></label><label>{{ t('Подпись новой ссылки', 'New link text') }}<input v-model="linkText" type="text"></label><label class="lab-checkbox"><input v-model="linkNewTab" type="checkbox">{{ t('В новой вкладке', 'Open in new tab') }}</label><div class="lab-button-grid"><button @click="insertLink">{{ editingLink ? t('Обновить ссылку', 'Update link') : t('Создать ссылку', 'Create link') }}</button><button @click="format('link', false)">{{ t('Убрать ссылку', 'Remove link') }}</button></div>
          <hr><label>{{ t('URL изображения', 'Image URL') }}<input v-model="imageURL" type="text"></label><div class="lab-fields"><label>Alt<input v-model="imageAlt" type="text"></label><label>{{ t('Ширина изображения', 'Image width') }}<input v-model.number="imageWidth" type="number" min="1" max="1000"></label><label>{{ t('Высота изображения', 'Image height') }}<input v-model="imageHeight" type="number" min="1" max="1000"></label></div><label>{{ t('Подпись изображения', 'Image caption') }}<input v-model="imageCaption" type="text" maxlength="5000"></label><button @click="insertImage">{{ t('Вставить изображение', 'Insert image') }}</button><div class="lab-button-grid"><button :disabled="!selectedImage" @click="updateImage">{{ t('Обновить изображение', 'Update image') }}</button><button :disabled="!selectedImage" @click="run(() => imageAPI?.remove())">{{ t('Удалить изображение', 'Remove image') }}</button></div>
          <label>{{ t('Файл для демо загрузки', 'Demo upload file') }}<input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/avif" :disabled="uploading" @change="uploadImage"></label>
          <button :disabled="!uploading" @click="imageAPI?.cancelUpload()">{{ t('Отменить загрузку', 'Cancel upload') }}</button><p role="status" aria-live="polite">{{ uploading ? t('Загрузка…', 'Uploading…') : '' }}</p>
          <p class="lab-hint">{{ t('Локальный callback возвращает логотип вместо файла. Файл не отправляется и не сохраняется. Для своего сервера передайте upload callback. Пустые размеры снимают ограничения; подпись редактируется и в документе. Resize мышью пока нет.', 'The local callback returns the logo instead of the file. Files are not uploaded or stored. Supply an upload callback for your server. Empty dimensions remove limits; captions are also editable in the document. Drag resizing is not implemented.') }}</p>
        </fieldset></details>
        <details><summary>{{ t('Оформление', 'Appearance') }}</summary><div class="lab-fields"><label>{{ t('Акцент', 'Accent') }}<input v-model="accent" type="color"></label><label>{{ t('Размер текста', 'Text size') }}<input v-model.number="fontSize" type="number" min="12" max="28"></label><label>{{ t('Отступы', 'Padding') }}<input v-model.number="padding" type="number" min="8" max="64"></label><label>{{ t('Скругление', 'Radius') }}<input v-model.number="radius" type="number" min="0" max="28"></label></div><p class="lab-hint">{{ t('Меняет CSS-переменные этого экземпляра. Содержимое документа не меняется.', 'Changes CSS variables for this instance without editing the document.') }}</p></details>
      </aside>
    </div>
    <template v-if="full">
      <div class="lab-data-grid">
        <details open><summary>{{ t('Буфер диапазона · HTML / TSV', 'Range buffer · HTML / TSV') }}</summary><label>{{ t('Формат буфера', 'Buffer format') }}<select :aria-label="t('Формат буфера', 'Buffer format')" v-model="bufferFormat"><option value="text">TSV</option><option value="html">HTML</option></select></label><label>{{ t('Содержимое буфера', 'Buffer contents') }}<textarea :aria-label="t('Содержимое буфера', 'Buffer contents')" v-model="buffer" class="lab-code" rows="5" spellcheck="false"></textarea></label><div class="lab-inline-actions"><button :disabled="!ready" @click="copyRange(false)">{{ t('Копировать диапазон', 'Copy range') }}</button><button :disabled="!ready || readOnly" @click="copyRange(true)">{{ t('Вырезать диапазон', 'Cut range') }}</button><button :disabled="!ready || readOnly" @click="pasteRange">{{ t('Вставить диапазон', 'Paste range') }}</button></div><p class="lab-hint">{{ t('Это буфер стенда без разрешений браузера. Системный буфер тоже работает: Ctrl/Cmd+C/X/V в редакторе. TSV разделяет столбцы табами.', 'This in-page buffer needs no browser permissions. Native Ctrl/Cmd+C/X/V also works in the editor. TSV uses tabs between columns.') }}</p></details>
        <details open><summary>{{ t('Документ · HTML / JSON', 'Document · HTML / JSON') }}</summary><label>{{ t('Формат документа', 'Document format') }}<select :aria-label="t('Формат документа', 'Document format')" v-model="outputFormat"><option value="html">HTML</option><option value="json">JSON v1</option></select></label><label>{{ t('Исходник документа', 'Document source') }}<textarea :aria-label="t('Исходник документа', 'Document source')" v-model="output" class="lab-code" rows="5" spellcheck="false"></textarea></label><div class="lab-inline-actions"><button :disabled="!ready" @click="snapshot(outputFormat)">{{ t('Получить снимок', 'Get snapshot') }}</button><button :disabled="!ready || readOnly" @click="applySource">{{ t('Применить документ', 'Apply document') }}</button></div><p class="lab-hint">{{ t('Снимок обновляется по кнопке. Применение заменяет документ и сбрасывает историю. Данные остаются в памяти вкладки.', 'Snapshots update on request. Applying replaces the document and resets history. Data stays in this browser tab.') }}</p></details>
      </div>
      <p class="lab-limits">{{ t('Пока нет: совместного редактирования, комментариев, track changes, пагинации, DOCX/PDF и resize изображений мышью. Адаптеры Vue/React/Svelte и примеры подключения — в документации.', 'Not implemented: collaboration, comments, track changes, pagination, DOCX/PDF and image drag resizing. Vue/React/Svelte adapters and integration examples are in the docs.') }}</p>
    </template>
    <pre v-else-if="output" class="demo-output">{{ output }}</pre>
  </section>
</template>
