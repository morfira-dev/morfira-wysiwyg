<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { useData } from 'vitepress';
import type { Editor, EditorChange } from '@morfira-dev/wysiwyg';
import type { MentionOption, SlashOption, SuggestionController, SuggestionState, SuggestionOption, SuggestionQuery } from '@morfira-dev/wysiwyg/plugins/suggestions';
import type { MarkdownCommands } from '@morfira-dev/wysiwyg/plugins/markdown';
import type { StatisticsCommands, StatisticsState } from '@morfira-dev/wysiwyg/plugins/statistics';
import type { ImageValue } from '@morfira-dev/wysiwyg/plugins/images';
import type { LinkFormController } from '@morfira-dev/wysiwyg/ui/links';
import type { ImageFormController } from '@morfira-dev/wysiwyg/ui/images';
import type { SearchFormController } from '@morfira-dev/wysiwyg/ui/search';
import type { TableCommands, TableClipboardData } from '@morfira-dev/wysiwyg/plugins/tables';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/ui/forms.css';
import '@morfira-dev/wysiwyg/ui/editor.css';
import '@morfira-dev/wysiwyg/plugins/suggestions.css';
import '@morfira-dev/wysiwyg/plugins/tables.css';

const props = defineProps<{ full?: boolean }>();
const { lang } = useData();
const ru = computed(() => lang.value === 'ru');
const t = (russian: string, english: string) => ru.value ? russian : english;
const editorLocale = ref(ru.value ? 'ru' : 'en');
const host = ref<HTMLElement>(); const toolbar = ref<HTMLElement>();
const linkFormHost = ref<HTMLElement>();
const imageFormHost = ref<HTMLElement>();
const searchFormHost = ref<HTMLElement>();
let linkForm: LinkFormController | undefined;
let imageForm: ImageFormController | undefined;
let searchForm: SearchFormController | undefined;
const dark = ref(false); const readOnly = ref(false); const ready = ref(false);
const output = ref(''); const outputFormat = ref<'html' | 'json'>('html');
const message = ref(''); const failed = ref(false); const count = ref(0); const words = ref(0);
const undoAvailable = ref(false); const redoAvailable = ref(false); const source = ref('initial');
const providerMode = ref<'normal' | 'empty' | 'error'>('normal'); const providerDelay = ref(250);
const mentionState = ref<SuggestionState<MentionOption>>({ status: 'closed', query: '', items: [], activeIndex: -1 });
const slashState = ref<SuggestionState<SlashOption>>({ status: 'closed', query: '', items: [], activeIndex: -1 });
let mentionAPI: SuggestionController<MentionOption> | undefined; let slashAPI: SuggestionController<SlashOption> | undefined;
let unmention: (() => void) | undefined; let unslash: (() => void) | undefined;
const suggestionStatus = computed(() => { const state = mentionState.value.status !== 'closed' ? mentionState.value : slashState.value; return state.status === 'closed' ? t('Подсказки закрыты', 'Suggestions closed') : state.status === 'loading' ? t('Загрузка вариантов…', 'Loading choices…') : state.status === 'error' ? t('Ошибка: попробуйте открыть подсказки снова.', 'Error: try opening suggestions again.') : t(`Найдено вариантов: ${state.items.length}`, `Choices found: ${state.items.length}`); });
const sample = ref('showcase'); const markdownEnabled = ref(true); let markdownAPI: MarkdownCommands | undefined;
const statisticsState = ref<StatisticsState>({ document: { characters: 0, charactersWithoutWhitespace: 0, words: 0 }, selection: { characters: 0, charactersWithoutWhitespace: 0, words: 0 } });
let statisticsAPI: StatisticsCommands | undefined; let unstatistics: (() => void) | undefined;
let labRange: Range | undefined; let labBackward = false;
const heading = ref('0'); const list = ref(''); const alignment = ref('left');
const pasteTarget = ref<'root' | 'quote' | 'cell'>('root');
const pastePlain = ref('First <literal>\nSecond');
const pasteHTML = ref('<p><strong>First</strong></p><h3><u>Second</u></h3>');
const listReplacement = ref('X');
const listInlineHTML = ref('<u>Inserted</u>');
const listBlockHTML = ref('<p><strong>First</strong></p>\n<h3 style="text-align: right"><em>Middle</em></h3>\n<p><u>Last</u></p>');
const listHeadingHTML = ref('<h2 title="Inserted heading" style="text-align: right"><em>Title</em></h2>');
const listBlockCaret = ref<'start' | 'middle' | 'end'>('middle');
const listBodyMode = ref<'inline' | 'paragraph' | 'heading' | 'mixed' | 'multiblock'>('inline');
const listBackspaceScenario = ref<'join' | 'root' | 'nested' | 'nested-followed'>('join');
const rows = ref(3); const columns = ref(3); const fromRow = ref(1); const fromColumn = ref(1); const toRow = ref(1); const toColumn = ref(2);
const cellColor = ref('#eeeaff'); const borderColor = ref('#6658e8'); const widthColumn = ref(1); const widthValue = ref(180);
const buffer = ref('Название\tЗначение\nЯдро\tTypeScript\nЛицензия\tMIT'); const bufferFormat = ref<'text' | 'html'>('text');
const accent = ref('#6658e8'); const fontSize = ref(16); const padding = ref(28); const radius = ref(12);
const themeStyle = computed(() => ({ '--mw-accent': accent.value, '--mw-font-size': `${fontSize.value}px`, '--mw-padding': `${padding.value}px`, '--mw-radius': `${radius.value}px` }));
const textColor = ref('#6658e8'); const highlight = ref('#fff59d'); const activeStyles = ref('');
let editor: Editor | undefined; let commands: TableCommands | undefined; let disposeEditorUI: (() => void) | undefined;
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
const inputSample = () => '<p>Alpha <strong>one</strong></p><h2><em>Beta</em> tail</h2><p>Keep</p><blockquote><p>Quote <strong>one</strong></p><p><em>two</em> end</p></blockquote><table><tbody><tr><td rowspan="2"><p>Cell <strong>one</strong></p><h3><em>two</em> end</h3></td><td><p>Neighbor A</p></td></tr><tr><td><p>Neighbor B</p></td></tr></tbody></table><p><br></p>';
const listSelectionSample = () => {
  if (listBodyMode.value === 'multiblock')
    return '<ul><li><p style="text-align: center">Alpha <strong>one</strong></p><h2>Middle</h2></li><li><h3 style="text-align: right"><em>Beta</em> tail</h3><p>After body</p><ul><li>Nested branch</li></ul></li><li>Keep item</li></ul><p>Keep paragraph</p>';
  const body = (html: string, last: boolean) => {
    const tag = listBodyMode.value === 'paragraph' ? 'p'
      : listBodyMode.value === 'heading' ? (last ? 'h3' : 'h2')
      : listBodyMode.value === 'mixed' ? (last ? 'h3' : 'p') : undefined;
    return tag ? `<${tag} style="text-align: ${last ? 'right' : 'center'}">${html}</${tag}>` : html;
  };
  return `<ul><li>${body('Alpha <strong>one</strong>', false)}</li><li>${body('<em>Beta</em> tail', true)}<ul><li>Nested branch</li></ul></li><li>Keep item</li></ul><p>Keep paragraph</p>`;
};
const imageSample = () => `<h2>${t('Изображения с подписью', 'Images with captions')}</h2><p>${t('Нажми на изображение и измени размеры, alt или подпись справа.', 'Click the image and edit dimensions, alt text or caption on the right.')}</p><figure><img src="/logo.svg" alt="Morfira" width="160" height="160"><figcaption>${t('Логотип Morfira — редактируемая подпись', 'Morfira logo — an editable caption')}</figcaption></figure><p>${t('Здесь можно продолжить текст.', 'Continue writing here.')}</p>`;
const statisticsSample = () => `<h2>${t('Unicode и статистика', 'Unicode and statistics')}</h2><p>e<strong>́</strong> · 👨‍👩‍👧‍👦 · 🇷🇺 · ${t('Привет, мир!', 'Hello, world!')}</p><p>${t('Выдели букву с комбинируемым знаком или эмодзи и открой панель статистики: считаются видимые графемы, а не UTF-16 единицы.', 'Select a combining sequence or emoji and open Statistics: the counter measures visible graphemes rather than UTF-16 units.')}</p>`;
const suggestionSample = () => `<h2>${t('Упоминания и slash-шаблоны', 'Mentions and slash snippets')}</h2><p>${t('Вводи @an для людей или /sig в начале абзаца для текстового шаблона. ArrowUp/Down выбирают, Enter вставляет, Escape закрывает.', 'Type @an for people or /sig at the beginning of a paragraph for a text snippet. ArrowUp/Down navigate, Enter inserts, Escape dismisses.')}</p><p>@an</p><p>/sig</p><p>/h2 · /bullet · /ordered · /quote · /code · /table</p><p>${t('Загруженные примеры буквальны. Кликни в конец токена и открой подсказки кнопкой справа, либо начни новый пример.', 'Loaded examples stay literal. Place the caret at a token end and use Open suggestions on the right, or start a new example.')}</p><p><br></p>`;
const markdownSample = () => `<h2>Markdown shortcuts</h2><p>${t('Эти примеры загружены как обычный текст. Для преобразования введи маркеры сам и нажми Space; для code fence или разделителя доступен также Enter.', 'These examples are loaded as literal text. Type markers yourself and press Space to transform; code fences and horizontal rules also accept Enter.')}</p><p># ${t('Заголовок', 'Heading')}</p><p>- ${t('Пункт', 'Item')}</p><p>&gt; ${t('Цитата', 'Quote')}</p><p>**${t('полужирный', 'bold')}** · _${t('курсив', 'italic')}_ · ~~${t('зачёркнутый', 'strike')}~~ · \`${t('код', 'code')}\`</p><p>${t('Последняя пустая строка — для твоего ввода. Undo возвращает текст до клавиши-триггера.', 'Use the final empty line for typing. Undo restores text before the trigger key.')}</p><p><br></p>`;
const searchSample = () => `<h2>${t('Поиск и замена', 'Find and replace')}</h2><p><strong>Mor</strong>fira ${t('помогает писать', 'helps you write')}. <em>Morfira</em> ${t('сохраняет стили', 'preserves styles')}.</p><p><a href="https://example.com">MORFIRA</a> · morfira</p><ul><li>Morfira ${t('в списке', 'in a list')}</li></ul><table><tbody><tr><td rowspan="2"><p>Morfira</p></td><td>A</td></tr><tr><td>B</td></tr></tbody></table><figure><img src="/logo.svg" alt="Morfira" width="64"><figcaption>Morfira</figcaption></figure><p>MorfiraPlus — ${t('совпадение только без целого слова', 'a match only with whole word disabled')}.</p>`;
const showcase = () => article() + `<h3>${t('Форматирование', 'Formatting')}</h3><p><strong>${t('Полужирный', 'Bold')}</strong> · <em>${t('Курсив', 'Italic')}</em> · <u>${t('Подчёркнутый', 'Underline')}</u> · <s>${t('Зачёркнутый', 'Strike')}</s> · <code>inline code</code> · H<sub>2</sub>O · x<sup>2</sup></p><blockquote>${t('Редактор должен помогать писать, а не отвлекать.', 'An editor should help you write and stay out of your way.')}</blockquote><ul><li>TypeScript</li><li>MIT</li></ul><ol><li>${t('Выделить', 'Select')}</li><li>${t('Отформатировать', 'Format')}</li></ol><pre>const editor = createEditor(host);</pre><p><a href="https://example.com">${t('Пример ссылки', 'Example link')}</a> · <img src="/logo.svg" alt="Morfira" width="48"></p>` + listSample() + stylingSample() + imageSample() + statisticsSample() + markdownSample() + suggestionSample() + searchSample() + tableSample();
const updateStatistics = (state: StatisticsState) => { statisticsState.value = state; count.value = state.document.characters; words.value = state.document.words; };
const refresh = () => {
  if (!editor) return;
  if (!statisticsAPI) { const text = editor.getText().trim(); count.value = text.length; words.value = text ? text.split(/\s+/).length : 0; }
  undoAvailable.value = editor.canUndo(); redoAvailable.value = editor.canRedo();
  const range = window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0) : undefined;
  if (range && editor.surface.contains(range.startContainer) && editor.surface.contains(range.endContainer)) {
    labRange = range.cloneRange();
    const selection = window.getSelection()!;
    labBackward = !range.collapsed && selection.anchorNode === range.endContainer && selection.anchorOffset === range.endOffset;
  }
  const formats = editor.getFormats(); const mixed = formats.mixed as string[] | undefined;
  heading.value = mixed?.includes('header') ? 'mixed' : String(formats.header ?? 0);
  list.value = mixed?.includes('list') ? 'mixed' : String(formats.list || '');
  activeStyles.value = ['color', 'background'].map((name) => mixed?.includes(name) ? t('Разное', 'Mixed') : String(formats[name] ?? '—')).join(' / ');
  alignment.value = mixed?.includes('align') ? 'mixed' : String(formats.align ?? 'left');
};
const notify = (text: string, error = false) => { message.value = text; failed.value = error; };
const run = (action: (instance: Editor) => void, mutation = true) => {
  if (!editor || (mutation && readOnly.value)) return;
  try {
    if (labRange && editor.surface.contains(labRange.startContainer) && editor.surface.contains(labRange.endContainer)) {
      const selection = window.getSelection()!;
      if (labBackward) selection.setBaseAndExtent(labRange.endContainer, labRange.endOffset, labRange.startContainer, labRange.startOffset);
      else { selection.removeAllRanges(); selection.addRange(labRange.cloneRange()); }
    }
    editor.focus(); action(editor); refresh(); notify('');
  }
  catch (error) { notify(error instanceof Error ? error.message : String(error), true); }
};
const tableRun = (action: (api: TableCommands) => void, mutation = true) => run(() => { if (commands) action(commands); }, mutation);
const format = (name: string, value: unknown) => run((instance) => instance.format(name, value));
const toggleMarkdown = () => { markdownAPI?.setEnabled(markdownEnabled.value); };
const updateEditorLocale = () => {
  editor?.setLocale(editorLocale.value);
};
const startMarkdown = () => run((instance) => { instance.setHTML('<p><br></p>'); instance.setSelection(0); });
const closeSuggestions = () => { mentionAPI?.close(); slashAPI?.close(); };
const openSuggestions = () => run(() => { closeSuggestions(); if (!mentionAPI?.open()) slashAPI?.open(); }, false);
const startStructuralSlash = (command: string) => run((instance) => { const text = `/${command}`; instance.setHTML(`<p>${text}</p>`); instance.setSelection(text.length); slashAPI?.open(); });
const startSuggestions = (kind: 'mentions' | 'slash') => run((instance) => { const text = kind === 'mentions' ? '@an' : '/sig'; instance.setHTML(`<p>${text}</p>`); instance.setSelection(text.length); (kind === 'mentions' ? mentionAPI : slashAPI)?.open(); });
const sampleFactories: Record<string, () => string> = {
  empty: () => '<p><br></p>', input: inputSample, paste: inputSample, 'list-selection': listSelectionSample, suggestions: suggestionSample,
  markdown: markdownSample, statistics: statisticsSample, search: searchSample,
  images: imageSample, styling: stylingSample, lists: listSample,
  tables: tableSample, article, showcase,
};
const loadSample = () => run((instance) => {
  instance.setHTML((sampleFactories[sample.value] ?? showcase)());
  output.value = '';
});
const loadListBodySample = () => {
  sample.value = 'list-selection';
  loadSample();
};
const loadListBackspaceSample = () => run((instance) => {
  const body = '<p style="text-align: center">Alpha <strong>one</strong></p><h2>Middle</h2>';
  const branch = '<ul><li>Nested branch</li></ul>';
  const value = listBackspaceScenario.value === 'join'
    ? `<ul><li>${body}</li><li title="Backspace target"><h3 style="text-align: right"><em>Beta</em> tail</h3><p>After body</p>${branch}</li><li>Keep item</li></ul><p>Keep paragraph</p>`
    : listBackspaceScenario.value === 'root'
      ? `<ul title="Backspace list"><li title="Backspace target">${body}${branch}</li><li>Keep item</li></ul><p>Keep paragraph</p>`
      : listBackspaceScenario.value === 'nested-followed'
        ? `<ul><li title="Backspace owner">Owner<ul title="Earlier branch"><li>Earlier branch</li></ul><ol title="Backspace list"><li title="Backspace target"><p><em>Beta</em> tail</p><h3>After body</h3>${branch}</li><li>Tail sibling</li></ol><ul title="Later bullet branch" style="text-align: right"><li>Later bullet</li></ul><ol title="Later ordered branch" style="text-align: center"><li>Later ordered</li></ol></li><li>Keep item</li></ul><p>Keep paragraph</p>`
        : `<ul><li>Owner<ul title="Backspace list"><li title="Backspace target"><p><em>Beta</em> tail</p><h3>After body</h3>${branch}</li><li>Tail sibling</li></ul></li><li>Keep item</li></ul><p>Keep paragraph</p>`;
  instance.setHTML(value);
  output.value = '';
});
const selectListBackspace = () => run((instance) => {
  const body = instance.surface.querySelector('li[title="Backspace target"]')?.firstElementChild;
  if (!(body instanceof HTMLElement) || !body.matches('p,h1,h2,h3,h4,h5,h6'))
    throw new Error(t('Сначала загрузи пример Backspace.', 'Load a Backspace sample first.'));
  const range = document.createRange();
  range.selectNodeContents(body);
  range.collapse(true);
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}, false);
const selectPasteSample = () => run((instance) => {
  const container = pasteTarget.value === 'root' ? instance.surface : instance.surface.querySelector(pasteTarget.value === 'quote' ? 'blockquote' : 'td[rowspan]');
  const first = container?.firstElementChild;
  const last = first?.nextElementSibling;
  const start = first?.firstChild;
  const end = last?.querySelector('em')?.firstChild;
  if (first?.localName !== 'p' || !last || !/^h[1-6]$|^p$/.test(last.localName) || start?.nodeType !== 3 || end?.nodeType !== 3 || (end.textContent?.length ?? 0) < 2)
    throw new Error(t('Загрузи пример «Вставка между блоками» заново.', 'Load the “Paste between blocks” sample again.'));
  document.getSelection()!.setBaseAndExtent(end, 2, start, start.textContent!.length);
}, false);
const insertPasteExample = (plain: boolean) => run((instance) => {
  if (!plain) { instance.insertHTML(pasteHTML.value); return; }
  const holder = document.createElement('div');
  holder.textContent = pastePlain.value.replace(/\r\n?/g, '\n');
  instance.insertHTML(holder.innerHTML.replace(/\n/g, '<br>'));
});
const selectListItems = (boundary = false) => run((instance) => {
  const list = instance.surface.querySelector(':scope > ul');
  const first = list?.firstElementChild;
  const second = first?.nextElementSibling;
  const firstBody = first?.firstElementChild?.matches('p,h1,h2,h3,h4,h5,h6') ? first.firstElementChild : first;
  const secondBody = second?.firstElementChild?.matches('p,h1,h2,h3,h4,h5,h6') ? second.firstElementChild : second;
  const start = firstBody?.firstChild;
  const end = secondBody?.querySelector(':scope > em')?.firstChild;
  if (first?.localName !== 'li' || second?.localName !== 'li' || start?.nodeType !== 3 || end?.nodeType !== 3)
    throw new Error(t('Загрузи пример «Выделение пунктов списка» заново.', 'Load the “List item selection” sample again.'));
  const selection = document.getSelection()!;
  if (boundary) {
    const range = document.createRange();
    range.selectNodeContents(firstBody!);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  else selection.setBaseAndExtent(end, 2, start, start.textContent!.length);
}, false);
const selectListItemBlocks = () => run((instance) => {
  const item = instance.surface.querySelector(':scope > ul > li');
  const start = item?.querySelector(':scope > p')?.firstChild;
  const end = item?.querySelector(':scope > h2')?.firstChild;
  if (start?.nodeType !== 3 || end?.nodeType !== 3 || (end.textContent?.length ?? 0) < 3)
    throw new Error(t('Загрузи пример «Несколько блоков» заново.', 'Load the “Multiple blocks” sample again.'));
  document.getSelection()!.setBaseAndExtent(end, 3, start, start.textContent!.length);
}, false);
const selectListBodyText = () => run((instance) => {
  const item = instance.surface.querySelector(':scope > ul > li');
  const body = item?.firstElementChild?.matches('p,h1,h2,h3,h4,h5,h6') ? item.firstElementChild : item;
  const start = body?.firstChild;
  const end = body?.querySelector(':scope > strong')?.firstChild;
  if (start?.nodeType !== 3 || end?.nodeType !== 3)
    throw new Error(t('Загрузи пример выделения пунктов заново.', 'Reload the list item selection sample.'));
  document.getSelection()!.setBaseAndExtent(end, end.textContent!.length, start, start.textContent!.length);
}, false);
const selectListBodyCaret = () => run((instance) => {
  const item = instance.surface.querySelector(':scope > ul > li');
  const body = item?.firstElementChild?.matches('p,h1,h2,h3,h4,h5,h6') ? item.firstElementChild : item;
  if (!body) throw new Error(t('Загрузи пример выделения пунктов заново.', 'Reload the list item selection sample.'));
  const range = document.createRange();
  if (listBlockCaret.value === 'middle') {
    const text = body.querySelector(':scope > strong')?.firstChild;
    if (text?.nodeType !== 3 || (text.textContent?.length ?? 0) < 1)
      throw new Error(t('Загрузи пример выделения пунктов заново.', 'Reload the list item selection sample.'));
    range.setStart(text, 1);
    range.collapse(true);
  }
  else {
    range.selectNodeContents(body);
    range.collapse(listBlockCaret.value === 'start');
  }
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}, false);
const insertListBlocks = () => run((instance) => instance.insertHTML(listBlockHTML.value));
const insertListHeading = () => run((instance) => instance.insertHTML(listHeadingHTML.value));
const insertListExample = (plain: boolean) => run((instance) => {
  if (!plain) { instance.insertHTML(listInlineHTML.value); return; }
  const holder = document.createElement('div');
  holder.textContent = listReplacement.value.replace(/\r\n?/g, '\n');
  instance.insertHTML(holder.innerHTML.replace(/\n/g, '<br>'));
});
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
  if (event.target instanceof Element && event.target.closest('.mw-form')) return;
  const control = event.target instanceof Element ? event.target.closest('button,input,select,textarea,summary') : null;
  if (props.full && control && !editor?.element.contains(control)) {
    const selection = window.getSelection(); const range = selection?.rangeCount ? selection.getRangeAt(0) : undefined;
    if (range && editor?.surface.contains(range.startContainer) && editor.surface.contains(range.endContainer)) labRange = range.cloneRange();
    event.stopPropagation();
  }
};
const demoUpload = (_file: File, { signal }: { signal: AbortSignal }): Promise<ImageValue> => new Promise((resolve, reject) => {
  const abort = () => { window.clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new DOMException('Cancelled', 'AbortError')); };
  const timer = window.setTimeout(() => { signal.removeEventListener('abort', abort); resolve({ src: '/logo.svg', alt: 'Morfira demo', width: 160, height: 160, caption: t('Демо результата callback загрузки', 'Demo upload callback result') }); }, 1200);
  if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
});
const localSuggestions = <T extends SuggestionOption>(items: readonly T[], { query, signal }: SuggestionQuery): Promise<readonly T[]> => new Promise((resolve, reject) => {
  const mode = providerMode.value; const delay = Number(providerDelay.value);
  const abort = () => { window.clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new DOMException('Cancelled', 'AbortError')); };
  const timer = window.setTimeout(() => {
    signal.removeEventListener('abort', abort);
    if (mode === 'error') { reject(new Error('Demo provider failure')); return; }
    const needle = query.toLocaleLowerCase(ru.value ? 'ru' : 'en');
    resolve(mode === 'empty' ? [] : items.filter((item) => `${item.id} ${item.label}`.toLocaleLowerCase(ru.value ? 'ru' : 'en').includes(needle)));
  }, Number.isFinite(delay) ? Math.max(0, Math.min(1500, delay)) : 250);
  if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
});
const people = (request: SuggestionQuery) => localSuggestions<MentionOption>([
  { id: 'anna', label: t('Анна Смирнова', 'Anna Smith'), description: t('Дизайнер', 'Designer') },
  { id: 'boris', label: t('Борис Иванов', 'Boris Ivanov'), description: t('Разработчик', 'Developer') },
  { id: 'alena', label: t('Алёна Орлова', 'Alena Orlova'), description: t('Редактор', 'Editor') },
], request);
const snippets = (request: SuggestionQuery) => localSuggestions<SlashOption>([
  ...[...Array.from({ length: 6 }, (_, i) => ({ id: `h${i + 1}`, label: t(`Заголовок ${i + 1}`, `Heading ${i + 1}`), action: `heading${i + 1}` })),
    { id: 'paragraph', label: t('Абзац', 'Paragraph'), action: 'paragraph' },
    { id: 'bullet', label: t('Маркированный список', 'Bullet list'), action: 'bulletList' },
    { id: 'ordered', label: t('Нумерованный список', 'Ordered list'), action: 'orderedList' },
    { id: 'quote', label: t('Цитата', 'Blockquote'), action: 'blockquote' },
    { id: 'code', label: t('Блок кода', 'Code block'), action: 'codeBlock' },
    { id: 'table', label: t('Таблица 3 × 3', 'Table 3 × 3'), action: 'table' },
  ].map((item) => ({ ...item, description: t('Структурная команда · один Undo', 'Structural command · one Undo') })),
  { id: 'signature', label: t('Подпись', 'Signature'), description: t('Обычный текст, без форматирования', 'Plain text without formatting'), text: t('С уважением, команда Morfira', 'Best regards, Morfira team') },
  { id: 'todo', label: t('Задача', 'Task'), description: 'TODO', text: 'TODO: ' },
  { id: 'review', label: t('На проверку', 'For review'), text: t('Готово к проверке', 'Ready for review') },
], request);
onMounted(async () => {
  const [
    { createEditor },
    { tableCommands },
    { statisticsCommands },
    { markdownCommands },
    { mentionCommands },
    { slashCommands, createSlashActions },
    { createLinkForm },
    { createImageForm },
    { createSearchForm },
    { createMinimalPreset },
    { createExtendedPreset },
    { createEditorUI },
    { createExtendedEditorUI },
  ] = await Promise.all([
    import('@morfira-dev/wysiwyg'),
    import('@morfira-dev/wysiwyg/plugins/tables'),
    import('@morfira-dev/wysiwyg/plugins/statistics'),
    import('@morfira-dev/wysiwyg/plugins/markdown'),
    import('@morfira-dev/wysiwyg/plugins/mentions'),
    import('@morfira-dev/wysiwyg/plugins/slash'),
    import('@morfira-dev/wysiwyg/ui/links'),
    import('@morfira-dev/wysiwyg/ui/images'),
    import('@morfira-dev/wysiwyg/ui/search'),
    import('@morfira-dev/wysiwyg/presets/minimal'),
    import('@morfira-dev/wysiwyg/presets/extended'),
    import('@morfira-dev/wysiwyg/ui/editor'),
    import('@morfira-dev/wysiwyg/ui/extended'),
  ]);
  if (cancelled) return;
  const common = {
    locale: editorLocale.value,
    label: t('Попробуйте Morfira', 'Try Morfira'),
    value: props.full ? showcase() : article(),
    onChange: (change: EditorChange) => { source.value = change.source; refresh(); },
  };
  const preset = props.full ? createExtendedPreset({
    ...common,
    mentions: { provide: people, debounceMs: 0 },
    slash: { provide: snippets, debounceMs: 0, actions: { ...createSlashActions(), table: (instance: Editor) => tableCommands(instance).insert(3, 3) } },
    images: { upload: demoUpload },
    statistics: { locale: ru.value ? 'ru' : 'en' },
    tables: { onClipboardError: (error: Error) => notify(error.message, true) },
  }) : createMinimalPreset(common);
  editor = createEditor(host.value!, preset);
  if (props.full) {
    mentionAPI = mentionCommands(editor); slashAPI = slashCommands(editor);
    mentionState.value = mentionAPI.getState(); slashState.value = slashAPI.getState();
    unmention = mentionAPI.subscribe((state) => { mentionState.value = state; }); unslash = slashAPI.subscribe((state) => { slashState.value = state; });
    commands = tableCommands(editor);
    markdownAPI = markdownCommands(editor); markdownEnabled.value = markdownAPI.getState().enabled;
    statisticsAPI = statisticsCommands(editor); updateStatistics(statisticsAPI.getState()); unstatistics = statisticsAPI.subscribe(updateStatistics);
    linkForm = createLinkForm(linkFormHost.value!, editor, {
      initialValues: { href: 'https://example.com', title: '', text: '', newTab: false },
    });
    imageForm = createImageForm(imageFormHost.value!, editor, {
      initialValues: { src: '/logo.svg', alt: 'Morfira', width: '64', height: '', caption: '' },
    });
    searchForm = createSearchForm(searchFormHost.value!, editor, {
      initialValues: { query: 'Morfira', replacement: 'Morfira Studio', caseSensitive: false, wholeWord: false },
    });
  }
  const ui = props.full ? createExtendedEditorUI(toolbar.value!, editor, {
    label: t('Форматирование', 'Formatting'),
    links: { initialValues: { href: 'https://example.com' } },
    images: { initialValues: { src: '/logo.svg', alt: 'Morfira', width: '64' } },
    search: { initialValues: { query: 'Morfira', replacement: 'Morfira Studio' } },
    mentions: { labels: { label: t('Люди', 'People'), loading: t('Ищем людей…', 'Finding people…'), empty: t('Люди не найдены', 'No people found'), error: t('Ошибка поиска людей', 'People lookup failed'), results: t('Людей: {count}', 'People: {count}') } },
    slash: { labels: { label: t('Шаблоны', 'Snippets'), loading: t('Ищем шаблоны…', 'Finding snippets…'), empty: t('Шаблоны не найдены', 'No snippets found'), error: t('Ошибка поиска шаблонов', 'Snippet lookup failed'), results: t('Шаблонов: {count}', 'Snippets: {count}') } },
  }) : createEditorUI(toolbar.value!, editor);
  disposeEditorUI = ui.destroy;
  unsubscribe = editor.subscribe(refresh); unselect = editor.onSelectionChange(refresh); ready.value = true; refresh();
});
onBeforeUnmount(() => {
  cancelled = true;
  linkForm?.destroy();
  imageForm?.destroy();
  searchForm?.destroy();
  unmention?.();
  unslash?.();
  unstatistics?.();
  unsubscribe?.();
  unselect?.();
  disposeEditorUI?.();
  editor?.destroy();
});
</script>

