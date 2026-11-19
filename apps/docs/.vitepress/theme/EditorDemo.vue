<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { useData } from 'vitepress';
import { officePasteSamples } from './office-paste/index.js';
import type { OfficeSample } from './office-paste/index.js';
import type { Editor, EditorChange } from '@morfira-dev/wysiwyg';
import type { MentionOption, SlashOption, SuggestionController, SuggestionState, SuggestionOption, SuggestionQuery } from '@morfira-dev/wysiwyg/plugins/suggestions';
import type { MentionReference } from '@morfira-dev/wysiwyg/plugins/mentions';
import type { MarkdownCommands } from '@morfira-dev/wysiwyg/plugins/markdown';
import type { TextDirection, TextDirectionCommands, TextDirectionState } from '@morfira-dev/wysiwyg/plugins/text-direction';
import type { ListMarker, ListPropertyCommands, ListPropertyState } from '@morfira-dev/wysiwyg/plugins/list-properties';
import type { FontCommands, FontState } from '@morfira-dev/wysiwyg/plugins/fonts';
import type { ChecklistCommands, ChecklistState } from '@morfira-dev/wysiwyg/plugins/checklists';
import type { StatisticsCommands, StatisticsState } from '@morfira-dev/wysiwyg/plugins/statistics';
import type { ImageUploadContext, ImageValue } from '@morfira-dev/wysiwyg/plugins/images';
import type { ContextualTableUIController } from '@morfira-dev/wysiwyg/ui/contextual-table';
import type { ContextualImageUIController } from '@morfira-dev/wysiwyg/ui/contextual-image';
import type { ImageResizeUIController } from '@morfira-dev/wysiwyg/ui/image-resize';
import type { ContextualLinkUIController } from '@morfira-dev/wysiwyg/ui/contextual-link';
import type { ContextualToolbarController } from '@morfira-dev/wysiwyg/ui/contextual';
import type { LinkFormController } from '@morfira-dev/wysiwyg/ui/links';
import type { ImageFormController } from '@morfira-dev/wysiwyg/ui/images';
import type { TablePropertiesFormController } from '@morfira-dev/wysiwyg/ui/table-properties';
import type { SearchFormController } from '@morfira-dev/wysiwyg/ui/search';
import type { SearchCommands } from '@morfira-dev/wysiwyg/plugins/search';
import type { SearchHighlightsController, SearchHighlightsState } from '@morfira-dev/wysiwyg/ui/search-highlights';
import type { TableCommands, TableClipboardData } from '@morfira-dev/wysiwyg/plugins/tables';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/ui/forms.css';
import '@morfira-dev/wysiwyg/ui/search-highlights.css';
import '@morfira-dev/wysiwyg/ui/editor.css';
import '@morfira-dev/wysiwyg/ui/contextual.css';
import '@morfira-dev/wysiwyg/ui/contextual-link.css';
import '@morfira-dev/wysiwyg/ui/contextual-image.css';
import '@morfira-dev/wysiwyg/ui/image-resize.css';
import '@morfira-dev/wysiwyg/ui/contextual-table.css';
import '@morfira-dev/wysiwyg/ui/table-picker.css';
import '@morfira-dev/wysiwyg/plugins/suggestions.css';
import '@morfira-dev/wysiwyg/plugins/tables.css';
import '@morfira-dev/wysiwyg/plugins/checklists.css';

const props = defineProps<{ full?: boolean }>();
const { lang } = useData();
const ru = computed(() => lang.value === 'ru');
const t = (russian: string, english: string) => ru.value ? russian : english;
const editorLocale = ref(ru.value ? 'ru' : 'en');
const toolbarOverflow = ref<'wrap' | 'more'>('wrap');
const contextualTableEnabled = ref(true);
const contextualTableHost = ref<HTMLElement>();
let contextualTableUI: ContextualTableUIController | undefined;
let mountContextualTableUI: (() => void) | undefined;
const contextualImageEnabled = ref(true);
const contextualImageHost = ref<HTMLElement>();
let contextualImageUI: ContextualImageUIController | undefined;
let mountContextualImageUI: (() => void) | undefined;
let selectContextualImage: (() => void) | undefined;
const imageResizeEnabled = ref(true);
const imageResizeHost = ref<HTMLElement>();
let imageResizeUI: ImageResizeUIController | undefined;
let mountImageResizeUI: (() => void) | undefined;
const contextualLinkEnabled = ref(true);
const contextualLinkHost = ref<HTMLElement>();
let contextualLinkUI: ContextualLinkUIController | undefined;
let mountContextualLinkUI: (() => void) | undefined;
const contextualEnabled = ref(true);
const contextualHost = ref<HTMLElement>();
let contextualUI: ContextualToolbarController | undefined;
let mountContextualUI: (() => void) | undefined;
let mountEditorUI: (() => void) | undefined;
const host = ref<HTMLElement>(); const toolbar = ref<HTMLElement>();
const linkFormHost = ref<HTMLElement>();
const imageFormHost = ref<HTMLElement>();
const tablePropertiesFormHost = ref<HTMLElement>();
const searchFormHost = ref<HTMLElement>();
let linkForm: LinkFormController | undefined;
let imageForm: ImageFormController | undefined;
let tablePropertiesForm: TablePropertiesFormController | undefined;
let searchForm: SearchFormController | undefined;
let searchAPI: SearchCommands | undefined;
const searchHighlightsEnabled = ref(true);
const searchHighlightsSnapshot = ref<SearchHighlightsState>();
let searchHighlights: SearchHighlightsController | undefined;
let mountSearchHighlights: (() => void) | undefined;
const searchHighlightsSummary = computed(() => {
  const state = searchHighlightsSnapshot.value;
  if (!state) return t('Подсветка выключена.', 'Highlights are disabled.');
  if (state.status === 'unsupported') return t('CSS Highlight API недоступен; поиск и переходы работают.', 'CSS Highlight API is unavailable; search and navigation still work.');
  if (state.status === 'conflict') return t('Имена подсветки заняты; чужие записи не изменены.', 'Highlight names are occupied; foreign entries are unchanged.');
  return t(`Снимок: диапазонов ${state.count}, текущий ${state.current < 0 ? '—' : state.current + 1}.`, `Snapshot: ${state.count} ranges, current ${state.current < 0 ? '—' : state.current + 1}.`);
});
const dark = ref(false); const readOnly = ref(false); const ready = ref(false);
const output = ref(''); const outputFormat = ref<'html' | 'json'>('html');
const message = ref(''); const failed = ref(false); const count = ref(0); const words = ref(0);
const undoAvailable = ref(false); const redoAvailable = ref(false); const source = ref('initial');
const providerMode = ref<'normal' | 'empty' | 'error'>('normal'); const providerDelay = ref(250);
const mentionState = ref<SuggestionState<MentionOption>>({ status: 'closed', query: '', items: [], activeIndex: -1 });
const slashState = ref<SuggestionState<SlashOption>>({ status: 'closed', query: '', items: [], activeIndex: -1 });
const mentionReferences = ref('');
let readMentionReferences: ((instance: Editor) => MentionReference[]) | undefined;
let mentionAPI: SuggestionController<MentionOption> | undefined; let slashAPI: SuggestionController<SlashOption> | undefined;
let unmention: (() => void) | undefined; let unslash: (() => void) | undefined;
const suggestionStatus = computed(() => { const state = mentionState.value.status !== 'closed' ? mentionState.value : slashState.value; return state.status === 'closed' ? t('Подсказки закрыты', 'Suggestions closed') : state.status === 'loading' ? t('Загрузка вариантов…', 'Loading choices…') : state.status === 'error' ? t('Ошибка: попробуйте открыть подсказки снова.', 'Error: try opening suggestions again.') : t(`Найдено вариантов: ${state.items.length}`, `Choices found: ${state.items.length}`); });
const checklistState = ref<ChecklistState>({ disabled: true, active: false, checked: undefined });
let checklistAPI: ChecklistCommands | undefined;
const checklistStatus = computed(() => checklistState.value.active
  ? (checklistState.value.checked ? t('Выбранная задача выполнена.', 'The selected task is complete.') : t('Выбранная задача не выполнена.', 'The selected task is incomplete.'))
  : t('Выбери текст одного пункта или обычного абзаца.', 'Select text in one item or an ordinary paragraph.'));
