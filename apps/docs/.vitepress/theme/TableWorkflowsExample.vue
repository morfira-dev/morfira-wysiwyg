<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useData } from 'vitepress';
import { createEditor } from '@morfira-dev/wysiwyg';
import type { Editor } from '@morfira-dev/wysiwyg';
import { tables, tableCommands, getTableSelection, tableSelectionChange } from '@morfira-dev/wysiwyg/plugins/tables';
import { createContextualTableUI } from '@morfira-dev/wysiwyg/ui/contextual-table';
import type { ContextualTableUIController } from '@morfira-dev/wysiwyg/ui/contextual-table';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/plugins/tables.css';
import '@morfira-dev/wysiwyg/ui/contextual-table.css';

const { lang } = useData();
const t = (ru: string, en: string) => lang.value === 'ru' ? ru : en;
const root = ref<HTMLElement>();
const controls = ref<HTMLElement>();
const context = ref<HTMLElement>();
const readonly = ref(false);
const region = ref('');
const status = ref('');
const clipboard = ref('');
let editor: Editor | undefined;
let ui: ContextualTableUIController | undefined;
const cleanups: (() => void)[] = [];
const merged = '<p>Quarterly summary</p><table><tr><th>Team</th><th colspan="2">Sales</th></tr><tr><td rowspan="2">North</td><td>Tea</td><td>12</td></tr><tr><td>Coffee</td><td>8</td></tr></table><p>Notes</p>';
const simple = '<table><tr><td>Name</td><td>Count</td></tr><tr><td>Tea</td><td>2</td></tr></table><p>Notes</p>';
const refresh = () => {
  if (!editor) return;
  const state = getTableSelection(editor);
  region.value = state
    ? `${state.rectangle.bottom - state.rectangle.top + 1} × ${state.rectangle.right - state.rectangle.left + 1} · ${state.cells.length} ${t('ячеек', 'cells')}`
    : t('Поставьте курсор в таблицу.', 'Place the caret in the table.');
};
const placeFirst = () => {
  if (!editor) return;
  editor.focus();
  const cell = editor.surface.querySelector('td,th');
  if (!cell) return;
  const range = document.createRange();
  range.selectNodeContents(cell);
  range.collapse(true);
  document.getSelection()?.removeAllRanges();
  document.getSelection()?.addRange(range);
  editor.surface.dispatchEvent(new Event('click', { bubbles: true }));
  refresh();
};
const run = (operation: (instance: Editor) => void) => {
  if (!editor) return;
  try {
    operation(editor);
    status.value = '';
    refresh();
  }
  catch { status.value = t('Действие недоступно для выбранного диапазона.', 'This action is unavailable for the selected region.'); }
};
const load = (value: string) => run((instance) => { instance.setHTML(value); placeFirst(); });
const selectRows = () => run((instance) => tableCommands(instance).selectRow());
const selectColumns = () => run((instance) => tableCommands(instance).selectColumn());
const selectTable = () => run((instance) => tableCommands(instance).selectTable());
const copy = () => run((instance) => { const data = tableCommands(instance).copy(); clipboard.value = `${data.text}\n\n${data.html}`; });
const paste = () => run((instance) => tableCommands(instance).paste({ text: 'Product\tQuantity\nCoffee\t5' }));
const color = () => run((instance) => tableCommands(instance).background('#eef2ff'));
const undo = () => run((instance) => instance.undo());
const redo = () => run((instance) => instance.redo());
const canEdit = computed(() => !readonly.value);
watch(readonly, (value) => { editor?.setReadOnly(value); refresh(); });
watch(lang, (value) => { editor?.setLocale(value === 'ru' ? 'ru' : 'en'); refresh(); });
onMounted(() => {
  if (!root.value || !controls.value || !context.value) return;
  editor = createEditor(root.value, { value: merged, locale: lang.value === 'ru' ? 'ru' : 'en', plugins: [tables()] });
  ui = createContextualTableUI(context.value, editor);
  cleanups.push(tableCommands(editor).registerSelectionHost(controls.value));
  cleanups.push(editor.events.on(tableSelectionChange, refresh));
  cleanups.push(editor.onSelectionChange(refresh));
  placeFirst();
});
onBeforeUnmount(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  ui?.destroy();
  editor?.destroy();
});
</script>

<template>
  <section class="table-workflows-example">
    <div ref="controls" class="table-workflow-controls" @pointerdown="(event) => { if ((event.target as Element).closest('button')) event.preventDefault(); }">
      <button type="button" @click="load(merged)">{{ t('Загрузить таблицу с объединениями', 'Load merged table') }}</button>
      <button type="button" @click="load(simple)">{{ t('Загрузить простую таблицу', 'Load simple table') }}</button>
      <button type="button" @click="selectRows">{{ t('Выделить строки', 'Select rows') }}</button>
      <button type="button" @click="selectColumns">{{ t('Выделить столбцы', 'Select columns') }}</button>
      <button type="button" @click="selectTable">{{ t('Выделить таблицу', 'Select table') }}</button>
      <button type="button" @click="copy">{{ t('Скопировать HTML и TSV', 'Copy HTML and TSV') }}</button>
      <button type="button" :disabled="!canEdit" @click="paste">{{ t('Вставить учебный TSV', 'Paste sample TSV') }}</button>
      <button type="button" :disabled="!canEdit" @click="color">{{ t('Цвет выбранных ячеек', 'Color selected cells') }}</button>
      <button type="button" :disabled="!canEdit" @click="undo">Undo</button>
      <button type="button" :disabled="!canEdit" @click="redo">Redo</button>
      <label><input v-model="readonly" type="checkbox"> {{ t('Только чтение', 'Read only') }}</label>
    </div>
    <p role="status" class="table-workflow-region">{{ region }}</p>
    <p v-if="status" role="alert">{{ status }}</p>
    <div ref="root" />
    <div ref="context" />
    <pre v-if="clipboard" class="table-workflow-copy">{{ clipboard }}</pre>
    <p>{{ t('Текст ячеек редактируется напрямую. Tab переходит между ячейками, Alt+F10 открывает контекстные действия. Учебный TSV создан для примера и не является захватом из Excel.', 'Edit cells directly. Tab moves between cells; Alt+F10 opens contextual actions. The sample TSV is authored for this example, not a capture from Excel.') }}</p>
  </section>
</template>

<style scoped>
.table-workflows-example { border: 1px solid var(--vp-c-divider); border-radius: 12px; padding: 16px; margin-block: 24px; }
.table-workflow-controls { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.table-workflow-controls button { border: 1px solid var(--vp-c-divider); border-radius: 6px; padding: 6px 10px; }
.table-workflow-controls button:disabled { opacity: .45; }
.table-workflow-controls label { display: inline-flex; align-items: center; gap: 5px; }
.table-workflow-copy { max-height: 240px; overflow: auto; white-space: pre-wrap; }
.table-workflow-region { color: var(--vp-c-text-2); }
</style>
