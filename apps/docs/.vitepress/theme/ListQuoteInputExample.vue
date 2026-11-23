<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useData } from 'vitepress';
import type { Editor } from '@morfira-dev/wysiwyg';
import '@morfira-dev/wysiwyg/style.css';

const { lang } = useData();
const ru = computed(() => lang.value === 'ru');
const t = (russian: string, english: string) => ru.value ? russian : english;
const host = ref<HTMLElement>();
const scenario = ref('inside');
const ready = ref(false);
const readOnly = ref(false);
const undoAvailable = ref(false);
const redoAvailable = ref(false);
const html = ref('');
const message = ref('');
let editor: Editor | undefined;
let stop: (() => void) | undefined;
let disposed = false;
const sample = () => {
  const left = '<p title="Left body" style="text-align: right">Alpha <strong>one</strong></p>';
  const right = '<h3 title="Right body"><em>Beta</em> tail</h3>';
  const suffix = '<p title="Quote suffix">Quote suffix</p>';
  const branch = '<ol start="3" title="Nested branch"><li>Nested branch</li></ol>';
  const first = (body: string) => `<blockquote title="First quote" style="text-align: center">${body}</blockquote>`;
  const second = (body: string) => `<blockquote title="Second quote" style="text-align: right">${body}</blockquote>`;
  const body = scenario.value === 'quote-body' ? first(left) + right
    : scenario.value === 'body-quote' ? left + second(right + suffix)
      : scenario.value === 'quote-quote' ? first('<p>Quote prefix</p>' + left) + second(right + suffix)
        : scenario.value === 'branch' ? first(left) + branch + second(right + suffix)
          : first(left + right + suffix);
  return `<ul><li title="Owner item">${body}${scenario.value === 'branch' ? '' : branch}<p title="After branch">After branch</p></li><li>Other item</li></ul>`;
};
const refresh = () => {
  if (!editor) return;
  html.value = editor.getHTML();
  undoAvailable.value = editor.canUndo() && !editor.isReadOnly();
  redoAvailable.value = editor.canRedo() && !editor.isReadOnly();
};
const reset = () => {
  if (!editor || readOnly.value) return;
  editor.setHTML(sample());
  refresh();
  message.value = t('Пример загружен. Подготовьте границу и нажмите клавишу в редакторе.', 'Sample loaded. Prepare a boundary, then press the key in the editor.');
};
const prepare = (end: boolean) => {
  if (!editor) return;
  const block = editor.surface.querySelector(end ? '[title="Left body"]' : '[title="Right body"]');
  if (!block) return;
  editor.focus();
  const range = editor.surface.ownerDocument.createRange();
  range.selectNodeContents(block);
  range.collapse(!end);
  const selection = editor.surface.ownerDocument.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  message.value = end ? t('Курсор в конце левого блока. Нажмите Delete.', 'Caret at the end of the left block. Press Delete.')
    : t('Курсор в начале правого блока. Нажмите Backspace.', 'Caret at the start of the right block. Press Backspace.');
};
const prepareStart = () => prepare(false);
const prepareEnd = () => prepare(true);
const undo = () => { editor?.undo(); refresh(); };
const redo = () => { editor?.redo(); refresh(); };
const updateReadOnly = () => { editor?.setReadOnly(readOnly.value); refresh(); };
onMounted(async () => {
  const { createEditor } = await import('@morfira-dev/wysiwyg');
  if (disposed || !host.value) return;
  editor = createEditor(host.value, { locale: ru.value ? 'ru' : 'en', label: t('Редактор границ цитат в списке', 'List quote boundary editor'), value: sample() });
  stop = editor.subscribe(refresh);
  ready.value = true;
  refresh();
});
onBeforeUnmount(() => {
  disposed = true;
  stop?.();
  stop = undefined;
  editor?.destroy();
  editor = undefined;
});
</script>

<template>
  <section class="list-quote-input-example" :aria-label="t('Границы цитат в пункте списка', 'Quote boundaries in a list item')">
    <div class="list-quote-input-controls">
      <label>{{ t('Сценарий границы', 'Boundary scenario') }}<select v-model="scenario" :aria-label="t('Сценарий границы', 'Boundary scenario')" :disabled="!ready || readOnly" @change="reset">
        <option value="inside">{{ t('Два блока внутри цитаты', 'Two blocks inside a quote') }}</option>
        <option value="quote-body">{{ t('Цитата → обычный блок', 'Quote → ordinary block') }}</option>
        <option value="body-quote">{{ t('Обычный блок → цитата', 'Ordinary block → quote') }}</option>
        <option value="quote-quote">{{ t('Цитата → цитата', 'Quote → quote') }}</option>
        <option value="branch">{{ t('Вложенный список — барьер', 'Nested list barrier') }}</option>
      </select></label>
      <button type="button" :disabled="!ready || readOnly" @click="reset">{{ t('Восстановить пример', 'Reset example') }}</button>
      <button type="button" :disabled="!ready" @click="prepareStart">{{ t('Начало правого блока — Backspace', 'Right block start — Backspace') }}</button>
      <button type="button" :disabled="!ready" @click="prepareEnd">{{ t('Конец левого блока — Delete', 'Left block end — Delete') }}</button>
      <button type="button" :disabled="!undoAvailable" @click="undo">{{ t('Отменить', 'Undo') }}</button>
      <button type="button" :disabled="!redoAvailable" @click="redo">{{ t('Повторить', 'Redo') }}</button>
      <label><input v-model="readOnly" type="checkbox" :disabled="!ready" @change="updateReadOnly">{{ t('Только чтение', 'Read only') }}</label>
    </div>
    <p>{{ t('Кнопки только ставят нативный курсор. Удаление выполняет ваша клавиша Backspace/Delete в редакторе. Enter работает по прежним правилам.', 'Buttons only place a native caret. Your Backspace/Delete key performs deletion in the editor. Enter retains its existing rules.') }}</p>
    <p role="status">{{ message }}</p>
    <div ref="host" class="list-quote-input-host" />
    <label>{{ t('HTML границ цитат', 'Quote boundary HTML') }}<textarea :value="html" readonly rows="7" spellcheck="false" :aria-label="t('HTML границ цитат', 'Quote boundary HTML')" /></label>
  </section>
</template>

<style scoped>
.list-quote-input-example { min-width: 0; max-width: 100%; padding: 12px; border: 1px solid var(--vp-c-divider); border-radius: 12px; }
.list-quote-input-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.list-quote-input-controls select, .list-quote-input-controls button { max-width: 100%; min-height: 36px; padding: 5px 8px; border: 1px solid var(--vp-c-divider); border-radius: 6px; font: inherit; }
.list-quote-input-controls :focus-visible { outline: 2px solid var(--vp-c-brand-1); outline-offset: 2px; }
.list-quote-input-controls :disabled { opacity: .5; }
.list-quote-input-host { min-height: 220px; margin-block: 12px; padding: 12px; border: 1px solid var(--vp-c-divider); border-radius: 8px; }
.list-quote-input-example textarea { display: block; width: 100%; max-width: 100%; padding: 8px; border: 1px solid var(--vp-c-divider); border-radius: 6px; font: inherit; font-family: monospace; resize: vertical; }
</style>