const directionState = ref<TextDirectionState>({ disabled: true, direction: false, mixed: false });
let directionAPI: TextDirectionCommands | undefined;
const listPropertyState = ref<ListPropertyState>({ disabled: true, kind: false, start: false, reversed: false, marker: false });
let listPropertyAPI: ListPropertyCommands | undefined;
const listStartChoice = ref(7);
const listReversedChoice = ref(true);
const listMarkerChoice = ref<ListMarker>('upper-roman');
const orderedMarkers = ['decimal', 'lower-alpha', 'upper-alpha', 'lower-roman', 'upper-roman'];
const bulletMarkers = ['disc', 'circle', 'square'];
const fontFamilies = [
  { id: 'system', family: 'system-ui, sans-serif', ru: 'Системный', en: 'System' },
  { id: 'serif', family: 'Georgia, serif', ru: 'С засечками', en: 'Serif' },
  { id: 'monospace', family: 'monospace', ru: 'Моноширинный', en: 'Monospace' },
];
const fontSizes = [12, 14, 16, 18, 24, 32, 48];
const fontFamilyChoice = ref('serif');
const fontSizeChoice = ref(24);
const fontState = ref<FontState>({ disabled: true, family: false, size: false, familyMixed: false, sizeMixed: false });
let fontAPI: FontCommands | undefined;
const markdownSource = ref('# Markdown codec\n\nA **bold** word and [a link](https://example.com).\n\n- First item\n  - Nested item\n\n> A quote\n\n```ts\nconst value = 1;\n```\n\n| Item | Count |\n| --- | --- |\n| Apples | 2 |');
const markdownCodecBusy = ref(false);
let markdownCodecRequest = 0;
let markdownCodecRevision = 0;
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
const listQuoteHTML = ref('<blockquote title="Inserted quote" style="text-align: right"><p><em>Quote</em></p><h3>Source</h3></blockquote>');
const listBlockCaret = ref<'start' | 'middle' | 'end'>('middle');
const listBodyMode = ref<'inline' | 'paragraph' | 'heading' | 'mixed' | 'multiblock'>('inline');
const listBackspaceScenario = ref<'join' | 'root' | 'nested' | 'nested-followed'>('join');
const rows = ref(3); const columns = ref(3); const fromRow = ref(1); const fromColumn = ref(1); const toRow = ref(1); const toColumn = ref(2);
const widthColumn = ref(1); const widthValue = ref(180);
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
const tableSample = () => `<h2>${t('Таблицы без лишнего', 'Tables, without the weight')}</h2><p>${t('Выделяйте ячейки, меняйте структуру и вставляйте диапазоны.', 'Select cells, change the structure, and paste ranges.')}</p><table title="Table headers sample" style="width:100%"><caption>${t('Возможности таблиц Morfira', 'Morfira table capabilities')}</caption><thead><tr><th scope="col">${t('Раздел', 'Area')}</th><th scope="col">${t('Возможность', 'Feature')}</th><th scope="col">${t('Статус', 'Status')}</th></tr></thead><tbody><tr><td rowspan="2"><p><strong>${t('Таблицы', 'Tables')}</strong></p></td><td><p>${t('Объединение ячеек', 'Merged cells')}</p></td><td><p>✓</p></td></tr><tr><td><p>HTML / TSV</p></td><td><p>✓</p></td></tr></tbody></table><p><br></p>`;
const contextualTableSample = () => `<p>${t('До таблицы', 'Before the table')}</p><table title="Contextual table sample"><tbody><tr><td rowspan="2"><p><strong>Alpha</strong></p></td><td><p><em>Beta</em></p></td><td><p>Outside A</p></td></tr><tr><td><p><u>Gamma</u></p></td><td><p>Outside B</p></td></tr><tr><td><p>Delta</p></td><td><p>Epsilon</p></td><td><p>Outside C</p></td></tr></tbody></table><p>${t('После таблицы', 'After the table')}</p>`;
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
const imageSample = () => `<h2>${t('Изображения с подписью', 'Images with captions')}</h2><p>${t('Нажми на изображение: в разделе «Ссылки и изображения» доступны размер, alt, подпись и выравнивание слева, по центру или справа.', 'Click the image: Links and images provides dimensions, alt text, caption and left, center or right alignment.')}</p><figure><img src="/logo.svg" alt="Morfira" width="160" height="160"><figcaption>${t('Логотип Morfira — редактируемая подпись', 'Morfira logo — an editable caption')}</figcaption></figure><p>${t('Здесь можно продолжить текст.', 'Continue writing here.')}</p>`;
const contextualImageSample = () => `<p>${t('До изображения', 'Before the image')}</p><figure title="Contextual image sample"><img src="/logo.svg" alt="${t('Знак Morfira', 'Morfira mark')}" width="120" height="80"><figcaption><em>${t('Исходная подпись', 'Original caption')}</em></figcaption></figure><p>${t('После изображения', 'After the image')}</p>`;
const contextualLinkSample = () => `<p title="Contextual link sample">Before <a href="https://example.com/article" title="Original"><strong>Mor</strong><em>fira</em></a> after</p><p>${t('Поставь курсор или выдели часть текста внутри ссылки: доступны открытие, редактирование и удаление всей ссылки без потери оформления.', 'Place the caret or select text inside the link to open, edit or unlink the whole link without losing rich content.')}</p>`;
const contextualSample = () => `<p title="Contextual sample">Alpha <strong>bold</strong> <em>italic</em> <a href="https://example.com">link</a> tail</p><p>${t('Выдели часть текста: панель появляется над выделением без перехвата фокуса.', 'Select some text: the toolbar appears above the selection without taking focus.')}</p>`;
const textDirectionSample = () => '<p title="Direction first" style="text-align: center">مرحبا <strong>Latin</strong> <a href="https://example.com">رابط</a></p><p title="Direction second">שלום <em>world</em></p><ul><li title="Direction item">العربية · עברית · Latin</li></ul>';
const listPropertySample = () => '<ol title="List properties sample" start="3" reversed="false"><li title="List property first">Alpha <strong>one</strong><ul title="List properties nested"><li>Nested branch</li></ul></li><li title="List property second"><em>Beta</em> tail</li></ol><p title="List properties after">Keep paragraph</p>';
const fontSample = () => `<p title="Font sample">Alpha <strong>one</strong> <a href="https://example.com">linked</a> tail</p><h2 title="Font imported" style="font-family: Arial, sans-serif; font-size: 1.25em">${t('Импортированный шрифт и размер', 'Imported family and size')}</h2>`;
const horizontalRuleSample = () => `<p title="Horizontal rule sample">Alpha <strong>one</strong> tail</p><h2>${t('Заголовок тоже можно разделить', 'A heading can split too')}</h2><p>${t('Соседние блоки сохраняются.', 'Neighboring blocks remain.')}</p>`;
const checklistSample = () => `<h2>${t('Задачи без лишнего', 'Tasks without the weight')}</h2><ul title="Checklist sample"><li title="Checklist first" data-checklist-checked="false">${t('Написать', 'Write')} <strong>${t('идею', 'an idea')}</strong></li><li title="Checklist done" data-checklist-checked="true">${t('Сохранить результат', 'Save the result')}</li><li title="Checklist ordinary">${t('Обычный пункт того же списка', 'An ordinary item in the same list')}</li></ul><p title="Checklist outside">${t('Этот абзац можно превратить в задачу.', 'This paragraph can become a task.')}</p>`;
const statisticsSample = () => `<h2>${t('Unicode и статистика', 'Unicode and statistics')}</h2><p>e<strong>́</strong> · 👨‍👩‍👧‍👦 · 🇷🇺 · ${t('Привет, мир!', 'Hello, world!')}</p><p>${t('Выдели букву с комбинируемым знаком или эмодзи и открой панель статистики: считаются видимые графемы, а не UTF-16 единицы.', 'Select a combining sequence or emoji and open Statistics: the counter measures visible graphemes rather than UTF-16 units.')}</p>`;
const suggestionSample = () => `<h2>${t('Упоминания и slash-шаблоны', 'Mentions and slash snippets')}</h2><p>${t('Вводи @an для людей или /sig в начале абзаца для текстового шаблона. ArrowUp/Down выбирают, Enter вставляет, Escape закрывает.', 'Type @an for people or /sig at the beginning of a paragraph for a text snippet. ArrowUp/Down navigate, Enter inserts, Escape dismisses.')}</p><p>@an</p><p>/sig</p><p>/h2 · /bullet · /ordered · /quote · /code · /table</p><p>${t('Загруженные примеры буквальны. Кликни в конец токена и открой подсказки кнопкой справа, либо начни новый пример.', 'Loaded examples stay literal. Place the caret at a token end and use Open suggestions on the right, or start a new example.')}</p><p><br></p>`;
const markdownSample = () => `<h2>Markdown shortcuts</h2><p>${t('Эти примеры загружены как обычный текст. Для преобразования введи маркеры сам и нажми Space; для code fence или разделителя доступен также Enter.', 'These examples are loaded as literal text. Type markers yourself and press Space to transform; code fences and horizontal rules also accept Enter.')}</p><p># ${t('Заголовок', 'Heading')}</p><p>- ${t('Пункт', 'Item')}</p><p>&gt; ${t('Цитата', 'Quote')}</p><p>**${t('полужирный', 'bold')}** · _${t('курсив', 'italic')}_ · ~~${t('зачёркнутый', 'strike')}~~ · \`${t('код', 'code')}\`</p><p>${t('Последняя пустая строка — для твоего ввода. Undo возвращает текст до клавиши-триггера.', 'Use the final empty line for typing. Undo restores text before the trigger key.')}</p><p><br></p>`;
const searchSample = () => `<h2>${t('Поиск и замена', 'Find and replace')}</h2><p><strong>Mor</strong>fira ${t('помогает писать', 'helps you write')}. <em>Morfira</em> ${t('сохраняет стили', 'preserves styles')}.</p><p><a href="https://example.com">MORFIRA</a> · morfira</p><ul><li>Morfira ${t('в списке', 'in a list')}</li></ul><table><tbody><tr><td rowspan="2"><p>Morfira</p></td><td>A</td></tr><tr><td>B</td></tr></tbody></table><figure><img src="/logo.svg" alt="Morfira" width="64"><figcaption>Morfira</figcaption></figure><p>MorfiraPlus — ${t('совпадение только без целого слова', 'a match only with whole word disabled')}.</p>`;
const showcase = () => article() + `<h3>${t('Форматирование', 'Formatting')}</h3><p><strong>${t('Полужирный', 'Bold')}</strong> · <em>${t('Курсив', 'Italic')}</em> · <u>${t('Подчёркнутый', 'Underline')}</u> · <s>${t('Зачёркнутый', 'Strike')}</s> · <code>inline code</code> · H<sub>2</sub>O · x<sup>2</sup></p><blockquote>${t('Редактор должен помогать писать, а не отвлекать.', 'An editor should help you write and stay out of your way.')}</blockquote><ul><li>TypeScript</li><li>MIT</li></ul><ol><li>${t('Выделить', 'Select')}</li><li>${t('Отформатировать', 'Format')}</li></ol><pre>const editor = createEditor(host);</pre><p><a href="https://example.com">${t('Пример ссылки', 'Example link')}</a> · <img src="/logo.svg" alt="Morfira" width="48"></p>` + listSample() + stylingSample() + imageSample() + statisticsSample() + checklistSample() + contextualTableSample() + contextualImageSample() + contextualLinkSample() + contextualSample() + textDirectionSample() + listPropertySample() + fontSample() + horizontalRuleSample() + markdownSample() + suggestionSample() + searchSample() + tableSample();
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
  if (checklistAPI) checklistState.value = checklistAPI.getState();
  if (fontAPI) fontState.value = fontAPI.getState();
  if (listPropertyAPI) listPropertyState.value = listPropertyAPI.getState();
  if (directionAPI) directionState.value = directionAPI.getState();
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
const runChecklist = (action: 'insert' | 'check' | 'uncheck' | 'toggle' | 'remove') => run(() => {
  if (!checklistAPI) return;
  if (action === 'check') checklistAPI.setChecked(true);
  else if (action === 'uncheck') checklistAPI.setChecked(false);
  else checklistAPI[action]();
});
const updateContextualTableUI = () => { mountContextualTableUI?.(); };
const selectContextualTable = (rectangle = false) => run((instance) => {
  const cell = instance.surface.querySelector<HTMLTableCellElement>('[title="Contextual table sample"] td');
  if (!cell || !commands) return;
  cell.scrollIntoView({ block: 'center' });
  const range = cell.ownerDocument.createRange();
  range.selectNodeContents(cell.querySelector('p') ?? cell);
  range.collapse(true);
  const selection = cell.ownerDocument.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  if (rectangle) commands.select({ row: 0, column: 0 }, { row: 1, column: 1 });
  else commands.select({ row: 0, column: 0 });
  contextualTableUI?.refresh();
}, false);
const loadContextualTableSample = () => {
  run((instance) => {
    sample.value = 'contextual-table';
    instance.setHTML(contextualTableSample());
    output.value = '';
  });
  selectContextualTable();
};
const updateContextualImageUI = () => { mountContextualImageUI?.(); };
const updateImageResizeUI = () => { mountImageResizeUI?.(); };
const selectContextualImageSample = () => run(() => { selectContextualImage?.(); }, false);
const loadContextualImageSample = () => run((instance) => {
  sample.value = 'contextual-image';
  instance.setHTML(contextualImageSample());
  selectContextualImage?.();
  output.value = '';
});
const updateContextualLinkUI = () => { mountContextualLinkUI?.(); };
const loadContextualLinkSample = () => run((instance) => {
  sample.value = 'contextual-link';
  instance.setHTML(contextualLinkSample());
  const block = instance.surface.querySelector('[title="Contextual link sample"]');
  block?.scrollIntoView({ block: 'center' });
  const text = block?.querySelector('a strong')?.firstChild;
  if (text) window.getSelection()?.setBaseAndExtent(text, 1, text, 1);
  output.value = '';
});
const selectContextualLinkSample = (kind: 'forward' | 'backward' | 'mixed') => run((instance) => {
  const block = instance.surface.querySelector('[title="Contextual link sample"]');
  const first = block?.querySelector('a strong')?.firstChild;
  const last = block?.querySelector('a em')?.firstChild;
  if (!first || !last || (kind === 'mixed' && block?.firstChild?.nodeType !== 3))
    throw new Error(t('Загрузи пример ссылки заново.', 'Load the link sample again.'));
  block?.scrollIntoView({ block: 'center' });
  const selection = window.getSelection();
  if (kind === 'mixed') selection?.setBaseAndExtent(block!.firstChild!, 3, last, 2);
  else if (kind === 'backward') selection?.setBaseAndExtent(last, 2, first, 1);
  else selection?.setBaseAndExtent(first, 1, last, 2);
}, false);
const updateContextualUI = () => { mountContextualUI?.(); };
const loadContextualSample = () => run((instance) => {
  sample.value = 'contextual';
  instance.setHTML(contextualSample());
  const block = instance.surface.querySelector('[title="Contextual sample"]');
  block?.scrollIntoView({ block: 'center' });
  const first = block?.querySelector('strong')?.firstChild;
  const last = block?.querySelector('em')?.firstChild;
  if (first && last) window.getSelection()?.setBaseAndExtent(last, 4, first, 1);
  output.value = '';
});
const applyTextDirection = (value: TextDirection | false) => run(() => { directionAPI?.setDirection(value); });
const loadTextDirectionSample = () => run((instance) => {
  sample.value = 'text-direction';
  instance.setHTML(textDirectionSample());
  const first = instance.surface.querySelector('[title="Direction first"] strong')?.firstChild;
  const last = instance.surface.querySelector('[title="Direction second"] em')?.firstChild;
  if (first && last) window.getSelection()?.setBaseAndExtent(last, 3, first, 1);
  output.value = '';
});
const applyListStart = () => run(() => { listPropertyAPI?.setStart(listStartChoice.value); });
const applyListReversed = () => run(() => { listPropertyAPI?.setReversed(listReversedChoice.value); });
const applyListMarker = () => run(() => { listPropertyAPI?.setMarker(listMarkerChoice.value); });
const resetListProperties = () => run((instance) => instance.transact(() => {
  if (!listPropertyAPI) return;
  if (listPropertyAPI.getState().kind === 'ordered') {
    listPropertyAPI.setStart(false);
    listPropertyAPI.setReversed(false);
  }
  listPropertyAPI.setMarker(false);
}));
const loadListPropertySample = () => run((instance) => {
  sample.value = 'list-properties';
  listReversedChoice.value = true;
  instance.setHTML(listPropertySample());
  const first = instance.surface.querySelector('[title="List property first"] strong')?.firstChild;
  const last = instance.surface.querySelector('[title="List property second"] em')?.firstChild;
  if (first && last) window.getSelection()?.setBaseAndExtent(last, 2, first, 1);
  output.value = '';
});
const setFontFamily = (reset = false) => run(() => { fontAPI?.setFamily(reset ? false : fontFamilyChoice.value); });
const setFontSize = (reset = false) => run(() => { fontAPI?.setSize(reset ? false : fontSizeChoice.value); });
const loadFontSample = () => run((instance) => {
  sample.value = 'fonts';
  instance.setHTML(fontSample());
  instance.setSelection(6, 3);
  const text = instance.surface.querySelector('[title="Font sample"] strong')?.firstChild;
  if (text) window.getSelection()?.setBaseAndExtent(text, 3, text, 0);
  output.value = '';
});
const loadHorizontalRuleSample = () => run((instance) => {
  sample.value = 'horizontal-rule';
  instance.setHTML(horizontalRuleSample());
  instance.setSelection(7);
  output.value = '';
});
const loadChecklistSample = () => {
  sample.value = 'checklists';
  loadSample();
};
const inspectSearchHighlights = () => {
  if (!searchHighlights) { searchHighlightsSnapshot.value = undefined; return; }
  try {
    searchHighlights.refresh();
    searchHighlightsSnapshot.value = searchHighlights.getState();
    notify('');
  }
  catch (error) { notify(error instanceof Error ? error.message : String(error), true); }
};
const updateSearchHighlights = () => { mountSearchHighlights?.(); inspectSearchHighlights(); };
const loadSearchHighlightsSample = () => run((instance) => {
  sample.value = 'search';
  instance.setHTML(searchSample());
  searchAPI?.clear();
  searchForm?.setValues({ query: 'Morfira', caseSensitive: false, wholeWord: true });
  inspectSearchHighlights();
});
const findSearchHighlights = () => {
  if (!searchAPI) return;
  try {
    searchAPI.setQuery('Morfira', { caseSensitive: false, wholeWord: true });
    searchForm?.setValues({ query: 'Morfira', caseSensitive: false, wholeWord: true });
    inspectSearchHighlights();
  }
  catch (error) { notify(error instanceof Error ? error.message : String(error), true); }
};
const clearSearchHighlights = () => {
  if (!searchAPI) return;
  try { searchAPI.clear(); inspectSearchHighlights(); }
  catch (error) { notify(error instanceof Error ? error.message : String(error), true); }
};
const toggleMarkdown = () => { markdownAPI?.setEnabled(markdownEnabled.value); };
const updateToolbarOverflow = () => run(() => { mountEditorUI?.(); }, false);
const updateEditorLocale = () => {
  editor?.setLocale(editorLocale.value);
};
const startAutolink = (enter: boolean) => run((instance) => {
  const text = enter ? 'https://example.com' : '';
  instance.setHTML(enter ? `<p>${text}</p>` : '<p><br></p>');
  instance.setSelection(text.length);
  output.value = '';
});
const startMarkdown = () => run((instance) => { instance.setHTML('<p><br></p>'); instance.setSelection(0); });
const useMarkdownCodec = async (action: 'replace' | 'insert' | 'export') => {
  const instance = editor;
  if (cancelled || !instance || (action !== 'export' && readOnly.value)) return;
  const request = ++markdownCodecRequest;
  const before = instance.getHTML();
  const revision = markdownCodecRevision;
  const selection = instance.getSelection();
  const input = markdownSource.value;
  markdownCodecBusy.value = true;
  try {
    const { parseMarkdown, serializeMarkdown } = await import('@morfira-dev/wysiwyg/codecs/markdown');
    if (cancelled || editor !== instance || request !== markdownCodecRequest) return;
    if (markdownCodecRevision !== revision || instance.getHTML() !== before || JSON.stringify(instance.getSelection()) !== JSON.stringify(selection))
      throw new Error(t('Документ или выделение изменились. Повтори действие.', 'The document or selection changed. Try the action again.'));
    if (action === 'export') {
      markdownSource.value = serializeMarkdown(instance.getJSON());
      notify('');
      return;
    }
    if (readOnly.value) return;
    const parsed = parseMarkdown(input);
    run((current) => {
      if (current !== instance) return;
      if (action === 'replace') current.setJSON(parsed);
      else current.insertHTML(current.schema.documentHTML(parsed));
      output.value = '';
    });
  }
  catch (error) { if (!cancelled && editor === instance && request === markdownCodecRequest) notify(error instanceof Error ? error.message : String(error), true); }
  finally { if (request === markdownCodecRequest) markdownCodecBusy.value = false; }
};