<template>
  <section class="demo-shell" :class="{ 'dark-demo': dark, 'demo-full': full }" :style="themeStyle" :aria-label="t('Стенд возможностей', 'Feature laboratory')" @pointerdown="preserveLabSelection">
    <header v-if="full" class="lab-heading">
      <div><span class="lab-eyebrow">MORFIRA LAB</span><h2>{{ t('Попробуй всё, что уже работает.', 'Try everything that works today.') }}</h2><p>{{ t('Один документ, все команды и прозрачный результат.', 'One document, every command, and a visible result.') }}</p></div>
      <span class="lab-badge">TypeScript · MIT · {{ t('без runtime-зависимостей', 'zero runtime dependencies') }}</span>
    </header>
    <div class="demo-controls">
      <template v-if="full">
        <label>{{ t('Документ', 'Document') }}<select v-model="sample" :aria-label="t('Пример документа', 'Document sample')"><option value="showcase">{{ t('Все форматы', 'All formats') }}</option><option value="paste">{{ t('Вставка между блоками', 'Paste between blocks') }}</option><option value="input">{{ t('Границы блоков', 'Block boundaries') }}</option><option value="article">{{ t('Статья', 'Article') }}</option><option value="list-selection">{{ t('Выделение пунктов списка', 'List item selection') }}</option><option value="lists">{{ t('Списки и вложенность', 'Lists and nesting') }}</option><option value="suggestions">{{ t('Упоминания и шаблоны', 'Mentions and snippets') }}</option><option value="markdown">Markdown shortcuts</option><option value="statistics">{{ t('Unicode и статистика', 'Unicode and statistics') }}</option><option value="search">{{ t('Поиск и замена', 'Find and replace') }}</option><option value="images">{{ t('Изображения', 'Images') }}</option><option value="styling">{{ t('Цвета и ссылки', 'Colors and links') }}</option><option value="tables">{{ t('Таблицы', 'Tables') }}</option><option value="empty">{{ t('Пустой', 'Empty') }}</option></select></label>
        <button :disabled="!ready || readOnly" @click="loadSample">{{ t('Загрузить пример', 'Load sample') }}</button>
      </template>
      <label>{{ t('Язык редактора', 'Editor language') }}<select v-model="editorLocale" :disabled="!ready" :aria-label="t('Язык интерфейса редактора', 'Editor interface language')" @change="updateEditorLocale"><option value="ru">Русский</option><option value="en">English</option></select></label>
      <button @click="dark = !dark">{{ t('Сменить тему', 'Toggle theme') }}</button>
      <button :disabled="!ready" @click="toggleReadOnly">{{ readOnly ? t('Редактировать', 'Edit') : t('Только чтение', 'Read only') }}</button>
      <button :disabled="!ready" @click="snapshot('html')">HTML</button><button v-if="full" :disabled="!ready" @click="snapshot('json')">JSON</button>
    </div>
    <p class="lab-hint">{{ t('Язык меняет готовую панель и формы без замены документа. Подписи примеров и провайдеров подсказок остаются на языке страницы.', 'Language changes the ready toolbar and forms without replacing the document. Sample and suggestion-provider labels remain in the page language.') }}</p>
    <p v-if="full && sample === 'input'" class="lab-hint">{{ t('Выдели от конца «Alpha » до середины «Beta» и введи X или нажми Backspace/Delete. Сохраняются начало первого блока и форматированный остаток второго. Такой же пример есть внутри цитаты и объединённой ячейки; выделения между разными контейнерами пока не нормализуются этим обработчиком.', 'Select from the end of “Alpha ” into “Beta”, then type X or press Backspace/Delete. The first block prefix and formatted second-block suffix remain. Try the same within the quote or merged cell; this handler does not normalize selections across different containers.') }}</p>
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
        <div class="demo-status"><span>{{ count }} {{ t('символов', 'characters') }}<template v-if="full"> · {{ words }} {{ t('слов', 'words') }}</template></span><span v-if="full">undo {{ undoAvailable ? '●' : '○' }} · redo {{ redoAvailable ? '●' : '○' }} · {{ source }}</span><span v-else>{{ t('Минимальный пресет · готовая панель', 'Minimal preset · ready toolbar') }}</span></div>
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
        <details class="lab-paste"><summary>{{ t('Вставка между блоками', 'Paste between blocks') }}</summary><fieldset :disabled="!ready || readOnly">
          <p class="lab-hint">{{ t('Загрузи одноимённый пример в меню «Документ», выбери область и выдели пример. Вставка заменяет выделение; Undo возвращает исходный текст и направление выделения. Также можно использовать обычный Ctrl/Cmd+V в редакторе.', 'Load this sample from the Document menu, choose an area and select the sample. Insertion replaces the selection; Undo restores its original text and direction. You can also use ordinary Ctrl/Cmd+V in the editor.') }}</p>
          <label>{{ t('Область вставки', 'Paste area') }}<select v-model="pasteTarget" :aria-label="t('Область вставки', 'Paste area')"><option value="root">{{ t('Основной текст', 'Main text') }}</option><option value="quote">{{ t('Цитата', 'Quote') }}</option><option value="cell">{{ t('Объединённая ячейка', 'Merged cell') }}</option></select></label>
          <button @click="selectPasteSample">{{ t('Выделить пример', 'Select sample') }}</button>
          <label>{{ t('Текст для вставки', 'Text to insert') }}<textarea v-model="pastePlain" :aria-label="t('Текст для вставки', 'Text to insert')" rows="3"></textarea></label>
          <button @click="insertPasteExample(true)">{{ t('Вставить текст', 'Insert text') }}</button>
          <label>{{ t('HTML для вставки', 'HTML to insert') }}<textarea v-model="pasteHTML" :aria-label="t('HTML для вставки', 'HTML to insert')" rows="4" spellcheck="false"></textarea></label>
          <button @click="insertPasteExample(false)">{{ t('Вставить HTML', 'Insert HTML') }}</button>
          <p class="lab-hint">{{ t('Текст вставляется буквально, переносы сохраняются. HTML проходит проверку схемы. Эти кнопки используют API редактора; доступ к системному буферу не запрашивается.', 'Text is inserted literally with line breaks preserved. HTML passes schema validation. These buttons use the editor API and do not request system clipboard access.') }}</p>
        </fieldset></details>
        <details class="lab-list-selection"><summary>{{ t('Выделение пунктов списка', 'List item selection') }}</summary><fieldset :disabled="!ready || readOnly">
          <p class="lab-hint">{{ t('Новый сценарий: код добавлен, проверки отложены. Загрузи одноимённый пример в меню «Документ», выдели пункты и попробуй ввод, Backspace/Delete или вставку ниже. Вложенная ветка последнего пункта должна сохраниться.', 'New scenario: implemented with validation deferred. Load this sample from the Document menu, select its items, then try typing, Backspace/Delete or the insertion controls below. The last item’s nested branch must remain.') }}</p>
          <label>{{ t('Содержимое пункта', 'Item body') }}<select v-model="listBodyMode" :aria-label="t('Содержимое пункта', 'Item body')"><option value="inline">{{ t('Строчный текст', 'Inline text') }}</option><option value="paragraph">{{ t('Абзацы', 'Paragraphs') }}</option><option value="heading">{{ t('Заголовки', 'Headings') }}</option><option value="mixed">{{ t('Абзац и заголовок', 'Paragraph and heading') }}</option><option value="multiblock">{{ t('Несколько блоков', 'Multiple blocks') }}</option></select></label>
          <button @click="loadListBodySample">{{ t('Загрузить пример с блоками', 'Load block-body sample') }}</button>
          <p class="lab-hint">{{ t('Кнопка заменяет документ выбранным примером. При замене сохраняются начальный блок и его выравнивание, невыделенные блоки после конечного тела и вложенные списки вне блоков. Enter делит пункт и переносит последующие блоки; Shift+Enter добавляет перенос внутри одного блока. Эти сценарии ещё не проверены.', 'The button replaces the document with the selected sample. Replacement retains the starting block and its alignment, unselected blocks after the ending body and nested lists outside bodies. Enter splits the item and moves subsequent blocks; Shift+Enter adds a line break inside one block. These scenarios are not validated yet.') }}</p>
          <button @click="selectListItems(false)">{{ t('Выделить пункты', 'Select items') }}</button>
          <button v-if="listBodyMode === 'multiblock'" @click="selectListItemBlocks">{{ t('Выделить блоки пункта', 'Select item blocks') }}</button>
          <label>{{ t('Текст замены', 'Replacement text') }}<input v-model="listReplacement" :aria-label="t('Текст замены', 'Replacement text')"></label>
          <button @click="insertListExample(true)">{{ t('Заменить текстом', 'Replace with text') }}</button>
          <label>{{ t('Строчный HTML', 'Inline HTML') }}<textarea v-model="listInlineHTML" :aria-label="t('Строчный HTML', 'Inline HTML')" rows="3" spellcheck="false"></textarea></label>
          <button @click="insertListExample(false)">{{ t('Заменить HTML', 'Replace with HTML') }}</button>
          <button @click="selectListBodyText">{{ t('Выделить текст одного блока', 'Select text in one body') }}</button>
          <label>{{ t('Позиция вставки блоков', 'Block insertion position') }}<select v-model="listBlockCaret" :aria-label="t('Позиция вставки блоков', 'Block insertion position')"><option value="start">{{ t('Начало блока', 'Body start') }}</option><option value="middle">{{ t('Внутри слова', 'Inside a word') }}</option><option value="end">{{ t('Конец блока', 'Body end') }}</option></select></label>
          <button @click="selectListBodyCaret">{{ t('Курсор для вставки блоков', 'Caret for block insertion') }}</button>
          <label>{{ t('HTML из нескольких блоков', 'Multi-block HTML') }}<textarea v-model="listBlockHTML" :aria-label="t('HTML из нескольких блоков', 'Multi-block HTML')" rows="4" spellcheck="false"></textarea></label>
          <button @click="insertListBlocks">{{ t('Заменить несколькими блоками', 'Replace with multiple blocks') }}</button>
          <label>{{ t('HTML одиночного заголовка', 'Single heading HTML') }}<textarea v-model="listHeadingHTML" :aria-label="t('HTML одиночного заголовка', 'Single heading HTML')" rows="2" spellcheck="false"></textarea></label>
          <button @click="insertListHeading">{{ t('Вставить заголовок', 'Insert heading') }}</button>
          <p class="lab-hint">{{ t('Одиночный обычный заголовок сохраняет свой тег и атрибуты отдельным телом пункта. Выдели текст или поставь курсор: перед заголовком останется исходное начало, после него — отдельное тело с остатком. Курсор будет в начале остатка; пустые края сохраняют редактируемый перенос. Соседние тела и ветки остаются на месте. Проверки отложены.', 'A single ordinary heading keeps its tag and attributes as a separate item body. Select text or place the caret: the source prefix stays before the heading and a separate body holds the suffix after it. The caret starts before that suffix; empty edges retain an editable placeholder. Neighboring bodies and branches remain. Validation is deferred.') }}</p>
          <p class="lab-hint">{{ t('Выдели текст или выбери позицию и поставь курсор кнопкой. «Заменить несколькими блоками» вставляет два и более обычных абзаца/заголовка и при пустом выделении: начало исходного блока соединяется с первым входящим, остаток — с последним. Невыделенные тела и ветки сохраняются. Другие одиночные структурные корни сохраняют прежние пути; семантические и смешанные фрагменты не входят в новый путь. Проверки пока отложены.', 'Select text or choose a position and place the caret with the button. “Replace with multiple blocks” also inserts two or more ordinary paragraphs/headings at a collapsed caret: the source prefix joins the first incoming body and its suffix joins the last. Unselected bodies and branches remain. Other single structural roots retain their previous paths; semantic and mixed fragments are outside the new path. Validation is deferred.') }}</p>
          <button @click="selectListItems(true)">{{ t('Курсор перед Delete', 'Caret before Delete') }}</button>
          <p class="lab-hint">{{ t('«Курсор перед Delete» ставит курсор в конец первого тела: в режиме «Несколько блоков» Delete соединяет два блока внутри пункта. Backspace в начале следующего блока тоже соединяет их. Выделения между списком и абзацем или разными контейнерами, семантические тела и произвольная структурная вставка — отдельные этапы.', '“Caret before Delete” places the caret at the first body’s end: in Multiple blocks mode, Delete joins two bodies inside the item. Backspace at the next body’s start also joins them. Selections between a list and a paragraph or different containers, semantic bodies and arbitrary structural insertion are separate milestones.') }}</p>
          <label>{{ t('Сценарий Backspace', 'Backspace scenario') }}<select v-model="listBackspaceScenario" :aria-label="t('Сценарий Backspace', 'Backspace scenario')"><option value="join">{{ t('Соединить с предыдущим пунктом', 'Join the previous item') }}</option><option value="root">{{ t('Первый корневой пункт', 'First root item') }}</option><option value="nested">{{ t('Первый вложенный пункт', 'First nested item') }}</option><option value="nested-followed">{{ t('Вложенная ветка перед другими', 'Nested branch before others') }}</option></select></label>
          <button @click="loadListBackspaceSample">{{ t('Загрузить пример Backspace', 'Load Backspace sample') }}</button>
          <button @click="selectListBackspace">{{ t('Курсор перед Backspace', 'Caret before Backspace') }}</button>
          <p class="lab-hint">{{ t('Загрузка заменяет документ. Затем поставь курсор кнопкой и нажми настоящий Backspace: первый блок соединится с последним блоком предыдущего пункта, первый корневой пункт выйдет из списка, а первый вложенный поднимется на уровень. Последующие тела и ветки сохраняются; Undo возвращает исходный документ. Сценарии написаны, но ещё не проверены.', 'Loading replaces the document. Then use the caret button and press actual Backspace: the first body joins the previous item’s final body, the first root item exits the list, or the first nested item lifts one level. Later bodies and branches remain; Undo restores the original document. These scenarios are written but not validated yet.') }}</p>
          <p v-if="listBackspaceScenario === 'nested-followed'" class="lab-hint">{{ t('В этом примере ранняя ветка остаётся у родителя. Под поднятым пунктом идут его собственная ветка, оставшиеся пункты исходного списка, затем две поздние ветки родителя в прежнем порядке. Типы списков и выравнивание сохраняются; ветки не склеиваются.', 'In this sample the earlier branch stays with the owner. The lifted item retains its own branch, then the source list’s remaining items, then the owner’s two later branches in their original order. List kinds and alignment remain; branches are not coalesced.') }}</p>
        </fieldset></details>
        <details class="lab-suggestions"><summary>{{ t('Упоминания и slash-шаблоны', 'Mentions and slash snippets') }}</summary><fieldset :disabled="!ready">
          <div class="lab-button-grid"><button :disabled="readOnly" @click="startSuggestions('mentions')">{{ t('Новый пример @an', 'New @an example') }}</button><button :disabled="readOnly" @click="startSuggestions('slash')">{{ t('Новый пример /sig', 'New /sig example') }}</button></div>
          <div class="lab-button-grid"><button :disabled="readOnly" @click="startStructuralSlash('h2')">{{ t('Новый пример /h2', 'New /h2 example') }}</button><button :disabled="readOnly" @click="startStructuralSlash('table')">{{ t('Новый пример /table', 'New /table example') }}</button></div>
          <p class="lab-hint">{{ t('Кнопки начала заменяют документ. Также можно вводить @ в тексте и / в начале обычного абзаца.', 'Starting an example replaces the document. You can also type @ in text or / at the beginning of a plain paragraph.') }}</p>
          <label>{{ t('Ответ провайдера', 'Provider response') }}<select v-model="providerMode" :aria-label="t('Ответ провайдера', 'Provider response')"><option value="normal">{{ t('Варианты', 'Choices') }}</option><option value="empty">{{ t('Пустой ответ', 'Empty response') }}</option><option value="error">{{ t('Ошибка', 'Error') }}</option></select></label>
          <label>{{ t('Задержка, мс', 'Delay, ms') }}<input v-model.number="providerDelay" type="number" min="0" max="1500"></label>
          <div class="lab-button-grid"><button :disabled="readOnly" @click="openSuggestions">{{ t('Открыть подсказки', 'Open suggestions') }}</button><button @click="closeSuggestions">{{ t('Закрыть подсказки', 'Close suggestions') }}</button></div>
          <p class="lab-suggestions-status" role="status" aria-live="polite">{{ suggestionStatus }}</p>
          <p class="lab-hint">{{ t('ArrowUp/Down — выбор, Enter — вставка, Escape — закрыть. Tab передаётся редактору. Упоминание — обычный редактируемый @текст без сохранённого ID; slash вставляет текст или выполняет структурную команду одним Undo. Введи / для всех вариантов: заголовки, списки, цитата, код и таблица. Данные локальные, сеть не используется. Постоянные упоминания — следующий этап.', 'ArrowUp/Down navigate, Enter inserts, Escape dismisses. Tab falls through to the editor. A mention is editable @text without a stored ID; slash inserts text or runs a structural command with one Undo. Type / for all choices: headings, lists, quote, code and table. Data stays local, with no network. Persistent mentions remain a later phase.') }}</p>
        </fieldset></details>
        <details class="lab-markdown"><summary>Markdown shortcuts</summary><fieldset :disabled="!ready">
          <label class="lab-checkbox"><input v-model="markdownEnabled" type="checkbox" @change="toggleMarkdown">{{ t('Markdown при вводе', 'Markdown while typing') }}</label>
          <button :disabled="readOnly" @click="startMarkdown">{{ t('Начать с пустого абзаца', 'Start with an empty paragraph') }}</button>
          <p class="lab-hint">{{ t('Кнопка заменяет документ пустым абзацем. Далее вводи маркеры в редакторе.', 'The button replaces the document with an empty paragraph. Then type markers in the editor.') }}</p>
          <ul class="lab-shortcuts"><li><code># … ###### + Space</code> — {{ t('заголовки', 'headings') }}</li><li><code>- / * / + / 1. / 1) + Space</code> — {{ t('списки', 'lists') }}</li><li><code>&gt; + Space</code> — {{ t('цитата', 'quote') }}</li><li><code>``` + Space / Enter</code> — {{ t('блок кода', 'code block') }}</li><li><code>--- / *** / ___ + Space / Enter</code> — {{ t('разделитель', 'horizontal rule') }}</li><li><code>**bold** / __bold__ / *italic* / _italic_ / ~~strike~~ / `code`</code></li></ul>
          <p class="lab-hint">{{ t('Строчные стили срабатывают на последнем символе закрывающего маркера. Undo возвращает документ до триггера. Это не Markdown-парсер: вставка и загрузка примеров не преобразуются; язык code fence и вложенный Markdown пока не поддерживаются.', 'Inline styles trigger on the final closing marker. Undo restores the document before that trigger. This is not a Markdown parser: paste/sample loading is not converted; language fences and nested Markdown are not supported yet.') }}</p>
        </fieldset></details>
        <details class="lab-search"><summary>{{ t('Поиск и замена', 'Find and replace') }}</summary>
          <div ref="searchFormHost"></div>
          <p class="lab-hint">{{ t('Буквальный поиск, без регулярных выражений. Совпадения пересекают стили, но не блоки, ячейки, переносы и изображения. Выделяется активное совпадение; поиск доступен в read-only.', 'Literal search without regular expressions. Matches cross inline styles, but not blocks, cells, line breaks or images. The active match is selected; search works in read-only.') }}</p>
        </details>
        <details class="lab-statistics"><summary>{{ t('Статистика', 'Statistics') }}</summary>
          <table class="lab-statistics-table"><caption>{{ t('Счётчики текста', 'Text counts') }}</caption><thead><tr><th>{{ t('Метрика', 'Metric') }}</th><th>{{ t('Документ', 'Document') }}</th><th>{{ t('Выделение', 'Selection') }}</th></tr></thead><tbody>
            <tr><th>{{ t('Символы (графемы)', 'Characters (graphemes)') }}</th><td data-stat="document-characters">{{ statisticsState.document.characters }}</td><td data-stat="selection-characters">{{ statisticsState.selection.characters }}</td></tr>
            <tr><th>{{ t('Без пробельных', 'Without whitespace') }}</th><td data-stat="document-compact">{{ statisticsState.document.charactersWithoutWhitespace }}</td><td data-stat="selection-compact">{{ statisticsState.selection.charactersWithoutWhitespace }}</td></tr>
            <tr><th>{{ t('Слова', 'Words') }}</th><td data-stat="document-words">{{ statisticsState.document.words }}</td><td data-stat="selection-words">{{ statisticsState.selection.words }}</td></tr>
          </tbody></table><p class="lab-hint">{{ t('Считаются графемы Unicode: эмодзи и комбинируемые знаки не распадаются на UTF-16 единицы. Подписи входят в подсчёт, alt и URL — нет. Выделение вне редактора даёт нули. Счётчики не меняют документ и историю.', 'Unicode graphemes keep emoji and combining sequences together. Captions count; alt and URLs do not. Selection outside the editor reports zero. Counters never change the document or history.') }}</p>
        </details>
        <details><summary>{{ t('Ссылки и изображения', 'Links and images') }}</summary>
          <div ref="linkFormHost"></div>
          <hr>
          <div ref="imageFormHost"></div>
          <p class="lab-hint">{{ t('Локальный callback возвращает логотип вместо файла. Файл не отправляется и не сохраняется. Для своего сервера передайте upload callback. Пустые размеры снимают ограничения; подпись редактируется и в документе. Resize мышью пока нет.', 'The local callback returns the logo instead of the file. Files are not uploaded or stored. Supply an upload callback for your server. Empty dimensions remove limits; captions are also editable in the document. Drag resizing is not implemented.') }}</p>
        </details>
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
