<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useData } from 'vitepress';
import type { Editor } from '@morfira-dev/wysiwyg';
import type { TextLayoutUIController } from '@morfira-dev/wysiwyg/ui/text-layout';
import type { FormatPainterUIController } from '@morfira-dev/wysiwyg/ui/format-painter';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/ui/text-layout.css';
import '@morfira-dev/wysiwyg/ui/format-painter.css';

const { lang } = useData();
const ru = computed(() => lang.value === 'ru');
const t = (russian: string, english: string) => ru.value ? russian : english;
const host = ref<HTMLElement>();
const layoutHost = ref<HTMLElement>();
const painterHost = ref<HTMLElement>();
const html = ref('');
const ready = ref(false);
const readOnly = ref(false);
const canUndo = ref(false);
const canRedo = ref(false);
let editor: Editor | undefined;
let layoutUI: TextLayoutUIController | undefined;
let painterUI: FormatPainterUIController | undefined;
let stop: (() => void) | undefined;
let disposed = false;
const sample = '<p title="Formatting source"><strong><span style="color: #9d174d; font-family: Georgia; font-size: 24px">Source style</span></strong></p><p title="Formatting target">Keep <a href="https://example.com"><em>Target text</em></a> tail</p><ul><li><blockquote><p title="Quote spacing">Paragraph in a list quote</p><h3 title="Heading spacing">Heading in the same quote</h3></blockquote><ul><li>Nested branch stays unchanged</li></ul></li></ul>';
const refresh = () => {
  if (!editor) return;
  html.value = editor.getHTML();
  canUndo.value = editor.canUndo() && !editor.isReadOnly();
  canRedo.value = editor.canRedo() && !editor.isReadOnly();
};
const select = (selector: string, contents = true) => {
  if (!editor) return;
  const node = editor.surface.querySelector(selector);
  if (!node) return;
  editor.focus();
  const range = node.ownerDocument.createRange();
  range.selectNodeContents(node);
  if (!contents) range.collapse(true);
  const selection = node.ownerDocument.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  layoutUI?.refresh();
  painterUI?.refresh();
};
const source = () => select('[title="Formatting source"] span');
const target = () => select('[title="Formatting target"] em, [title="Formatting target"] a');
const paragraphs = () => {
  if (!editor) return;
  editor.focus();
  const left = editor.surface.querySelector('[title="Quote spacing"]')!;
  const right = editor.surface.querySelector('[title="Heading spacing"]')!;
  const range = left.ownerDocument.createRange();
  range.setStart(left, 0);
  range.setEnd(right, right.childNodes.length);
  const selection = left.ownerDocument.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  layoutUI?.refresh();
  painterUI?.refresh();
};
const reset = () => {
  if (!editor || readOnly.value) return;
  editor.setHTML(sample);
  refresh();
};
const undo = () => { editor?.undo(); refresh(); };
const redo = () => { editor?.redo(); refresh(); };
const updateReadOnly = () => { editor?.setReadOnly(readOnly.value); refresh(); };
watch(lang, () => editor?.setLocale(ru.value ? 'ru' : 'en'));
onMounted(async () => {
  const [{ createEditor }, { textLayout }, { formatPainter }, { createTextLayoutUI }, { createFormatPainterUI }] = await Promise.all([
    import('@morfira-dev/wysiwyg'), import('@morfira-dev/wysiwyg/plugins/text-layout'), import('@morfira-dev/wysiwyg/plugins/format-painter'),
    import('@morfira-dev/wysiwyg/ui/text-layout'), import('@morfira-dev/wysiwyg/ui/format-painter'),
  ]);
  if (disposed || !host.value || !layoutHost.value || !painterHost.value) return;
  editor = createEditor(host.value, { value: sample, locale: ru.value ? 'ru' : 'en', label: t('Редактор интервалов и форматирования', 'Text layout and format painter editor'), plugins: [textLayout(), formatPainter()] });
  layoutUI = createTextLayoutUI(layoutHost.value, editor);
  painterUI = createFormatPainterUI(painterHost.value, editor);
  stop = editor.subscribe(refresh);
  ready.value = true;
  refresh();
});
onBeforeUnmount(() => {
  disposed = true;
  stop?.();
  layoutUI?.destroy();
  painterUI?.destroy();
  editor?.destroy();
});
</script>

<template>
  <section class="text-tools-example" :aria-label="t('Интервалы и перенос форматирования', 'Text layout and format painter')">
    <div class="text-tools-controls">
      <button type="button" :disabled="!ready" @click="source">{{ t('Выделить источник', 'Select source') }}</button>
      <button type="button" :disabled="!ready" @click="target">{{ t('Выделить цель', 'Select target') }}</button>
      <button type="button" :disabled="!ready" @click="paragraphs">{{ t('Выделить блоки цитаты', 'Select quote blocks') }}</button>
      <button type="button" :disabled="!ready || readOnly" @click="reset">{{ t('Восстановить пример', 'Reset example') }}</button>
      <button type="button" :disabled="!canUndo" @click="undo">{{ t('Отменить', 'Undo') }}</button>
      <button type="button" :disabled="!canRedo" @click="redo">{{ t('Повторить', 'Redo') }}</button>
      <label><input v-model="readOnly" type="checkbox" :disabled="!ready" @change="updateReadOnly">{{ t('Только чтение', 'Read only') }}</label>
    </div>
    <p>{{ t('Выделите источник → скопируйте форматирование → выделите цель → примените. Для интервалов выделите блоки цитаты или поставьте курсор в абзац.', 'Select source → copy formatting → select target → apply. For spacing, select quote blocks or place the caret in a paragraph.') }}</p>
    <div ref="layoutHost" />
    <div ref="painterHost" />
    <div ref="host" />
    <label>{{ t('HTML инструментов текста', 'Text tools HTML') }}<textarea :value="html" readonly rows="6" :aria-label="t('HTML инструментов текста', 'Text tools HTML')" /></label>
  </section>
</template>

<style scoped>
.text-tools-example{display:grid;gap:12px;min-width:0;padding:12px;border:1px solid var(--vp-c-divider);border-radius:12px}
.text-tools-controls{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.text-tools-controls button{min-height:36px;max-width:100%;padding:6px 10px;border:1px solid var(--vp-c-divider);border-radius:6px;font:inherit;overflow-wrap:anywhere}
.text-tools-example textarea{box-sizing:border-box;width:100%;padding:8px;border:1px solid var(--vp-c-divider);border-radius:6px;font:13px/1.5 monospace}
</style>