const inspectMentionReferences = () => {
  if (!editor || !readMentionReferences) return;
  try { mentionReferences.value = JSON.stringify(readMentionReferences(editor), null, 2); notify(''); }
  catch (error) { notify(error instanceof Error ? error.message : String(error), true); }
};
const loadMentionReferenceSample = () => run((instance) => {
  instance.setHTML(`<p><span data-mw-node="morfira:mention" data-mention-id="anna">@${t('Анна Смирнова', 'Anna Smith')}</span> ${t('готовит макет.', 'is preparing the design.')}</p>`);
  mentionReferences.value = '';
});
const roundTripMentionReferences = (format: 'html' | 'json') => run((instance) => {
  if (format === 'html') instance.setHTML(instance.getHTML());
  else instance.setJSON(instance.getJSON());
  mentionReferences.value = JSON.stringify(readMentionReferences?.(instance) ?? [], null, 2);
});
const closeSuggestions = () => { mentionAPI?.close(); slashAPI?.close(); };
const openSuggestions = () => run(() => { closeSuggestions(); if (!mentionAPI?.open()) slashAPI?.open(); }, false);
const startStructuralSlash = (command: string) => run((instance) => { const text = `/${command}`; instance.setHTML(`<p>${text}</p>`); instance.setSelection(text.length); slashAPI?.open(); });
const startSuggestions = (kind: 'mentions' | 'slash') => run((instance) => { const text = kind === 'mentions' ? '@an' : '/sig'; instance.setHTML(`<p>${text}</p>`); instance.setSelection(text.length); (kind === 'mentions' ? mentionAPI : slashAPI)?.open(); });
const sampleFactories: Record<string, () => string> = {
  empty: () => '<p><br></p>', input: inputSample, paste: inputSample, 'list-selection': listSelectionSample, suggestions: suggestionSample,
  'contextual-table': contextualTableSample, 'contextual-image': contextualImageSample, 'contextual-link': contextualLinkSample, contextual: contextualSample, 'text-direction': textDirectionSample, 'list-properties': listPropertySample, fonts: fontSample, checklists: checklistSample, 'horizontal-rule': horizontalRuleSample, markdown: markdownSample, statistics: statisticsSample, search: searchSample,
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
const loadListQuoteRepeatSample = () => run((instance) => {
  instance.setHTML('<ul><li title="Repeat owner"><p title="Before quote">Before <strong>one</strong></p><blockquote title="Existing quote" style="text-align: center"><p><em>Kept quote</em></p></blockquote><p title="Repeat target">Alpha <strong>one</strong> tail</p><h3 title="Repeat after">After body</h3><ol title="Repeat branch"><li>Nested branch</li></ol></li><li>Keep item</li></ul><p>Keep paragraph</p>');
  output.value = '';
});
const selectListQuoteRepeatCaret = (before: boolean) => run((instance) => {
  const body = instance.surface.querySelector(before ? '[title="Before quote"]' : '[title="Repeat target"]');
  const text = body?.querySelector(':scope > strong')?.firstChild;
  if (text?.nodeType !== 3 || (text.textContent?.length ?? 0) < 1)
    throw new Error(t('Загрузи пример повторной вставки с цитатой заново.', 'Reload the repeated quote insertion sample.'));
  document.getSelection()!.setBaseAndExtent(text, 1, text, 1);
}, false);
const loadListInsideQuoteSample = () => run((instance) => {
  instance.setHTML('<ul><li title="Quote owner"><p title="Outer before">Outer before</p><blockquote title="Editable quote" style="text-align: center"><p title="Quote before">Before quote body</p><p title="Quote start">Alpha <strong>one</strong></p><h3 title="Quote end"><em>Beta</em> tail</h3><p title="Quote after">After quote body</p></blockquote><p title="Outer after">Outer after</p><ol title="Quote branch"><li>Nested branch</li></ol></li><li>Keep item</li></ul><p>Keep paragraph</p>');
  output.value = '';
});
const selectListInsideQuote = (selected: boolean) => run((instance) => {
  const quote = instance.surface.querySelector('blockquote[title="Editable quote"]');
  const start = quote?.querySelector('[title="Quote start"]')?.firstChild;
  const caret = quote?.querySelector('[title="Quote start"] > strong')?.firstChild;
  const end = quote?.querySelector('[title="Quote end"] > em')?.firstChild;
  if (start?.nodeType !== 3 || caret?.nodeType !== 3 || end?.nodeType !== 3)
    throw new Error(t('Загрузи пример вставки внутри цитаты заново.', 'Reload the insertion-inside-quote sample.'));
  const selection = document.getSelection()!;
  if (selected) selection.setBaseAndExtent(end, 2, start, start.textContent!.length);
  else selection.setBaseAndExtent(caret, 1, caret, 1);
}, false);
const loadListCrossQuoteSample = () => run((instance) => {
  instance.setHTML('<ul><li title="Cross quote owner"><p title="Cross outer start">Alpha <strong>one</strong></p><blockquote title="Cross quote" style="text-align: center"><p title="Cross quoted before">Before quote body</p><p title="Cross quoted target"><em>Beta</em> tail</p><p title="Cross quoted after">After quote body</p></blockquote><p title="Cross outer end"><em>Gamma</em> tail</p><h3 title="Cross keep">Keep body</h3><ol title="Cross branch"><li>Nested branch</li></ol></li><li>Keep item</li></ul><p>Keep paragraph</p>');
  output.value = '';
});
const selectListCrossQuote = (direction: 'into' | 'out' | 'whole') => run((instance) => {
  const outerStart = instance.surface.querySelector('[title="Cross outer start"]')?.firstChild;
  const quoted = instance.surface.querySelector('[title="Cross quoted target"] > em')?.firstChild;
  const outerEnd = instance.surface.querySelector('[title="Cross outer end"] > em')?.firstChild;
  if (outerStart?.nodeType !== 3 || quoted?.nodeType !== 3 || outerEnd?.nodeType !== 3)
    throw new Error(t('Загрузи пример пересечения цитаты заново.', 'Reload the quote-crossing sample.'));
  const start = direction === 'out' ? quoted : outerStart;
  const end = direction === 'into' ? quoted : outerEnd;
  document.getSelection()!.setBaseAndExtent(end, 2, start, direction === 'out' ? 2 : 6);
}, false);
const loadListMultiQuoteSample = () => run((instance) => {
  instance.setHTML('<ul><li title="Multi quote owner"><p title="Multi outer start">Alpha tail</p><blockquote title="Multi first quote" style="text-align: right"><p title="Multi quoted prefix">Keep quoted prefix</p><h2 title="Multi first target">Beta tail</h2></blockquote><p title="Multi covered body">Covered body</p><blockquote title="Multi middle quote"><p>Middle quote</p></blockquote><blockquote title="Multi last quote" style="text-align: center"><h3 title="Multi last target">Gamma tail</h3><p title="Multi quoted suffix">Keep quoted suffix</p></blockquote><p title="Multi outer end">Delta tail</p><h3 title="Multi keep">Keep body</h3><ol title="Multi branch"><li>Nested branch</li></ol></li><li>Keep item</li></ul><p>Keep paragraph</p>');
  output.value = '';
});
const selectListMultiQuote = (direction: 'between' | 'into' | 'out' | 'whole') => run((instance) => {
  const first = instance.surface.querySelector(direction === 'between' || direction === 'out' ? '[title="Multi first target"]' : '[title="Multi outer start"]')?.firstChild;
  const last = instance.surface.querySelector(direction === 'between' || direction === 'into' ? '[title="Multi last target"]' : '[title="Multi outer end"]')?.firstChild;
  if (first?.nodeType !== 3 || last?.nodeType !== 3)
    throw new Error(t('Загрузи пример нескольких цитат заново.', 'Reload the multiple-quote sample.'));
  document.getSelection()!.setBaseAndExtent(last, 2, first, 2);
}, false);
const loadListSiblingQuoteSample = () => run((instance) => {
  instance.setHTML('<ul title="Sibling list"><li title="Sibling owner"><p title="Sibling before">Before</p><p title="Sibling outer start">Alpha tail</p><blockquote title="Sibling first quote" style="text-align: right"><p title="Sibling quoted prefix">Keep quoted prefix</p><h2 title="Sibling first target">Beta tail</h2></blockquote><p title="Sibling first cut">Cut first tail</p></li><li title="Sibling middle item"><p>Middle body</p><blockquote title="Sibling middle quote"><p>Middle quote</p></blockquote></li><li title="Sibling last item"><p title="Sibling last cut">Cut last prefix</p><blockquote title="Sibling last quote" style="text-align: center"><h3 title="Sibling last target">Gamma tail</h3><p title="Sibling quoted suffix">Keep quoted suffix</p></blockquote><p title="Sibling outer end">Delta tail</p><h3 title="Sibling keep">Keep body</h3><ol title="Sibling branch"><li>Nested branch</li></ol></li><li title="Sibling untouched">Keep item</li></ul><p>Keep paragraph</p>');
  output.value = '';
});
const selectListSiblingQuote = (direction: 'between' | 'into' | 'out' | 'whole') => run((instance) => {
  const first = instance.surface.querySelector(direction === 'between' || direction === 'out' ? '[title="Sibling first target"]' : '[title="Sibling outer start"]')?.firstChild;
  const last = instance.surface.querySelector(direction === 'between' || direction === 'into' ? '[title="Sibling last target"]' : '[title="Sibling outer end"]')?.firstChild;
  if (first?.nodeType !== 3 || last?.nodeType !== 3)
    throw new Error(t('Загрузи пример цитат в соседних пунктах заново.', 'Reload the sibling-item quote sample.'));
  document.getSelection()!.setBaseAndExtent(last, 2, first, 2);
}, false);
const loadListQuoteBranchesSample = () => run((instance) => {
  instance.setHTML('<ul title="Branch list"><li title="Branch owner"><p title="Branch before">Before</p><p title="Branch outer start">Alpha tail</p><blockquote title="Branch first quote" style="text-align: right"><p title="Branch quoted prefix">Keep quoted prefix</p><h2 title="Branch first target">Beta tail</h2></blockquote><p title="Branch first cut">Cut first tail</p><ul title="Branch first bullets"><li><p>First branch</p><ul title="Branch deep"><li>Deep branch</li></ul></li></ul><ol title="Branch first ordered" start="5"><li>First ordered branch</li></ol></li><li title="Branch middle item"><p>Middle body</p><blockquote title="Branch middle quote"><p>Middle quote</p></blockquote><ol title="Branch middle ordered" start="3"><li>Middle ordered branch</li></ol><ul title="Branch middle bullets"><li>Middle bullet branch</li></ul></li><li title="Branch last item"><p title="Branch last cut">Cut last prefix</p><blockquote title="Branch last quote" style="text-align: center"><h3 title="Branch last target">Gamma tail</h3><p title="Branch quoted suffix">Keep quoted suffix</p></blockquote><p title="Branch outer end">Delta tail</p><h3 title="Branch keep">Keep body</h3><ol title="Branch branch"><li>Last branch</li><li><br></li></ol></li><li title="Branch untouched">Keep item</li></ul><p>Keep paragraph</p>');
  output.value = '';
});
const selectListQuoteBranches = (direction: 'between' | 'into' | 'out' | 'whole') => run((instance) => {
  const first = instance.surface.querySelector(direction === 'between' || direction === 'out' ? '[title="Branch first target"]' : '[title="Branch outer start"]')?.firstChild;
  const last = instance.surface.querySelector(direction === 'between' || direction === 'into' ? '[title="Branch last target"]' : '[title="Branch outer end"]')?.firstChild;
  if (first?.nodeType !== 3 || last?.nodeType !== 3)
    throw new Error(t('Загрузи пример сохранения веток заново.', 'Reload the quote-branch preservation sample.'));
  document.getSelection()!.setBaseAndExtent(last, 2, first, 2);
}, false);
const loadListInterleavedQuoteSample = () => run((instance) => {
  instance.setHTML('<ul title="Inter list"><li title="Inter owner"><p title="Inter before">Before</p><ul title="Inter prefix branch"><li>Prefix branch</li></ul><p title="Inter outer start">Alpha tail</p><blockquote title="Inter first quote" style="text-align: right"><p title="Inter quoted prefix">Keep quoted prefix</p><h2 title="Inter first target">Beta tail</h2></blockquote><ul title="Inter first branch"><li>First interval branch</li></ul><p title="Inter first cut">Cut first tail</p></li><li title="Inter middle item"><p>Middle body</p><ol title="Inter middle branch" start="5"><li>Middle interval branch</li></ol><blockquote title="Inter middle quote"><p>Middle quote</p></blockquote><p>Cut middle tail</p></li><li title="Inter last item"><p title="Inter last cut">Cut last prefix</p><ul title="Inter last branch"><li><br></li></ul><blockquote title="Inter last quote" style="text-align: center"><h3 title="Inter last target">Gamma tail</h3><p title="Inter quoted suffix">Keep quoted suffix</p></blockquote><p title="Inter outer end">Delta tail</p><ol title="Inter following branch" start="7"><li>Following branch</li></ol><h3 title="Inter keep">Keep body after branch</h3><ul title="Inter tail branch"><li>Tail branch</li></ul></li><li title="Inter untouched">Keep item</li></ul><p>Keep paragraph</p>');
  output.value = '';
});
const selectListInterleavedQuote = (direction: 'between' | 'into' | 'out' | 'whole') => run((instance) => {
  const first = instance.surface.querySelector(direction === 'between' || direction === 'out' ? '[title="Inter first target"]' : '[title="Inter outer start"]')?.firstChild;
  const last = instance.surface.querySelector(direction === 'between' || direction === 'into' ? '[title="Inter last target"]' : '[title="Inter outer end"]')?.firstChild;
  if (first?.nodeType !== 3 || last?.nodeType !== 3)
    throw new Error(t('Загрузи пример блоков после веток заново.', 'Reload the blocks-after-branches sample.'));
  document.getSelection()!.setBaseAndExtent(last, 2, first, 2);
}, false);
const loadListInterleavedInsideQuoteSample = () => run((instance) => {
  instance.setHTML('<ul><li title="Inner inter owner"><p title="Inner inter before">Outer before</p><ul title="Inner inter prefix branch"><li>Prefix branch</li></ul><blockquote title="Inner inter neighbor">Neighbor quote</blockquote><blockquote title="Inner inter quote" style="text-align: center"><p title="Inner inter quote before">Before quote body</p><p title="Inner inter start">Alpha <strong>one</strong></p><h3 title="Inner inter end"><em>Beta</em> tail</h3><p title="Inner inter quote after">After quote body</p></blockquote><ol title="Inner inter following branch" start="5"><li><br></li></ol><h2 title="Inner inter after">Body after branch</h2><ul title="Inner inter tail"><li>Tail branch</li></ul></li><li>Keep item</li></ul><p>Keep paragraph</p>');
  output.value = '';
});
const selectListInterleavedInsideQuote = (selected: boolean) => run((instance) => {
  const quote = instance.surface.querySelector('[title="Inner inter quote"]');
  const start = quote?.querySelector('[title="Inner inter start"]')?.firstChild;
  const caret = quote?.querySelector('[title="Inner inter start"] > strong')?.firstChild;
  const end = quote?.querySelector('[title="Inner inter end"] > em')?.firstChild;
  if (start?.nodeType !== 3 || caret?.nodeType !== 3 || end?.nodeType !== 3)
    throw new Error(t('Загрузи пример цитаты среди блоков и веток заново.', 'Reload the quote-inside-interleaved-item sample.'));
  if (selected) document.getSelection()!.setBaseAndExtent(end, 2, start, start.textContent!.length);
  else document.getSelection()!.setBaseAndExtent(caret, 1, caret, 1);
}, false);
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
const pasteOfficeSample = (source: OfficeSample) => run((instance) => {
  instance.setHTML('<p><br></p>');
  const range = document.createRange();
  range.selectNodeContents(instance.surface.firstElementChild!);
  range.collapse(true);
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  const data = new DataTransfer();
  data.setData('text/html', officePasteSamples[source]);
  const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: data });
  instance.surface.dispatchEvent(event);
  output.value = '';
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
const insertListQuote = () => run((instance) => instance.insertHTML(listQuoteHTML.value));
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
const failNextImageUpload = ref(false);
const demoUpload = (_file: File, { signal, reportProgress }: ImageUploadContext): Promise<ImageValue> => new Promise((resolve, reject) => {
  const fail = failNextImageUpload.value;
  failNextImageUpload.value = false;
  let loaded = 0;
  const cleanup = () => {
    window.clearInterval(timer);
    signal.removeEventListener('abort', abort);
  };
  const abort = () => {
    cleanup();
    reject(new DOMException('Cancelled', 'AbortError'));
  };
  // Simulated callback feedback only: the selected file is never read or sent.
  const timer = window.setInterval(() => {
    if (signal.aborted) { abort(); return; }
    loaded += 20;
    reportProgress({ loaded, total: 100 });
    if (signal.aborted) return;
    if (fail && loaded >= 60) {
      cleanup();
      reject(new Error('Simulated image upload failure'));
    }
    else if (loaded === 100) {
      cleanup();
      resolve({ src: '/logo.svg', alt: 'Morfira demo', width: 160, height: 160, caption: t('Демо результата callback загрузки', 'Demo upload callback result') });
    }
  }, 300);
  if (signal.aborted) abort();
  else {
    signal.addEventListener('abort', abort, { once: true });
    reportProgress({ loaded: 0, total: 100 });
  }
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
    { checklists, checklistCommands },
    { fonts, fontCommands },
    { listProperties, listPropertyCommands },
    { textDirection, textDirectionCommands },
    { mentionCommands, getMentions },
    { slashCommands, createSlashActions },
    { createLinkForm },
    { createImageForm },
    { createSearchForm },
    { searchCommands },
    { createSearchHighlights },
    { createMinimalPreset },
    { createExtendedPreset },
    { createEditorUI },
    { createExtendedEditorUI },
    { createContextualToolbar },
    { createContextualLinkUI },
    { createContextualImageUI },
    { createImageResizeUI },
    { createContextualTableUI },
    { imageCommands },
    { createTablePicker },
    { imageInput },
    { tableProperties },
    { createTablePropertiesForm },
  ] = await Promise.all([
    import('@morfira-dev/wysiwyg'),
    import('@morfira-dev/wysiwyg/plugins/tables'),
    import('@morfira-dev/wysiwyg/plugins/statistics'),
    import('@morfira-dev/wysiwyg/plugins/markdown'),
    import('@morfira-dev/wysiwyg/plugins/checklists'),
    import('@morfira-dev/wysiwyg/plugins/fonts'),
    import('@morfira-dev/wysiwyg/plugins/list-properties'),
    import('@morfira-dev/wysiwyg/plugins/text-direction'),
    import('@morfira-dev/wysiwyg/plugins/mentions'),
    import('@morfira-dev/wysiwyg/plugins/slash'),
    import('@morfira-dev/wysiwyg/ui/links'),
    import('@morfira-dev/wysiwyg/ui/images'),
    import('@morfira-dev/wysiwyg/ui/search'),
    import('@morfira-dev/wysiwyg/plugins/search'),
    import('@morfira-dev/wysiwyg/ui/search-highlights'),
    import('@morfira-dev/wysiwyg/presets/minimal'),
    import('@morfira-dev/wysiwyg/presets/extended'),
    import('@morfira-dev/wysiwyg/ui/editor'),
    import('@morfira-dev/wysiwyg/ui/extended'),
    import('@morfira-dev/wysiwyg/ui/contextual'),
    import('@morfira-dev/wysiwyg/ui/contextual-link'),
    import('@morfira-dev/wysiwyg/ui/contextual-image'),
    import('@morfira-dev/wysiwyg/ui/image-resize'),
    import('@morfira-dev/wysiwyg/ui/contextual-table'),
    import('@morfira-dev/wysiwyg/plugins/images'),
    import('@morfira-dev/wysiwyg/ui/table-picker'),
    import('@morfira-dev/wysiwyg/plugins/image-input'),
    import('@morfira-dev/wysiwyg/plugins/table-properties'),
    import('@morfira-dev/wysiwyg/ui/table-properties'),
  ]);
  if (cancelled) return;
  const common = {
    locale: editorLocale.value,
    label: t('Попробуйте Morfira', 'Try Morfira'),
    value: props.full ? showcase() : article(),
    onChange: (change: EditorChange) => { mentionReferences.value = ''; markdownCodecRevision++; source.value = change.source; refresh(); },
  };
  const preset = props.full ? createExtendedPreset({
    ...common,
    plugins: [tableProperties(), imageInput({ onError: (error) => notify(error instanceof Error ? error.message : String(error), true) }), checklists(), listProperties(), textDirection(), fonts({
      families: fontFamilies.map((option) => ({ id: option.id, label: t(option.ru, option.en), family: option.family })),
      sizes: fontSizes,
    })],
    mentions: { provide: people, debounceMs: 0, persistent: true },
    slash: { provide: snippets, debounceMs: 0, actions: { ...createSlashActions(), table: (instance: Editor) => tableCommands(instance).insert(3, 3) } },
    images: { upload: demoUpload },
    statistics: { locale: ru.value ? 'ru' : 'en' },
    tables: { onClipboardError: (error: Error) => notify(error.message, true) },
  }) : createMinimalPreset(common);
  editor = createEditor(host.value!, preset);
  if (props.full) {
    checklistAPI = checklistCommands(editor);
    fontAPI = fontCommands(editor);
    listPropertyAPI = listPropertyCommands(editor);
    directionAPI = textDirectionCommands(editor);
    readMentionReferences = getMentions;
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
    tablePropertiesForm = createTablePropertiesForm(tablePropertiesFormHost.value!, editor, {
      onError: (error) => notify(error instanceof Error ? error.message : String(error), true),
    });
    searchAPI = searchCommands(editor);
    searchForm = createSearchForm(searchFormHost.value!, editor, {
      initialValues: { query: 'Morfira', replacement: 'Morfira Studio', caseSensitive: false, wholeWord: false },
    });
  }
  mountSearchHighlights = () => {
    searchHighlights?.destroy();
    searchHighlights = undefined;
    if (props.full && searchHighlightsEnabled.value)
      searchHighlights = createSearchHighlights(editor!, { onError: (error) => notify(error instanceof Error ? error.message : String(error), true) });
  };
  mountSearchHighlights();
  inspectSearchHighlights();
  mountEditorUI = () => {
    disposeEditorUI?.();
    const ui = props.full ? createExtendedEditorUI(toolbar.value!, editor!, {
      label: t('Форматирование', 'Formatting'),
      overflow: toolbarOverflow.value,
      links: { initialValues: { href: 'https://example.com' } },
      images: { initialValues: { src: '/logo.svg', alt: 'Morfira', width: '64' } },
      search: { initialValues: { query: 'Morfira', replacement: 'Morfira Studio' } },
      table: { picker: createTablePicker },
      mentions: { labels: { label: t('Люди', 'People'), loading: t('Ищем людей…', 'Finding people…'), empty: t('Люди не найдены', 'No people found'), error: t('Ошибка поиска людей', 'People lookup failed'), results: t('Людей: {count}', 'People: {count}') } },
      slash: { labels: { label: t('Шаблоны', 'Snippets'), loading: t('Ищем шаблоны…', 'Finding snippets…'), empty: t('Шаблоны не найдены', 'No snippets found'), error: t('Ошибка поиска шаблонов', 'Snippet lookup failed'), results: t('Шаблонов: {count}', 'Snippets: {count}') } },
    }) : createEditorUI(toolbar.value!, editor!, { overflow: toolbarOverflow.value });
    disposeEditorUI = ui.destroy;
  };
  mountEditorUI();
  mountContextualUI = () => {
    contextualUI?.destroy();
    contextualUI = undefined;
    if (props.full && contextualEnabled.value)
      contextualUI = createContextualToolbar(contextualHost.value!, editor!);
  };
  mountContextualUI();
  mountContextualLinkUI = () => {
    contextualLinkUI?.destroy();
    contextualLinkUI = undefined;
    if (props.full && contextualLinkEnabled.value)
      contextualLinkUI = createContextualLinkUI(contextualLinkHost.value!, editor!);
  };
  mountContextualLinkUI();
  mountContextualTableUI = () => {
    contextualTableUI?.destroy();
    contextualTableUI = undefined;
    if (props.full && contextualTableEnabled.value)
      contextualTableUI = createContextualTableUI(contextualTableHost.value!, editor!);
  };
  mountContextualTableUI();
  mountContextualImageUI = () => {
    contextualImageUI?.destroy();
    contextualImageUI = undefined;
    if (props.full && contextualImageEnabled.value)
      contextualImageUI = createContextualImageUI(contextualImageHost.value!, editor!);
  };
  mountContextualImageUI();
  mountImageResizeUI = () => {
    imageResizeUI?.destroy();
    imageResizeUI = undefined;
    if (props.full && imageResizeEnabled.value)
      imageResizeUI = createImageResizeUI(imageResizeHost.value!, editor!, {
        onError: (error) => notify(error instanceof Error ? error.message : String(error), true),
      });
  };
  mountImageResizeUI();
  selectContextualImage = () => {
    const image = editor?.surface.querySelector<HTMLImageElement>('[title="Contextual image sample"] img');
    if (!editor || !image) return;
    image.scrollIntoView({ block: 'center' });
    imageCommands(editor).select(image);
    contextualImageUI?.refresh();
    imageResizeUI?.refresh();
  };
  unsubscribe = editor.subscribe(refresh); unselect = editor.onSelectionChange(refresh); ready.value = true; refresh();
});
onBeforeUnmount(() => {
  cancelled = true;
  markdownCodecRequest++;
  linkForm?.destroy();
  imageForm?.destroy();
  tablePropertiesForm?.destroy();
  searchHighlights?.destroy();
  searchForm?.destroy();
  unmention?.();
  unslash?.();
  unstatistics?.();
  unsubscribe?.();
  unselect?.();
  contextualTableUI?.destroy();
  contextualImageUI?.destroy();
  imageResizeUI?.destroy();
  contextualLinkUI?.destroy();
  contextualUI?.destroy();
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
        <label>{{ t('Документ', 'Document') }}<select v-model="sample" :aria-label="t('Пример документа', 'Document sample')"><option value="showcase">{{ t('Все форматы', 'All formats') }}</option><option value="paste">{{ t('Вставка между блоками', 'Paste between blocks') }}</option><option value="input">{{ t('Границы блоков', 'Block boundaries') }}</option><option value="article">{{ t('Статья', 'Article') }}</option><option value="list-selection">{{ t('Выделение пунктов списка', 'List item selection') }}</option><option value="lists">{{ t('Списки и вложенность', 'Lists and nesting') }}</option><option value="horizontal-rule">{{ t('Разделитель', 'Horizontal rule') }}</option><option value="contextual-table">{{ t('Контекстная таблица', 'Contextual table') }}</option><option value="contextual-image">{{ t('Свойства изображения', 'Image properties') }}</option><option value="contextual-link">{{ t('Действия со ссылкой', 'Link actions') }}</option><option value="contextual">{{ t('Контекстная панель', 'Contextual toolbar') }}</option><option value="text-direction">{{ t('Направление текста', 'Text direction') }}</option><option value="list-properties">{{ t('Свойства списка', 'List properties') }}</option><option value="fonts">{{ t('Шрифты и размер текста', 'Font family and size') }}</option><option value="checklists">{{ t('Чек-листы', 'Checklists') }}</option><option value="suggestions">{{ t('Упоминания и шаблоны', 'Mentions and snippets') }}</option><option value="markdown">Markdown shortcuts</option><option value="statistics">{{ t('Unicode и статистика', 'Unicode and statistics') }}</option><option value="search">{{ t('Поиск и замена', 'Find and replace') }}</option><option value="images">{{ t('Изображения', 'Images') }}</option><option value="styling">{{ t('Цвета и ссылки', 'Colors and links') }}</option><option value="tables">{{ t('Таблицы', 'Tables') }}</option><option value="empty">{{ t('Пустой', 'Empty') }}</option></select></label>
        <button :disabled="!ready || readOnly" @click="loadSample">{{ t('Загрузить пример', 'Load sample') }}</button>
      </template>
      <label>{{ t('Язык редактора', 'Editor language') }}<select v-model="editorLocale" :disabled="!ready" :aria-label="t('Язык интерфейса редактора', 'Editor interface language')" @change="updateEditorLocale"><option value="ru">Русский</option><option value="en">English</option></select></label>
      <label>{{ t('Режим панели', 'Toolbar layout') }}<select v-model="toolbarOverflow" :disabled="!ready" :aria-label="t('Режим панели', 'Toolbar layout')" @change="updateToolbarOverflow"><option value="wrap">{{ t('Перенос строк', 'Wrap controls') }}</option><option value="more">{{ t('Скрывать в «Ещё»', 'Move into More') }}</option></select></label>
      <label v-if="full"><input v-model="contextualEnabled" type="checkbox" :disabled="!ready" :aria-label="t('Контекстная панель', 'Contextual toolbar')" @change="updateContextualUI">{{ t('Контекстная панель', 'Contextual toolbar') }}</label>
      <label v-if="full"><input v-model="contextualTableEnabled" type="checkbox" :disabled="!ready" :aria-label="t('Контекстная панель таблиц', 'Contextual table toolbar')" @change="updateContextualTableUI">{{ t('Контекстная панель таблиц', 'Contextual table toolbar') }}</label>
      <label v-if="full"><input v-model="contextualImageEnabled" type="checkbox" :disabled="!ready" :aria-label="t('Контекстные свойства изображения', 'Contextual image properties')" @change="updateContextualImageUI">{{ t('Контекстные свойства изображения', 'Contextual image properties') }}</label>
      <label v-if="full"><input v-model="imageResizeEnabled" type="checkbox" :disabled="!ready" :aria-label="t('Маркеры размера изображения', 'Image resize handles')" @change="updateImageResizeUI">{{ t('Маркеры размера изображения', 'Image resize handles') }}</label>
      <label v-if="full"><input v-model="contextualLinkEnabled" type="checkbox" :disabled="!ready" :aria-label="t('Действия со ссылкой', 'Link actions')" @change="updateContextualLinkUI">{{ t('Действия со ссылкой', 'Link actions') }}</label>
      <button @click="dark = !dark">{{ t('Сменить тему', 'Toggle theme') }}</button>
      <button :disabled="!ready" @click="toggleReadOnly">{{ readOnly ? t('Редактировать', 'Edit') : t('Только чтение', 'Read only') }}</button>
      <button :disabled="!ready" @click="snapshot('html')">HTML</button><button v-if="full" :disabled="!ready" @click="snapshot('json')">JSON</button>
    </div>
    <p class="lab-hint">{{ t('Язык меняет готовую панель и формы без замены документа. Подписи примеров и провайдеров подсказок остаются на языке страницы.', 'Language changes the ready toolbar and forms without replacing the document. Sample and suggestion-provider labels remain in the page language.') }}</p>
    <p v-if="toolbarOverflow === 'more'" class="lab-hint">{{ t('«Ещё» переносит целые группы по доступной ширине панели. Смена режима пересоздаёт только UI: документ, история и выделение редактора сохраняются. Контекстные всплывающие инструменты остаются в плане.', 'More moves whole groups according to the toolbar host width. Changing modes remounts only UI: the editor document, history and selection remain. Contextual floating controls remain planned.') }}</p>
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
        <div ref="toolbar" class="demo-toolbar-host"></div><div ref="host" @compositionstart="refresh" @compositionend="refresh"></div>
        <div class="demo-status"><span>{{ count }} {{ t('символов', 'characters') }}<template v-if="full"> · {{ words }} {{ t('слов', 'words') }}</template></span><span v-if="full">undo {{ undoAvailable ? '●' : '○' }} · redo {{ redoAvailable ? '●' : '○' }} · {{ source }}</span><span v-else>{{ t('Минимальный пресет · готовая панель', 'Minimal preset · ready toolbar') }}</span></div>
        <p v-if="full" class="lab-hint">{{ t('Выделяй текст перед форматированием. Кликни в ячейку перед табличной командой. Ctrl/Cmd+Z — отмена; Ctrl/Cmd+B/I/U — формат; Enter — новый пункт, пустой — выход; Tab/Shift+Tab — вложенность. В таблице Tab — следующая ячейка.', 'Select text before formatting. Click a cell before a table command. Ctrl/Cmd+Z undoes; Ctrl/Cmd+B/I/U formats; Enter splits an item; an empty item exits. Tab/Shift+Tab nests lists; in tables Tab moves to the next cell.') }}</p>
      </div>
      <aside v-if="full" class="demo-inspector">
        <details open class="lab-tables"><summary>{{ t('Таблицы', 'Tables') }}</summary><fieldset :disabled="!ready || readOnly">
          <div class="lab-fields"><label>{{ t('Строки', 'Rows') }}<input v-model.number="rows" type="number" min="1" max="100"></label><label>{{ t('Столбцы', 'Columns') }}<input v-model.number="columns" type="number" min="1" max="100"></label></div>
          <button @click="insertTable">{{ t('Вставить таблицу', 'Insert table') }}</button>
          <div class="lab-button-grid"><button @click="tableRun((api) => api.rowAbove())">{{ t('Строка выше', 'Row above') }}</button><button @click="tableRun((api) => api.rowBelow())">{{ t('Строка ниже', 'Row below') }}</button><button @click="tableRun((api) => api.columnLeft())">{{ t('Столбец слева', 'Column left') }}</button><button @click="tableRun((api) => api.columnRight())">{{ t('Столбец справа', 'Column right') }}</button><button @click="tableRun((api) => api.merge())">{{ t('Объединить', 'Merge') }}</button><button @click="tableRun((api) => api.split())">{{ t('Разделить', 'Split') }}</button><button @click="tableRun((api) => api.deleteRow())">{{ t('Удалить строку', 'Delete row') }}</button><button @click="tableRun((api) => api.deleteColumn())">{{ t('Удалить столбец', 'Delete column') }}</button></div>
          <button class="lab-danger" @click="tableRun((api) => api.remove())">{{ t('Удалить таблицу', 'Delete table') }}</button>
          <hr><p class="lab-hint">{{ t('Прямоугольное выделение: номера с 1.', 'Rectangle selection: positions start at 1.') }}</p>
          <div class="lab-fields"><label>{{ t('От строки', 'From row') }}<input v-model.number="fromRow" type="number" min="1"></label><label>{{ t('От столбца', 'From column') }}<input v-model.number="fromColumn" type="number" min="1"></label><label>{{ t('До строки', 'To row') }}<input v-model.number="toRow" type="number" min="1"></label><label>{{ t('До столбца', 'To column') }}<input v-model.number="toColumn" type="number" min="1"></label></div>
          <button @click="tableRun((api) => api.select({ row: fromRow - 1, column: fromColumn - 1 }, { row: toRow - 1, column: toColumn - 1 }), false)">{{ t('Выделить диапазон', 'Select range') }}</button>
          <div class="lab-fields"><label>{{ t('Номер столбца', 'Column number') }}<input v-model.number="widthColumn" type="number" min="1"></label><label>{{ t('Ширина, px', 'Width, px') }}<input v-model.number="widthValue" type="number" min="40" max="4000"></label></div>
          <button @click="tableRun((api) => api.columnWidth(widthColumn - 1, widthValue))">{{ t('Применить ширину', 'Apply width') }}</button>
        </fieldset>
        <div ref="tablePropertiesFormHost" class="demo-table-properties-host"></div>
        <p class="lab-hint">{{ t('Минимум строки: загрузи пример «Таблицы», кликни в первую ячейку данных с rowspan=2 и задай «Минимальная высота строк (1–1000px)» = 80px. Apply изменит обе строки данных, а заголовок останется прежним. Пустое поле сбрасывает высоту; контент может сделать строку выше. Теперь добавь столбец или выполни merge/split: высоты сохранятся. Новая строка не наследует соседнюю высоту.', 'Row minimum: load the Tables sample, click the first body cell with rowspan=2 and set Minimum row height (1–1000px) to 80px. Apply changes both body rows and leaves the header alone. An empty field resets height; content may make a row taller. Now add a column or merge/split: heights stay intact. A new row does not inherit neighboring height.') }}</p>
        <p class="lab-hint">{{ t('Оформление ячеек: загрузи контекстную таблицу и выдели область 2 × 2. Задай отступы 8px, толщину границ 2px и стиль «Штриховая», затем Apply. Пустое поле сбрасывает только своё свойство; цвет, толщина и стиль независимы. Отступ одинаковый для четырёх сторон; collapsed borders и тема могут влиять на вид общей границы.', 'Cell formatting: load the contextual table and select the 2 × 2 region. Set padding to 8px, border width to 2px and style to Dashed, then Apply. An empty field resets only its own property; color, width and style are independent. Padding is uniform on four sides; collapsed borders and the theme can affect a shared border.') }}</p>
        <p class="lab-hint">{{ t('Свойства: кликните в ячейку или выделите прямоугольник. Меняются только отредактированные поля; один Apply — один Undo. Ширина и положение относятся к таблице, цвета и вертикальное выравнивание — к выбранным ячейкам.', 'Properties: click a cell or select a rectangle. Only edited fields change; one Apply is one Undo. Width and placement belong to the table; colors and vertical alignment belong to selected cells.') }}</p>
        <p class="lab-hint">{{ t('Загрузи пример «Таблицы»: в нём уже есть строка заголовков, подпись и rowspan в первом столбце. В форме включи «Столбец заголовков» и измени «Подпись таблицы». Заголовки относятся к первой строке/столбцу всей таблицы; объединённое содержимое сохраняется. Если объединение пересекает границу заголовка, весь Apply отклоняется без частичных изменений.', 'Load the Tables sample: it has a header row, caption and a first-column rowspan. In the form, enable Header column and edit Table caption. Headers belong to the first row/column of the whole table; merged content is retained. A merge crossing a header boundary rejects the whole Apply without partial changes.') }}</p>
        </details>
        <details class="lab-office-paste"><summary>{{ t('Вставка из офисных приложений', 'Office application paste') }}</summary><fieldset :disabled="!ready || readOnly">
          <p class="lab-hint">{{ t('Заменяет содержимое демо и сбрасывает прежнюю историю.', 'Replaces demo content and clears previous history.') }}</p>
          <div class="lab-inline-actions">
            <button @click="pasteOfficeSample('word')">{{ t('Вставить пример Word', 'Paste Word sample') }}</button>
            <button @click="pasteOfficeSample('excel')">{{ t('Вставить пример Excel', 'Paste Excel sample') }}</button>
            <button @click="pasteOfficeSample('google-docs')">{{ t('Вставить пример Google Docs', 'Paste Google Docs sample') }}</button>
          </div>
          <p class="lab-hint">{{ t('Кнопка заменяет документ пустым абзацем и отправляет демонстрационный paste; Undo отменяет вставку. Это написанные вручную образцы разметки, а не реальные снимки буфера Word/Excel/Google Docs. Доступ к системному буферу не нужен. В Word восстанавливаются поддержанные списки, в Docs убирается служебная жирная обёртка, в Excel сохраняются таблица и colspan. Стили из классов и таблиц стилей отбрасываются.', 'Each button replaces the document with an empty paragraph and dispatches a demonstration paste; Undo reverts the paste. These are hand-authored markup samples, not actual Word/Excel/Google Docs clipboard captures. No system clipboard permission is needed. Supported Word lists are reconstructed, the Docs bold wrapper is neutralized, and the Excel table and colspan survive. Classes and stylesheets are discarded.') }}</p>
          <a :href="ru ? '/office-paste' : '/en/office-paste'">{{ t('Поддержка и ограничения офисной вставки', 'Office paste support and limitations') }}</a>
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
          <p class="lab-hint">{{ t('Новый сценарий: код добавлен, результаты проверок — в дорожной карте. Загрузи одноимённый пример в меню «Документ», выдели пункты и попробуй ввод, Backspace/Delete или вставку ниже. Вложенная ветка последнего пункта должна сохраниться.', 'Local scenario; see the roadmap for verification results and limits. Load this sample from the Document menu, select its items, then try typing, Backspace/Delete or the insertion controls below. The last item’s nested branch must remain.') }}</p>
          <label>{{ t('Содержимое пункта', 'Item body') }}<select v-model="listBodyMode" :aria-label="t('Содержимое пункта', 'Item body')"><option value="inline">{{ t('Строчный текст', 'Inline text') }}</option><option value="paragraph">{{ t('Абзацы', 'Paragraphs') }}</option><option value="heading">{{ t('Заголовки', 'Headings') }}</option><option value="mixed">{{ t('Абзац и заголовок', 'Paragraph and heading') }}</option><option value="multiblock">{{ t('Несколько блоков', 'Multiple blocks') }}</option></select></label>
          <button @click="loadListBodySample">{{ t('Загрузить пример с блоками', 'Load block-body sample') }}</button>
          <p class="lab-hint">{{ t('Кнопка заменяет документ выбранным примером. При замене сохраняются начальный блок и его выравнивание, невыделенные блоки после конечного тела и вложенные списки вне блоков. Enter делит пункт и переносит последующие блоки; Shift+Enter добавляет перенос внутри одного блока. Результаты проверок — в дорожной карте.', 'The button replaces the document with the selected sample. Replacement retains the starting block and its alignment, unselected blocks after the ending body and nested lists outside bodies. Enter splits the item and moves subsequent blocks; Shift+Enter adds a line break inside one block. These scenarios are not validated yet.') }}</p>
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
          <label>{{ t('HTML цитаты', 'Quote HTML') }}<textarea v-model="listQuoteHTML" :aria-label="t('HTML цитаты', 'Quote HTML')" rows="3" spellcheck="false"></textarea></label>
          <button @click="insertListQuote">{{ t('Вставить цитату', 'Insert quote') }}</button>
          <p class="lab-hint">{{ t('Цитата вставляется отдельным blockquote между исходным началом и отдельным телом с остатком; курсор будет перед остатком. Внутри допустим строчный текст либо обычные абзацы/заголовки. Повторная блочная вставка рядом с цитатой сохраняет её целиком. Внутри одной обычной цитаты доступны несколько абзацев/заголовков и одиночный заголовок; пересечение одной или нескольких цитат внутри того же пункта имеет отдельный блочный путь, вложенная цитата внутри неё блокируется. Нативные операции на границах не расширены; результаты проверок — в дорожной карте.', 'A quote is inserted as a separate blockquote between the source prefix and a separate suffix body; the caret starts before the suffix. It accepts inline content or ordinary paragraphs/headings. Repeated block insertion beside a quote preserves it whole. Inside one ordinary quote, multiple paragraphs/headings and a single heading are supported; crossing one or several quotes within the same item has a separate block path; inserting a nested quote inside it is blocked. Native boundary operations are not extended; see the roadmap for verification results.') }}</p>
          <button @click="loadListQuoteRepeatSample">{{ t('Загрузить пример повторной вставки', 'Load repeated insertion sample') }}</button>
          <button @click="selectListQuoteRepeatCaret(true)">{{ t('Курсор перед существующей цитатой', 'Caret before existing quote') }}</button>
          <button @click="selectListQuoteRepeatCaret(false)">{{ t('Курсор после существующей цитаты', 'Caret after existing quote') }}</button>
          <p class="lab-hint">{{ t('Загрузка заменяет документ. Выбери курсор до или после цитаты, затем попробуй «Вставить цитату», «Вставить заголовок» и «Заменить несколькими блоками» подряд без перезагрузки. Исходная цитата, соседние тела и вложенная ветка должны сохранять содержимое и порядок; каждый шаг имеет отдельный Undo. Строчная и одноабзацная вставка сохраняют прежние пути, поддержка всех операций с цитатой не заявляется.', 'Loading replaces the document. Choose a caret before or after the quote, then try Insert quote, Insert heading and Replace with multiple blocks consecutively without reloading. The original quote, neighboring bodies and nested branch must retain content and order; each step has its own Undo. Inline and single-paragraph insertion retain their earlier paths; complete quote editing is not claimed.') }}</p>
          <button @click="loadListInsideQuoteSample">{{ t('Загрузить пример вставки внутри цитаты', 'Load insertion-inside-quote sample') }}</button>
          <button @click="selectListInsideQuote(false)">{{ t('Курсор внутри цитаты', 'Caret inside quote') }}</button>
          <button @click="selectListInsideQuote(true)">{{ t('Выделить блоки внутри цитаты', 'Select blocks inside quote') }}</button>
          <p class="lab-hint">{{ t('Загрузка заменяет документ. Поставь курсор или выдели два блока внутри цитаты, затем используй «Заменить несколькими блоками» либо «Вставить заголовок». Вставка остаётся внутри того же blockquote; внешние тела и вложенный список сохраняются. «Вставить цитату» здесь отклоняется: вложенные цитаты внутри одной цитаты не поддержаны; диапазон между разными цитатами использует отдельный путь ниже. Это ещё не полное редактирование цитат; результаты проверок — в дорожной карте.', 'Loading replaces the document. Place the caret or select two bodies inside the quote, then use Replace with multiple blocks or Insert heading. Insertion stays inside the same blockquote; outer bodies and the nested list remain. Insert quote is refused here: nested quotes inside a quote are unsupported; a range between different quotes uses the separate path below. This is not complete quote editing; see the roadmap for verification results.') }}</p>
          <button @click="loadListCrossQuoteSample">{{ t('Загрузить пример пересечения цитаты', 'Load quote-crossing sample') }}</button>
          <button @click="selectListCrossQuote('into')">{{ t('Выделить снаружи внутрь цитаты', 'Select outside into quote') }}</button>
          <button @click="selectListCrossQuote('out')">{{ t('Выделить из цитаты наружу', 'Select quote into outside') }}</button>
          <button @click="selectListCrossQuote('whole')">{{ t('Выделить через целую цитату', 'Select across whole quote') }}</button>
          <p class="lab-hint">{{ t('Загрузка заменяет документ. Выбери направление, затем «Заменить несколькими блоками», «Вставить заголовок» или «Вставить цитату». Все входящие обёртки остаются отдельными телами пункта. Невыделенный край исходной цитаты остаётся в той же цитате; полностью выделенная цитата удаляется. При входе в цитату курсор ставится в новый пустой абзац перед её остатком, при выходе — в начало отдельного внешнего остатка. Этот пример показывает одну цитату; несколько цитат поддержаны в том же пункте и в допустимом диапазоне соседних пунктов одного списка. Нативные операции не расширены; результаты проверок — в дорожной карте.', 'Loading replaces the document. Choose a direction, then Replace with multiple blocks, Insert heading or Insert quote. All incoming wrappers remain separate item bodies. An unselected quote edge stays in the same quote; a fully covered quote is removed. Entering a quote places the caret in a new empty paragraph before its remainder; leaving it places the caret at the separate outside suffix start. This sample shows one quote; several quotes in one item and eligible consecutive items of one list are supported. Native operations are unchanged; see the roadmap for verification results.') }}</p>
          <button @click="loadListMultiQuoteSample">{{ t('Загрузить пример нескольких цитат', 'Load multiple-quote sample') }}</button>
          <button @click="selectListMultiQuote('between')">{{ t('Выделить между цитатами', 'Select between quotes') }}</button>
          <button @click="selectListMultiQuote('into')">{{ t('Выделить снаружи до последней цитаты', 'Select outside into last quote') }}</button>
          <button @click="selectListMultiQuote('out')">{{ t('Выделить из первой цитаты наружу', 'Select first quote into outside') }}</button>
          <button @click="selectListMultiQuote('whole')">{{ t('Выделить через все цитаты', 'Select across all quotes') }}</button>
          <p class="lab-hint">{{ t('Загрузка заменяет документ. Выделение проходит через три обычные цитаты одного пункта. Вставь несколько блоков, заголовок или цитату прежними кнопками: невыделенные цитатные края сохранят свои обёртки, полностью покрытые цитаты и промежуточные тела удалятся. Входящие блоки останутся на уровне пункта. Если справа остаток цитаты, курсор будет в новом обычном абзаце перед ним; иначе — в начале внешнего остатка. Проверяется каждая затронутая цитата, в том числе удаляемая целиком: исходные изображения, семантические блочные корни и вложенные структуры блокируют всю операцию. Для соседних пунктов того же списка доступен отдельный пример ниже; переходы между уровнями и внутрь веток не расширены. Результаты проверок и замеров — в дорожной карте.', 'Loading replaces the document. The selection crosses three ordinary quotes in one item. Use the existing buttons to insert multiple blocks, a heading or a quote: unselected quoted edges retain their wrappers, while fully covered quotes and intervening bodies are removed. Incoming blocks remain at item level. A quoted right remainder gets a new ordinary caret paragraph before it; otherwise the caret starts in the outside suffix. Every affected quote is validated, including fully removed quotes: original images, semantic block roots and nested structures block the complete operation. A separate sample below covers consecutive items of one list; cross-level and into-branch ranges are not extended. See the roadmap for verification and measurement results.') }}</p>
          <button @click="loadListSiblingQuoteSample">{{ t('Загрузить цитаты в соседних пунктах', 'Load sibling-item quote sample') }}</button>
          <button @click="selectListSiblingQuote('between')">{{ t('Выделить цитаты соседних пунктов', 'Select quotes across sibling items') }}</button>
          <button @click="selectListSiblingQuote('into')">{{ t('Выделить до цитаты последнего пункта', 'Select into last item quote') }}</button>
          <button @click="selectListSiblingQuote('out')">{{ t('Выделить из цитаты до внешнего остатка', 'Select from quote into outside suffix') }}</button>
          <button @click="selectListSiblingQuote('whole')">{{ t('Выделить через цитаты всех пунктов', 'Select across all item quotes') }}</button>
          <p class="lab-hint">{{ t('Загрузка заменяет документ. Выделение проходит по последовательным пунктам одного списка. Вставь несколько блоков, заголовок или цитату прежними кнопками. Сохраняется первый пункт и его начало; остаток последнего пункта, следующие тела и его вложенная ветка переходят в первый фактическими узлами. Остальные выбранные пункты и полностью покрытые цитаты удаляются. Входящие обёртки остаются отдельными блоками. Перед правым цитатным остатком — новый абзац с курсором, перед внешним — курсор в начале его тела. Каждая затронутая цитата проверяется целиком. Хвостовые ветки всех выбранных пунктов сохраняются после результирующих тел в порядке исходных пунктов; разные списки, уровни и концы внутри веток остаются барьерами. Результаты проверок и замеров — в дорожной карте.', 'Loading replaces the document. The selection spans consecutive items of one list. Use the existing buttons to insert multiple blocks, a heading or a quote. The first item and its prefix remain; the last item’s suffix, following bodies and trailing branch move into the first as actual nodes. Other selected items and fully covered quotes are removed. Incoming wrappers remain separate blocks. A quoted right remainder gets a new caret paragraph before it; an outside suffix receives the caret at its body start. Every affected quote is fully validated. Trailing branches from all selected items are retained after the resulting bodies in source-item order; different lists, levels and endpoints inside branches remain barriers. See the roadmap for verification and measurement results.') }}</p>
          <button @click="loadListQuoteBranchesSample">{{ t('Загрузить пример сохранения веток', 'Load quote-branch preservation sample') }}</button>
          <button @click="selectListQuoteBranches('between')">{{ t('Выделить цитаты с ветками', 'Select quotes with branches') }}</button>
          <button @click="selectListQuoteBranches('into')">{{ t('Выделить до цитаты с ветками', 'Select into quote with branches') }}</button>
          <button @click="selectListQuoteBranches('out')">{{ t('Выделить из цитаты с ветками', 'Select from quote with branches') }}</button>
          <button @click="selectListQuoteBranches('whole')">{{ t('Выделить все тела с ветками', 'Select all bodies with branches') }}</button>
          <p class="lab-hint">{{ t('Загрузка заменяет документ. Выбери направление и используй прежние кнопки вставки. Хвостовые списки первого, среднего и последнего пунктов сохраняются фактическими поддеревьями. Все они переходят после всей последовательности результирующих тел первого пункта: сначала ветки первого, затем среднего и последнего, в исходном порядке внутри каждого пункта. Это перенос после тел, а не сохранение прежнего сквозного порядка «тело — ветка — тело». Ветки не склеиваются и не уплощаются; их типы, атрибуты, вложенность и пустые пункты остаются. Путь действует только для блочной вставки с затронутой цитатой; обычная замена без цитат и нативный ввод сохраняют прежние барьеры. Концы внутри веток и разные уровни не поддержаны. Для блоков после веток есть отдельный пример ниже. Результаты проверок и замеров — в дорожной карте.', 'Loading replaces the document. Choose a direction and use the existing insertion buttons. Trailing lists from the first, middle and last items remain actual subtrees. All move after the complete resulting body sequence in the first item: first-item branches, then middle-item branches, then last-item branches, retaining order within each item. This relocates branches after bodies; it does not preserve the former global body–branch–body traversal order. Branches are neither coalesced nor flattened; kinds, attributes, nesting and empty items remain. This path requires structural block insertion with an affected quote; ordinary replacement without quotes and native input keep their previous barriers. Endpoints inside branches and different levels remain unsupported. Blocks after branches use the separate sample below. See the roadmap for verification and measurement results.') }}</p>
          <button @click="loadListInterleavedQuoteSample">{{ t('Загрузить блоки после веток', 'Load blocks-after-branches sample') }}</button>
          <button @click="selectListInterleavedQuote('between')">{{ t('Выделить цитаты между ветками', 'Select quotes between branches') }}</button>
          <button @click="selectListInterleavedQuote('into')">{{ t('Выделить до цитаты после ветки', 'Select into quote after branch') }}</button>
          <button @click="selectListInterleavedQuote('out')">{{ t('Выделить из цитаты через ветки', 'Select from quote across branches') }}</button>
          <button @click="selectListInterleavedQuote('whole')">{{ t('Выделить все тела между ветками', 'Select all bodies between branches') }}</button>
          <p class="lab-hint">{{ t('Загрузка заменяет документ. Этот пример содержит обычные блоки после вложенных списков. Выбери направление и используй прежние кнопки вставки. Начальная последовательность до выделения остаётся на месте. Входящие блоки идут сразу после левого края, затем — сохранённые ветки из выбранного интервала в исходном порядке, затем правый остаток. Перед цитатным остатком создаётся обычный абзац с курсором, уже после этих веток. Последующие блоки и списки сохраняют прежнее чередование. Это отдельный путь: пример только с хвостовыми ветками выше по-прежнему переносит их после всех тел. Нужна затронутая цитата и разные крайние тела; нативный ввод, строчная вставка, концы внутри веток и неподдержанные структуры не расширены. Результаты проверок — в дорожной карте.', 'Loading replaces the document. This sample has ordinary blocks after nested lists. Choose a direction and use the existing insertion buttons. The sequence before selection stays in place. Incoming blocks follow the left edge, then preserved branches from the selected interval in source order, then the right remainder. A quoted remainder gets an ordinary caret paragraph after these branches. Following bodies and lists retain their original alternation. This is a separate path: the trailing-only sample above still moves branches after all bodies. An affected quote and distinct endpoint bodies are required; native input, inline insertion, into-branch endpoints and unsupported structures are not extended. See the roadmap for verification results.') }}</p>
          <button @click="loadListInterleavedInsideQuoteSample">{{ t('Загрузить цитату среди блоков и веток', 'Load quote inside interleaved item') }}</button>
          <button @click="selectListInterleavedInsideQuote(false)">{{ t('Курсор в цитате среди веток', 'Caret in quote between branches') }}</button>
          <button @click="selectListInterleavedInsideQuote(true)">{{ t('Выделить блоки цитаты среди веток', 'Select quote bodies between branches') }}</button>
          <p class="lab-hint">{{ t('Загрузка заменяет документ. Поставь курсор либо выдели дочерние блоки цитаты и используй «Заменить несколькими блоками» или «Вставить заголовок». Вставка остаётся внутри фактической цитаты: внешний порядок «тело — список — цитата — список — тело» и все ветки сохраняются на месте. Несколько входящих блоков соединяются с началом и остатком внутри цитаты; одиночный заголовок остаётся отдельным между ними. Новая вложенная цитата отклоняется. Это отдельное расширение внутренней вставки; нативный ввод, строчная вставка и обычные тела вне цитаты не расширены. Результаты проверок и ограничения — в дорожной карте.', 'Loading replaces the document. Place the caret or select child quote bodies, then use Replace with multiple blocks or Insert heading. Insertion stays inside the actual quote: the outer body–list–quote–list–body order and every branch remain in place. Multiple incoming blocks compose with the quote prefix and suffix; a single heading remains separate between them. A new nested quote is refused. This extends inner insertion only; native input, inline insertion and ordinary bodies outside the quote are unchanged. See the roadmap for verification results and limits.') }}</p>
          <p class="lab-hint">{{ t('Одиночный обычный заголовок сохраняет свой тег и атрибуты отдельным телом пункта. Выдели текст или поставь курсор: перед заголовком останется исходное начало, после него — отдельное тело с остатком. Курсор будет в начале остатка; пустые края сохраняют редактируемый перенос. Соседние тела и ветки остаются на месте. Результаты проверок — в дорожной карте.', 'A single ordinary heading keeps its tag and attributes as a separate item body. Select text or place the caret: the source prefix stays before the heading and a separate body holds the suffix after it. The caret starts before that suffix; empty edges retain an editable placeholder. Neighboring bodies and branches remain. See the roadmap for verification results.') }}</p>
          <p class="lab-hint">{{ t('Выдели текст или выбери позицию и поставь курсор кнопкой. «Заменить несколькими блоками» вставляет два и более обычных абзаца/заголовка и при пустом выделении: начало исходного блока соединяется с первым входящим, остаток — с последним. Невыделенные тела и ветки сохраняются. Другие одиночные структурные корни сохраняют прежние пути; семантические и смешанные фрагменты не входят в новый путь. Результаты проверок — в дорожной карте.', 'Select text or choose a position and place the caret with the button. “Replace with multiple blocks” also inserts two or more ordinary paragraphs/headings at a collapsed caret: the source prefix joins the first incoming body and its suffix joins the last. Unselected bodies and branches remain. Other single structural roots retain their previous paths; semantic and mixed fragments are outside the new path. See the roadmap for verification results.') }}</p>
          <button @click="selectListItems(true)">{{ t('Курсор перед Delete', 'Caret before Delete') }}</button>
          <p class="lab-hint">{{ t('«Курсор перед Delete» ставит курсор в конец первого тела: в режиме «Несколько блоков» Delete соединяет два блока внутри пункта. Backspace в начале следующего блока тоже соединяет их. Выделения между списком и абзацем или разными контейнерами, семантические тела и произвольная структурная вставка — отдельные этапы.', '“Caret before Delete” places the caret at the first body’s end: in Multiple blocks mode, Delete joins two bodies inside the item. Backspace at the next body’s start also joins them. Selections between a list and a paragraph or different containers, semantic bodies and arbitrary structural insertion are separate milestones.') }}</p>
          <label>{{ t('Сценарий Backspace', 'Backspace scenario') }}<select v-model="listBackspaceScenario" :aria-label="t('Сценарий Backspace', 'Backspace scenario')"><option value="join">{{ t('Соединить с предыдущим пунктом', 'Join the previous item') }}</option><option value="root">{{ t('Первый корневой пункт', 'First root item') }}</option><option value="nested">{{ t('Первый вложенный пункт', 'First nested item') }}</option><option value="nested-followed">{{ t('Вложенная ветка перед другими', 'Nested branch before others') }}</option></select></label>
          <button @click="loadListBackspaceSample">{{ t('Загрузить пример Backspace', 'Load Backspace sample') }}</button>
          <button @click="selectListBackspace">{{ t('Курсор перед Backspace', 'Caret before Backspace') }}</button>
          <p class="lab-hint">{{ t('Загрузка заменяет документ. Затем поставь курсор кнопкой и нажми настоящий Backspace: первый блок соединится с последним блоком предыдущего пункта, первый корневой пункт выйдет из списка, а первый вложенный поднимется на уровень. Последующие тела и ветки сохраняются; Undo возвращает исходный документ. Результаты проверок — в дорожной карте.', 'Loading replaces the document. Then use the caret button and press actual Backspace: the first body joins the previous item’s final body, the first root item exits the list, or the first nested item lifts one level. Later bodies and branches remain; Undo restores the original document. See the roadmap for verification results.') }}</p>
          <p v-if="listBackspaceScenario === 'nested-followed'" class="lab-hint">{{ t('В этом примере ранняя ветка остаётся у родителя. Под поднятым пунктом идут его собственная ветка, оставшиеся пункты исходного списка, затем две поздние ветки родителя в прежнем порядке. Типы списков и выравнивание сохраняются; ветки не склеиваются.', 'In this sample the earlier branch stays with the owner. The lifted item retains its own branch, then the source list’s remaining items, then the owner’s two later branches in their original order. List kinds and alignment remain; branches are not coalesced.') }}</p>
        </fieldset></details>
        <details class="lab-contextual-table"><summary>{{ t('Контекстная панель таблиц', 'Contextual table toolbar') }}</summary><fieldset :disabled="!ready || readOnly">
          <button @click="loadContextualTableSample">{{ t('Загрузить пример контекстной таблицы', 'Load contextual table sample') }}</button>
          <button @click="selectContextualTable(true)">{{ t('Выделить область 2 × 2', 'Select 2 × 2 region') }}</button>
          <button @click="selectContextualTable()">{{ t('Вернуть курсор в первую ячейку', 'Return caret to first cell') }}</button>
          <p class="lab-hint">{{ t('Alpha занимает две строки. Область 2 × 2 включает три реальные ячейки; объединение сохраняет Alpha, Beta и Gamma и их оформление. Разделение оставляет содержимое в исходной ячейке. Одна команда — одна отмена. Строки и столбцы ограничены 100; недоступные объединение/разделение отключены. Alt+F10 переводит фокус в панель, Escape возвращает курсор. Выделение текста внутри ячейки открывает текстовую панель; табличная доступна через Alt+F10. Ссылки и изображения используют свои панели.', 'Alpha spans two rows. The 2 × 2 region contains three real cells; merging preserves Alpha, Beta, Gamma and their formatting. Splitting keeps content in the origin cell. One command is one Undo. Rows and columns are bounded at 100; unavailable merge/split are disabled. Alt+F10 enters the toolbar; Escape returns the caret. Text selected inside one cell uses text formatting; Alt+F10 explicitly opens table actions. Links and images use their own panels.') }}</p>
          <p class="lab-hint">{{ t('Переключатель создаёт и уничтожает только необязательный UI, сохраняя документ и историю. Пресеты его не подключают. Вложенные/неполные таблицы и таблицы с семантическими узлами не поддерживаются этим контекстным модулем. Свойства доступны в отдельной форме раздела «Таблицы»; caption и resize не входят в этот контекстный модуль.', 'The switch creates/destroys only optional UI, preserving document and history. Presets do not install it. Nested/incomplete tables and tables containing semantic nodes are unsupported in this contextual module. Properties are provided by a separate form in the Tables section; captions and resize are outside this contextual module.') }}</p>
        </fieldset></details>
        <details class="lab-contextual-image"><summary>{{ t('Контекстные свойства изображения', 'Contextual image properties') }}</summary><fieldset :disabled="!ready">
          <button :disabled="readOnly" @click="loadContextualImageSample">{{ t('Загрузить пример свойств изображения', 'Load image properties sample') }}</button>
          <button @click="selectContextualImageSample">{{ t('Выделить изображение примера', 'Select sample image') }}</button>
          <p class="lab-hint">{{ t('Выдели само изображение кликом либо кнопкой, затем Alt+F10 переведёт фокус в панель. «Свойства изображения» открывают форму только редактирования: Enter обновляет, кнопок вставки и загрузки нет. Изменения и удаление поддерживают Undo; удаление простой figure удаляет и её подпись.', 'Select the image itself by clicking or using the button, then Alt+F10 enters the panel. Image properties opens an edit-only form: Enter updates, with no insertion or upload controls. Metadata and removal support Undo; removing a simple figure removes its caption too.') }}</p>
          <p class="lab-hint">{{ t('Это отдельный необязательный UI, включённый в полной демке. Цель — точный нативный Range узла IMG, без превью-копии изображения. Курсор в подписи, выделение всей figure и сложные figure не поддержаны; это не resize/crop. Read-only может оставлять просмотр и блокирует изменение. Кнопка выбора не меняет документ.', 'This separate optional UI is enabled in the full demo. It uses the exact native IMG node Range without a second preview image. Caption carets, whole-figure ranges and complex figures are excluded; this is not resize/crop. Read-only may retain summary while blocking edits. The selection button does not change the document.') }}</p>
        </fieldset></details>
        <details class="lab-contextual-link"><summary>{{ t('Действия со ссылкой', 'Link actions') }}</summary><fieldset :disabled="!ready || readOnly">
          <button @click="loadContextualLinkSample">{{ t('Загрузить пример ссылки', 'Load link sample') }}</button>
          <button @click="selectContextualLinkSample('forward')">{{ t('Выделить часть ссылки', 'Select link text') }}</button>
          <button @click="selectContextualLinkSample('backward')">{{ t('Выделить ссылку назад', 'Select link text backward') }}</button>
          <button @click="selectContextualLinkSample('mixed')">{{ t('Выделить текст через границу ссылки', 'Select across the link boundary') }}</button>
          <p class="lab-hint">{{ t('Курсор или выделение текста целиком внутри одной ссылки открывает адрес и действия «Открыть», «Изменить», «Удалить». Изменение URL и удаление относятся ко всей ссылке, даже если выделена только её часть; текст и оформление сохраняются. Направление выделения сохраняется при возврате из действий. Alt+F10 переводит фокус в панель, Escape возвращает сохранённый диапазон. Каждое изменение — обычный шаг Undo.', 'A caret or text range wholly inside one link shows its address and Open/Edit/Remove actions. URL edits and unlinking apply to the whole link even when only part is selected; text and rich content survive. Returning from actions preserves the selection direction. Alt+F10 enters the panel and Escape returns the saved range. Each edit is an ordinary Undo step.') }}</p>
          <p class="lab-hint">{{ t('Это отдельный необязательный UI, включённый в полной демке. Внутри одной ссылки он имеет приоритет над текстовой панелью, включая Alt+F10. Смешанное выделение, несколько ссылок и ссылки только с изображением не подходят. Для создания ссылки на обычном тексте используй стандартную форму. Адрес проверяется перед открытием; read-only оставляет просмотр/открытие и блокирует изменение.', 'This separate optional UI is enabled in the full demo. Inside one link it takes priority over the text toolbar, including Alt+F10. Mixed selections, multiple links and image-only links are excluded. Use the standard form to create a link on plain text. The address is checked before opening; read-only allows preview/Open while blocking edits.') }}</p>
        </fieldset></details>
        <details class="lab-contextual"><summary>{{ t('Контекстная панель', 'Contextual toolbar') }}</summary><fieldset :disabled="!ready || readOnly">
          <button @click="loadContextualSample">{{ t('Загрузить пример выделения', 'Load selection sample') }}</button>
          <p class="lab-hint">{{ t('Пример выбирает текст обратным диапазоном. Панель предназначена для непустого видимого выделения в редакторе; автоматический показ не забирает фокус. Alt+F10 переводит фокус в панель, стрелки/Home/End перемещают его между кнопками, Escape закрывает панель и возвращает выделение редактору. Одна команда — обычный шаг Undo.', 'The sample creates a backward range. The toolbar requires a nonempty visible editor selection; automatic showing does not take focus. Alt+F10 enters the toolbar, arrows/Home/End navigate its controls, and Escape dismisses it and restores the editor selection. An action adds its ordinary Undo step.') }}</p>
          <p class="lab-hint">{{ t('Переключатель выше создаёт и уничтожает только этот необязательный UI, сохраняя редактор и историю. В этой полной демке он включён по умолчанию; пресеты его не подключают. Изображения, таблицы и курсор без выделения не получают контекстные меню в этом срезе.', 'The switch above creates/destroys only this optional UI, preserving the editor and history. It is enabled by default in this full demo; presets do not install it. This slice adds no contextual image/table or collapsed-caret menus.') }}</p>
        </fieldset></details>
        <details class="lab-text-direction"><summary>{{ t('Направление текста', 'Text direction') }}</summary><fieldset :disabled="!ready || readOnly">
          <button @click="loadTextDirectionSample">{{ t('Загрузить многоязычный пример', 'Load multilingual sample') }}</button>
          <div class="lab-button-grid"><button @click="applyTextDirection('ltr')">{{ t('Слева направо (LTR)', 'Left to right (LTR)') }}</button><button @click="applyTextDirection('rtl')">{{ t('Справа налево (RTL)', 'Right to left (RTL)') }}</button><button @click="applyTextDirection(false)">{{ t('Наследовать направление', 'Inherit direction') }}</button></div>
          <p role="status" aria-live="polite">{{ t('Явное направление', 'Explicit direction') }}: {{ directionState.mixed ? t('Разное', 'Mixed') : directionState.direction || t('Наследовать', 'Inherit') }}.</p>
          <p class="lab-hint">{{ t('Загрузка выбирает части двух соседних абзацев обратным диапазоном. LTR/RTL меняет только явный dir их контейнеров: арабский, иврит и Latin остаются в исходном порядке, выравнивание не меняется. Сброс удаляет атрибут и наследует окружение, а не принудительно включает LTR. Состояние показывает сохранённые атрибуты и смешанность, не вычисленный CSS или распознанный язык.', 'Loading selects parts of two adjacent paragraphs backward. LTR/RTL changes only their containers’ explicit dir: Arabic, Hebrew and Latin remain in their original text order, and alignment stays unchanged. Reset removes the attribute and inherits surrounding direction rather than forcing LTR. State reports stored attributes and mixed values, not computed CSS or detected language.') }}</p>
          <p class="lab-hint">{{ t('Поддержан ближайший обычный блок или соседние блоки с одним родителем и одной границей ячейки. Диапазон через внутренние абзацы разных LI не поддержан. Это нативный bidi браузера, не переупорядочивание текста, автоопределение, dir=auto или inline bdi/bdo. Плагин подключён явно только в полной демке, не в пресетах и не как встроенная кнопка панели.', 'The closest ordinary block or sibling blocks sharing one parent and cell boundary are supported. Ranges through inner paragraphs of different LI are unsupported. This uses browser-native bidi, not text reordering, auto-detection, dir=auto or inline bdi/bdo. The plugin is explicitly installed only in the full demo, outside presets and built-in toolbar controls.') }}</p>
        </fieldset></details>
        <details class="lab-list-properties"><summary>{{ t('Свойства списка', 'List properties') }}</summary><fieldset :disabled="!ready || readOnly">
          <button @click="loadListPropertySample">{{ t('Загрузить свойства списка', 'Load list properties sample') }}</button>
          <label>{{ t('Начальное число OL', 'OL starting number') }}<input v-model.number="listStartChoice" type="number" min="-2147483648" max="2147483647" step="1" :aria-label="t('Начальное число списка', 'List starting number')"></label>
          <button @click="applyListStart">{{ t('Применить начало', 'Apply start') }}</button>
          <label><input v-model="listReversedChoice" type="checkbox" :aria-label="t('Обратная нумерация', 'Reversed numbering')">{{ t('Обратная нумерация OL', 'Reversed OL numbering') }}</label>
          <button @click="applyListReversed">{{ t('Применить направление нумерации', 'Apply numbering direction') }}</button>
          <label>{{ t('Маркер', 'Marker') }}<select v-model="listMarkerChoice" :aria-label="t('Маркер списка', 'List marker')"><optgroup label="OL"><option v-for="marker in orderedMarkers" :key="marker" :value="marker">{{ marker }}</option></optgroup><optgroup label="UL"><option v-for="marker in bulletMarkers" :key="marker" :value="marker">{{ marker }}</option></optgroup></select></label>
          <div class="lab-button-grid"><button @click="applyListMarker">{{ t('Применить маркер', 'Apply marker') }}</button><button @click="resetListProperties">{{ t('Сбросить свойства', 'Reset properties') }}</button></div>
          <p role="status" aria-live="polite">{{ t('Тип', 'Kind') }}: {{ listPropertyState.kind || '—' }}; start: {{ listPropertyState.start === false ? t('Не задан', 'Not set') : listPropertyState.start }}; reversed: {{ listPropertyState.reversed }}; marker: {{ listPropertyState.marker || t('Не задан', 'Not set') }}.</p>
          <p class="lab-hint">{{ t('Загрузка выбирает части двух пунктов обратным диапазоном. Свойства меняют весь текущий контейнер списка, не только выбранные пункты. Курсор во вложенном UL нацелит его отдельно: выбирай маркер того же типа. Начало и reversed относятся только к OL; сброс снимает явные свойства одной транзакцией. Значения полей — черновики, состояние ниже — сохранённые атрибуты, не вычисленная нумерация.', 'Loading sets a backward range across parts of two items. Properties affect the whole current list container, not only selected items. A caret in nested UL targets it separately: choose a marker of the matching kind. Start and reversed apply only to OL; reset removes explicit properties in one transaction. Fields are drafts; state reports stored attributes, not computed numbering.') }}</p>
          <p class="lab-hint">{{ t('В примере reversed="false" означает true, потому что HTML учитывает наличие атрибута. Отсутствующий start — «Не задан», а не вычисленная единица. Структурные копии сохраняют свойства, но числовые смещения при разделении и продолжение нумерации между списками не пересчитываются. Плагин подключён явно только в полной демке.', 'In the sample reversed="false" means true because HTML tests attribute presence. Missing start is Not set, not a computed one. Structural clones retain properties, but splitting does not recalculate numeric offsets or continue counters across lists. The plugin is explicitly installed only in the full demo.') }}</p>
        </fieldset></details>
        <details class="lab-fonts"><summary>{{ t('Шрифты и размер текста', 'Font family and size') }}</summary><fieldset :disabled="!ready || readOnly">
          <button @click="loadFontSample">{{ t('Загрузить пример шрифтов', 'Load font sample') }}</button>
          <label>{{ t('Семейство', 'Family') }}<select v-model="fontFamilyChoice" :aria-label="t('Семейство шрифта', 'Font family')"><option v-for="option in fontFamilies" :key="option.id" :value="option.id">{{ t(option.ru, option.en) }}</option></select></label>
          <div class="lab-button-grid"><button @click="setFontFamily()">{{ t('Применить семейство', 'Apply family') }}</button><button @click="setFontFamily(true)">{{ t('Сбросить семейство', 'Reset family') }}</button></div>
          <label>{{ t('Размер', 'Size') }}<select v-model.number="fontSizeChoice" :aria-label="t('Размер шрифта', 'Font size')"><option v-for="size in fontSizes" :key="size" :value="size">{{ size }} px</option></select></label>
          <div class="lab-button-grid"><button @click="setFontSize()">{{ t('Применить размер', 'Apply size') }}</button><button @click="setFontSize(true)">{{ t('Сбросить размер', 'Reset size') }}</button></div>
          <p role="status" aria-live="polite">{{ t('Явное семейство', 'Explicit family') }}: {{ fontState.familyMixed ? t('Разное', 'Mixed') : fontState.family || t('По умолчанию', 'Default') }}; {{ t('явный размер', 'explicit size') }}: {{ fontState.sizeMixed ? t('Разное', 'Mixed') : fontState.size || t('По умолчанию', 'Default') }}.</p>
          <p class="lab-hint">{{ t('Загрузка заменяет документ и выбирает полужирное слово. Выбери семейство/размер и примени отдельно; сброс снимает только одно свойство. В позиции курсора стиль относится к следующему вводу. Состояние показывает фактический CSS, а не ID варианта или вычисленный стиль темы; выделение разных значений показывает «Разное».', 'Loading replaces the document and selects the bold word. Choose a family/size and apply each separately; reset removes only that property. At a caret, styling applies to subsequent typing. State shows actual CSS rather than a choice ID or computed theme style; selecting different values shows Mixed.') }}</p>
          <p class="lab-hint">{{ t('Плагин подключён явно только в полной демке, не в пресетах. Он не загружает шрифты; браузер может запросить файлы, уже объявленные CSS приложения. Заголовок примера сохраняет импортированный размер 1.25em, хотя команды здесь выбирают настроенные px.', 'The plugin is explicitly installed only in the full demo, not preset defaults. It loads no fonts; the browser may request assets already declared by application CSS. The sample heading retains imported 1.25em even though these commands choose configured px sizes.') }}</p>
        </fieldset></details>
        <details class="lab-horizontal-rule"><summary>{{ t('Разделитель', 'Horizontal rule') }}</summary><fieldset :disabled="!ready || readOnly">
          <button @click="loadHorizontalRuleSample">{{ t('Загрузить пример разделителя', 'Load horizontal rule sample') }}</button>
          <p class="lab-hint">{{ t('Загрузка заменяет документ и сбрасывает историю, затем ставит курсор внутри полужирного слова. Нажми «Разделитель» на панели: исходный блок разделится вокруг обычного HR, курсор останется в начале редактируемого остатка. Один Undo возвращает исходный блок и выделение.', 'Loading replaces the document, resets history and places the caret inside the bold word. Click Horizontal rule in the toolbar: the source block splits around an ordinary HR, leaving the caret at the editable suffix start. One Undo restores the original block and selection.') }}</p>
          <p class="lab-hint">{{ t('Поддержаны курсор и выделение в одном корневом абзаце или заголовке. Заголовок сохраняется с обеих сторон, включая пустые края; для обычного текста выбери «Абзац» в панели. Списки, цитаты, таблицы и исходные блоки с изображением или семантическим потомком не входят в этот профиль, даже если такой потомок вне выделения.', 'A caret or selection in one root paragraph or heading is supported. A heading stays a heading on both sides, including empty edges; choose Paragraph in the toolbar for ordinary text. Lists, quotes, tables and source blocks containing an image or semantic descendant are outside this profile, even when that descendant is outside the selection.') }}</p>
        </fieldset></details>
        <details class="lab-checklists"><summary>{{ t('Чек-листы', 'Checklists') }}</summary><fieldset :disabled="!ready || readOnly">
          <button @click="loadChecklistSample">{{ t('Загрузить чек-лист', 'Load checklist') }}</button>
          <div class="lab-button-grid">
            <button :disabled="checklistState.disabled" @click="runChecklist('insert')">{{ t('Сделать задачей', 'Make a task') }}</button>
            <button :disabled="checklistState.disabled || !checklistState.active" :aria-pressed="checklistState.active ? checklistState.checked : undefined" @click="runChecklist('toggle')">{{ t('Переключить выполнение', 'Toggle completion') }}</button>
            <button :disabled="checklistState.disabled || !checklistState.active" @click="runChecklist('check')">{{ t('Отметить выполненной', 'Mark complete') }}</button>
            <button :disabled="checklistState.disabled || !checklistState.active" @click="runChecklist('uncheck')">{{ t('Снять выполнение', 'Mark incomplete') }}</button>
            <button :disabled="checklistState.disabled || !checklistState.active" @click="runChecklist('remove')">{{ t('Сделать обычным пунктом', 'Make an ordinary item') }}</button>
          </div>
          <p role="status" aria-live="polite">{{ checklistStatus }}</p>
          <p class="lab-hint">{{ t('Загрузка заменяет документ. Поставь курсор в текст одного пункта и используй внешние кнопки; обычный абзац превращается в маркированный пункт-задачу. Enter сохраняет состояние исходной задачи и создаёт новую невыполненную; Shift+Enter оставляет состояние прежним. Маркер — оформление CSS, а не нативный checkbox: клик по полю маркера и отдельный shortcut не добавлены. Плагин подключён явно только в полной демке; без него метаданные задачи теряются. Команды участвуют в общей истории и соблюдают read-only.', 'Loading replaces the document. Place the caret in one item and use the external buttons; an ordinary paragraph becomes a bullet task item. Enter preserves the original task state and creates a new incomplete item; Shift+Enter keeps the state. The marker is CSS decoration, not a native checkbox: gutter clicks and a custom shortcut are not added. The plugin is explicitly installed in the full demo; without it task metadata is lost. Commands share editor history and respect read-only.') }}</p>
        </fieldset></details>
        <details class="lab-suggestions"><summary>{{ t('Упоминания и slash-шаблоны', 'Mentions and slash snippets') }}</summary><fieldset :disabled="!ready">
          <div class="lab-button-grid"><button :disabled="readOnly" @click="startSuggestions('mentions')">{{ t('Новый пример @an', 'New @an example') }}</button><button :disabled="readOnly" @click="startSuggestions('slash')">{{ t('Новый пример /sig', 'New /sig example') }}</button></div>
          <div class="lab-button-grid"><button :disabled="readOnly" @click="startStructuralSlash('h2')">{{ t('Новый пример /h2', 'New /h2 example') }}</button><button :disabled="readOnly" @click="startStructuralSlash('table')">{{ t('Новый пример /table', 'New /table example') }}</button></div>
          <p class="lab-hint">{{ t('Кнопки начала заменяют документ. Также можно вводить @ в тексте и / в начале обычного абзаца.', 'Starting an example replaces the document. You can also type @ in text or / at the beginning of a plain paragraph.') }}</p>
          <label>{{ t('Ответ провайдера', 'Provider response') }}<select v-model="providerMode" :aria-label="t('Ответ провайдера', 'Provider response')"><option value="normal">{{ t('Варианты', 'Choices') }}</option><option value="empty">{{ t('Пустой ответ', 'Empty response') }}</option><option value="error">{{ t('Ошибка', 'Error') }}</option></select></label>
          <label>{{ t('Задержка, мс', 'Delay, ms') }}<input v-model.number="providerDelay" type="number" min="0" max="1500"></label>
          <div class="lab-button-grid"><button :disabled="readOnly" @click="openSuggestions">{{ t('Открыть подсказки', 'Open suggestions') }}</button><button @click="closeSuggestions">{{ t('Закрыть подсказки', 'Close suggestions') }}</button></div>
          <p class="lab-suggestions-status" role="status" aria-live="polite">{{ suggestionStatus }}</p>
          <p class="lab-hint">{{ t('ArrowUp/Down — выбор, Enter — вставка, Escape — закрыть. Tab передаётся редактору. В демке упоминание хранит ID в редактируемом span; slash вставляет текст или выполняет структурную команду одним Undo. Введи / для всех вариантов: заголовки, списки, цитата, код и таблица. Данные локальные, сеть не используется. Это редактируемые ссылки с ID, без атомарного поведения.', 'ArrowUp/Down navigate, Enter inserts, Escape dismisses. Tab falls through to the editor. Demo mentions store IDs in editable spans; slash inserts text or runs a structural command with one Undo. Type / for all choices: headings, lists, quote, code and table. Data stays local, with no network. These are editable ID references, without atomic behavior.') }}</p>
        </fieldset></details>
        <details class="lab-autolink"><summary>{{ t('Автоматические ссылки', 'Automatic links') }}</summary><fieldset :disabled="!ready || readOnly">
          <button @click="startAutolink(true)">{{ t('Подготовить URL для Enter', 'Prepare URL for Enter') }}</button>
          <button @click="startAutolink(false)">{{ t('Подготовить plain-text вставку', 'Prepare plain-text paste') }}</button>
          <p class="lab-hint">{{ t('Нажми Enter после подготовленного URL или вставь один URL как обычный текст без HTML, пробелов и переносов. Space тоже работает. Первый Undo убирает ссылку, второй — исходный Enter или вставку. Дальнейший текст идёт вне ссылки. Shift+Enter, HTML и замена выделения не преобразуются. Превью и сетевых запросов нет.', 'Press Enter after the prepared URL or paste one URL as plain text without HTML, whitespace or line breaks. Space also works. First Undo removes the link; second removes Enter or paste. Further typing stays outside the link. Shift+Enter, HTML and selected replacement are not converted. No previews or network requests.') }}</p>
        </fieldset></details>
        <details class="lab-persistent-mentions"><summary>{{ t('Сохраняемые упоминания с ID', 'Persistent mentions with IDs') }}</summary><fieldset :disabled="!ready">
          <div class="lab-button-grid">
            <button :disabled="readOnly" @click="startSuggestions('mentions')">{{ t('Выбрать упоминание @an', 'Choose an @an mention') }}</button>
            <button :disabled="readOnly" @click="loadMentionReferenceSample">{{ t('Загрузить сохранённое упоминание', 'Load a saved mention') }}</button>
          </div>
          <div class="lab-button-grid">
            <button @click="inspectMentionReferences">{{ t('Показать ID упоминаний', 'Show mention IDs') }}</button>
            <button :disabled="readOnly" @click="roundTripMentionReferences('html')">{{ t('Проверить HTML round-trip', 'Check HTML round-trip') }}</button>
            <button :disabled="readOnly" @click="roundTripMentionReferences('json')">{{ t('Проверить JSON round-trip', 'Check JSON round-trip') }}</button>
          </div>
          <pre v-if="mentionReferences" data-mention-references class="lab-code">{{ mentionReferences }}</pre>
          <p class="lab-hint">{{ t('Демка явно включает persistent: true; пресеты по умолчанию оставляют обычный текст. Выбери вариант в меню и нажми «Показать ID». Это снимок { id, text }, доступный и в read-only.', 'The demo explicitly enables persistent: true; presets keep plain text by default. Choose a menu result, then Show mention IDs. This { id, text } snapshot also works read-only.') }}</p>
          <p class="lab-hint">{{ t('Начало примера и загрузка заменяют документ. HTML/JSON round-trip валидирует текущее значение; при неизменном содержимом история сохраняется. Упоминание редактируемое, не атом: изменение подписи сохраняет ID. ID из буфера не подтверждает личность или права и не отправляет уведомления.', 'Starting/loading an example replaces the document. HTML/JSON round-trip validates the current value; unchanged content preserves history. A mention is editable, not atomic: changing its label keeps the ID. Clipboard IDs prove neither identity nor permission and send no notifications.') }}</p>
          <a :href="ru ? '/persistent-mentions' : '/en/persistent-mentions'">{{ t('Хранение ID и границы упоминаний', 'Mention ID storage and boundaries') }}</a>
        </fieldset></details>
        <details class="lab-markdown-codec"><summary>{{ t('Markdown: импорт и экспорт', 'Markdown: import and export') }}</summary><fieldset :disabled="!ready || markdownCodecBusy">
          <label>{{ t('Markdown-исходник', 'Markdown source') }}<textarea :aria-label="t('Markdown-исходник', 'Markdown source')" v-model="markdownSource" class="lab-code" rows="9" spellcheck="false"></textarea></label>
          <div class="lab-inline-actions">
            <button :disabled="readOnly" @click="useMarkdownCodec('replace')">{{ t('Импортировать Markdown', 'Import Markdown') }}</button>
            <button :disabled="readOnly" @click="useMarkdownCodec('insert')">{{ t('Вставить Markdown', 'Insert Markdown') }}</button>
            <button @click="useMarkdownCodec('export')">{{ t('Экспортировать Markdown', 'Export Markdown') }}</button>
          </div>
          <p class="lab-hint">{{ t('Импорт заменяет документ и сбрасывает историю. Вставка использует сохранённое выделение и одну операцию Undo. Экспорт не меняет документ и доступен в read-only. Кодек загружается отдельно по действию, без автоматической обработки буфера.', 'Import replaces the document and clears history. Insert uses the saved selection and one Undo operation. Export does not change the document and works read-only. The codec loads separately on demand, without automatic clipboard conversion.') }}</p>
          <p class="lab-hint">{{ t('Поддерживается ограниченный синтаксис: текст, заголовки, списки, цитаты, код, ссылки, изображения и простые таблицы. HTML остаётся текстом; визуальные стили теряются, объединённые таблицы отклоняются.', 'The bounded syntax includes text, headings, lists, quotes, code, links, images and simple tables. HTML stays literal; visual styles are lost, and merged tables are rejected.') }}</p>
          <a :href="ru ? '/markdown-codec' : '/en/markdown-codec'">{{ t('Синтаксис и ограничения Markdown-кодека', 'Markdown codec syntax and limitations') }}</a>
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
          <div class="lab-search-highlights">
            <label><input v-model="searchHighlightsEnabled" type="checkbox" :aria-label="t('Подсветка всех результатов', 'Highlight all results')" :disabled="!ready" @change="updateSearchHighlights">{{ t('Подсветка всех результатов', 'Highlight all results') }}</label>
            <div class="lab-inline-actions">
              <button :disabled="!ready || readOnly" @click="loadSearchHighlightsSample">{{ t('Загрузить пример подсветки', 'Load highlight sample') }}</button>
              <button :disabled="!ready" @click="findSearchHighlights">{{ t('Подсветить все Morfira', 'Highlight every Morfira') }}</button>
              <button :disabled="!ready" @click="inspectSearchHighlights">{{ t('Обновить сведения о подсветке', 'Refresh highlight details') }}</button>
              <button :disabled="!ready" @click="clearSearchHighlights">{{ t('Очистить подсветку и поиск', 'Clear highlights and search') }}</button>
            </div>
            <p data-search-highlights-state role="status">{{ searchHighlightsSummary }}</p>
            <p class="lab-hint">{{ t('Подсветка использует CSS Highlight API без обёрток в документе. Снимок обновляется по кнопке. Если API недоступен, обычный поиск продолжает работать. Загрузка примера заменяет документ. Поиск и подсветка доступны в read-only.', 'Highlights use CSS Highlight API without document wrappers. Refresh the snapshot explicitly. Ordinary search still works when the API is unavailable. Loading the sample replaces the document. Search and highlights work read-only.') }}</p>
            <a :href="ru ? '/search-highlights' : '/en/search-highlights'">{{ t('Подключение и ограничения подсветки', 'Highlight setup and limitations') }}</a>
          </div>
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
          <label><input v-model="failNextImageUpload" type="checkbox" :disabled="readOnly" :aria-label="t('Ошибка следующей загрузки', 'Fail next upload')">{{ t('Ошибка следующей загрузки', 'Fail next upload') }}</label>
          <p class="lab-hint">{{ t('Выбери PNG/JPEG/GIF/WebP/AVIF: форма покажет имитацию прогресса. Для проверки ошибки включи «Ошибка следующей загрузки» перед выбором файла; затем нажми «Повторить загрузку». Повтор использует исходную позицию, пока документ не изменился. Файл не читается, не отправляется и не сохраняется.', 'Choose PNG/JPEG/GIF/WebP/AVIF to see simulated progress. Enable Fail next upload before choosing a file to demonstrate an error, then use Retry upload. Retry keeps the original position while the document is unchanged. The file is never read, uploaded or stored.') }}</p>
          <p class="lab-hint">{{ t('Выбери картинку и нажми «Изображение слева», «Изображение по центру» или «Изображение справа». Кнопки сразу меняют размещение одним Undo, не отправляя остальные поля. Сброс убирает явное размещение; подпись и размеры сохраняются. Обтекания текстом нет.', 'Select an image and choose Align image left, Center image or Align image right. These buttons apply placement immediately in one Undo without submitting other fields. Reset removes explicit placement; caption and dimensions survive. Text wrapping is not included.') }}</p>
          <p class="lab-hint">{{ t('Для размера с сохранением пропорций выбери изображение, включи «Сохранять пропорции» и измени ширину или высоту. Второе поле пересчитается; «Обновить изображение» применит оба размера одним Undo. Для независимых размеров и пустого сброса выключи переключатель.', 'To resize proportionally, select an image, enable Keep aspect ratio and change its width or height. The other field follows; Update image applies both dimensions in one Undo. Turn the switch off for independent dimensions or blank resets.') }}</p>
          <p class="lab-hint">{{ t('Для перетаскивания включи «Маркеры размера изображения» и нажми на саму картинку. Потяни угловой маркер: рамка показывает пропорциональный размер, а отпускание применяет его одним Undo. Escape отменяет жест. На маркере доступны стрелки, Shift меняет шаг с 1 до 10 px.', 'For dragging, enable Image resize handles and click the image itself. Drag a corner: the outline previews proportional dimensions, and releasing applies them in one Undo. Escape cancels the gesture. A focused handle supports arrow keys; Shift changes the step from 1 to 10 px.') }}</p>
          <p class="lab-hint">{{ t('Локальный callback возвращает логотип вместо файла. Файл не отправляется и не сохраняется. Для своего сервера передайте upload callback. Пустые размеры снимают ограничения при выключенных пропорциях; подпись редактируется и в документе.', 'The local callback returns the logo instead of the file. Files are not uploaded or stored. Supply an upload callback for your server. Empty dimensions remove limits with ratio locking off; captions are also editable in the document.') }}</p>
        </details>
        <details><summary>{{ t('Оформление', 'Appearance') }}</summary><div class="lab-fields"><label>{{ t('Акцент', 'Accent') }}<input v-model="accent" type="color"></label><label>{{ t('Размер текста', 'Text size') }}<input v-model.number="fontSize" type="number" min="12" max="28"></label><label>{{ t('Отступы', 'Padding') }}<input v-model.number="padding" type="number" min="8" max="64"></label><label>{{ t('Скругление', 'Radius') }}<input v-model.number="radius" type="number" min="0" max="28"></label></div><p class="lab-hint">{{ t('Меняет CSS-переменные этого экземпляра. Содержимое документа не меняется.', 'Changes CSS variables for this instance without editing the document.') }}</p></details>
      </aside>
    </div>
    <template v-if="full">
      <div class="lab-data-grid">
        <details open><summary>{{ t('Буфер диапазона · HTML / TSV', 'Range buffer · HTML / TSV') }}</summary><label>{{ t('Формат буфера', 'Buffer format') }}<select :aria-label="t('Формат буфера', 'Buffer format')" v-model="bufferFormat"><option value="text">TSV</option><option value="html">HTML</option></select></label><label>{{ t('Содержимое буфера', 'Buffer contents') }}<textarea :aria-label="t('Содержимое буфера', 'Buffer contents')" v-model="buffer" class="lab-code" rows="5" spellcheck="false"></textarea></label><div class="lab-inline-actions"><button :disabled="!ready" @click="copyRange(false)">{{ t('Копировать диапазон', 'Copy range') }}</button><button :disabled="!ready || readOnly" @click="copyRange(true)">{{ t('Вырезать диапазон', 'Cut range') }}</button><button :disabled="!ready || readOnly" @click="pasteRange">{{ t('Вставить диапазон', 'Paste range') }}</button></div><p class="lab-hint">{{ t('Это буфер стенда без разрешений браузера. Системный буфер тоже работает: Ctrl/Cmd+C/X/V в редакторе. TSV разделяет столбцы табами.', 'This in-page buffer needs no browser permissions. Native Ctrl/Cmd+C/X/V also works in the editor. TSV uses tabs between columns.') }}</p></details>
        <details open><summary>{{ t('Документ · HTML / JSON', 'Document · HTML / JSON') }}</summary><label>{{ t('Формат документа', 'Document format') }}<select :aria-label="t('Формат документа', 'Document format')" v-model="outputFormat"><option value="html">HTML</option><option value="json">JSON v1</option></select></label><label>{{ t('Исходник документа', 'Document source') }}<textarea :aria-label="t('Исходник документа', 'Document source')" v-model="output" class="lab-code" rows="5" spellcheck="false"></textarea></label><div class="lab-inline-actions"><button :disabled="!ready" @click="snapshot(outputFormat)">{{ t('Получить снимок', 'Get snapshot') }}</button><button :disabled="!ready || readOnly" @click="applySource">{{ t('Применить документ', 'Apply document') }}</button></div><p class="lab-hint">{{ t('Снимок обновляется по кнопке. Применение заменяет документ и сбрасывает историю. Данные остаются в памяти вкладки.', 'Snapshots update on request. Applying replaces the document and resets history. Data stays in this browser tab.') }}</p></details>
      </div>
      <p class="lab-limits">{{ t('Пока нет: совместного редактирования, комментариев, track changes, пагинации, DOCX/PDF и обрезки изображений. Адаптеры Vue/React/Svelte и примеры подключения — в документации.', 'Not implemented: collaboration, comments, track changes, pagination, DOCX/PDF and image cropping. Vue/React/Svelte adapters and integration examples are in the docs.') }}</p>
    </template>
    <pre v-else-if="output" class="demo-output">{{ output }}</pre>
    <p v-if="full" class="lab-hint demo-input-hint">{{ t('Таблица в панели: быстрая сетка 8 × 8, поля — до 100 × 100. Вставьте или перетащите один PNG/JPEG/GIF/WebP/AVIF в обычный текст. Локальное демо возвращает логотип: файл не отправляется и не сохраняется.', 'Table toolbar: an 8 × 8 quick picker; numeric fields support up to 100 × 100. Paste or drop one PNG/JPEG/GIF/WebP/AVIF into ordinary text. This local demo returns the logo: files are not uploaded or stored.') }}</p>
    <div v-if="full" ref="contextualHost" class="demo-contextual-host"></div>
    <div v-if="full" ref="contextualLinkHost" class="demo-contextual-link-host"></div>
    <div v-if="full" ref="contextualTableHost" class="demo-contextual-table-host"></div>
    <div v-if="full" ref="contextualImageHost" class="demo-contextual-image-host"></div>
    <Teleport to="body">
      <div v-if="full" ref="imageResizeHost" class="demo-image-resize-host" :style="themeStyle"></div>
    </Teleport>
  </section>
</template>
