<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useData } from 'vitepress';
import type { Editor, EditorCommand, EditorSelectionHandle } from '@morfira-dev/wysiwyg';
import '@morfira-dev/wysiwyg/style.css';

const { lang } = useData();
const ru = computed(() => lang.value === 'ru');
const t = (russian: string, english: string) => ru.value ? russian : english;
const host = ref<HTMLElement>();
const external = ref<HTMLInputElement>();
const ready = ref(false);
const captured = ref(false);
const message = ref('');
const html = ref('');
let editor: Editor | undefined;
let handle: EditorSelectionHandle | undefined;
let emphasize: EditorCommand<void> | undefined;
let intentCurrent = false;
let restoring = false;
let disposed = false;
const cleanup: (() => void)[] = [];

const release = () => {
  if (editor && handle) editor.selection.release(handle);
  handle = undefined;
  captured.value = false;
  intentCurrent = false;
};
const refresh = () => {
  if (editor) html.value = editor.getHTML();
};
const sameIntent = () => {
  if (!editor || !handle || !intentCurrent) return false;
  const saved = editor.selection.getRange(handle);
  if (!saved) return false;
  const doc = editor.surface.ownerDocument;
  const focused = editor.surface.contains(doc.activeElement);
  const selection = doc.getSelection();
  if (selection?.rangeCount !== 1) return !focused;
  const current = selection.getRangeAt(0);
  const inside = editor.surface.contains(current.startContainer) && editor.surface.contains(current.endContainer);
  if (!inside) return !focused;
  return current.startContainer === saved.startContainer && current.startOffset === saved.startOffset
    && current.endContainer === saved.endContainer && current.endOffset === saved.endOffset;
};
const observeSelection = () => {
  if (!restoring && handle && !sameIntent()) intentCurrent = false;
};
const selectSample = () => {
  release();
  editor?.setSelection(0, 7);
  message.value = t('Выделено слово Morfira. Сохраните выделение.', 'Morfira is selected. Remember the selection.');
};
const remember = () => {
  if (!editor) return;
  release();
  handle = editor.selection.capture();
  if (!handle || editor.selection.getRange(handle)?.collapsed !== false) {
    release();
    message.value = t('Сначала выделите текст в редакторе.', 'Select text in the editor first.');
    return;
  }
  intentCurrent = true;
  captured.value = true;
  message.value = t('Выделение сохранено. Можно работать во внешнем поле.', 'Selection remembered. You can use the external field.');
  external.value?.focus();
};
const apply = () => {
  if (!editor || !handle || !emphasize) return;
  let accepted = false;
  try {
    if (sameIntent()) {
      restoring = true;
      // Stage the range before focus: browsers may otherwise create a default caret.
      if (editor.selection.restore(handle)) {
        editor.focus();
        if (sameIntent() && editor.selection.isCurrent(handle))
          accepted = editor.commands.execute(emphasize, undefined);
      }
    }
  }
  catch {
    accepted = false;
  }
  finally {
    restoring = false;
    release();
    refresh();
  }
  message.value = accepted
    ? t('Формат применён одной командой. Его можно отменить.', 'Formatting applied in one command. You can undo it.')
    : t('Цель устарела, выделение изменилось или команда недоступна. Изменений нет.', 'The target expired, selection changed, or command is unavailable. No change.');
};
const replaceDocument = () => {
  editor?.setHTML('<p>Morfira — replacement document.</p>');
  refresh();
  message.value = t('Документ заменён. Старая цель больше не принимается.', 'Document replaced. The previous target is no longer accepted.');
};
const undo = () => {
  editor?.undo();
  refresh();
};

onMounted(async () => {
  const { createEditor, createEditorCommand } = await import('@morfira-dev/wysiwyg');
  if (disposed || !host.value) return;
  emphasize = createEditorCommand<void>('demo:remembered-emphasis');
  editor = createEditor(host.value, {
    locale: ru.value ? 'ru' : 'en',
    label: t('Редактор сохранённого выделения', 'Remembered selection editor'),
    value: '<p>Morfira — selection handles.</p>',
  });
  cleanup.push(editor.commands.register(emphasize, {
    validate: (payload) => {
      if (payload !== undefined) throw new TypeError('This command accepts no payload.');
    },
    execute: (target) => target.format('bold', true),
  }));
  cleanup.push(editor.onSelectionChange(observeSelection));
  cleanup.push(editor.subscribe(refresh));
  ready.value = true;
  refresh();
});

onBeforeUnmount(() => {
  disposed = true;
  release();
  for (const stop of cleanup) stop();
  editor?.destroy();
  editor = undefined;
});
</script>

<template>
  <section class="selection-sdk-example" :aria-label="t('Сохранённое выделение SDK', 'SDK remembered selection')">
    <p>{{ t('Выделите текст, сохраните цель, затем примените формат из внешнего элемента. Новое выделение в редакторе или замена документа отменяют отложенное действие.', 'Select text, remember the target, then apply formatting from an external control. A new editor selection or document replacement cancels the deferred action.') }}</p>
    <div class="selection-sdk-actions">
      <button type="button" :disabled="!ready" @click="selectSample">{{ t('Выделить пример', 'Select sample') }}</button>
      <button type="button" :disabled="!ready" @pointerdown.prevent @click="remember">{{ t('Сохранить выделение', 'Remember selection') }}</button>
      <button type="button" :disabled="!captured" @click="apply">{{ t('Применить жирный', 'Apply bold') }}</button>
      <button type="button" :disabled="!ready" @click="replaceDocument">{{ t('Заменить документ', 'Replace document') }}</button>
      <button type="button" :disabled="!ready" @click="undo">{{ t('Отменить', 'Undo') }}</button>
    </div>
    <label>{{ t('Внешнее поле приложения', 'External application field') }}<input ref="external" type="text"></label>
    <p role="status">{{ message }}</p>
    <div ref="host"></div>
    <label>HTML<textarea :value="html" readonly rows="3" :aria-label="t('HTML сохранённого выделения', 'Remembered selection HTML')"></textarea></label>
  </section>
</template>

<style scoped>
.selection-sdk-example { display: grid; gap: 12px; margin: 20px 0; padding: 16px; min-width: 0; border: 1px solid var(--vp-c-divider); border-radius: 12px; }
.selection-sdk-example p { margin: 0; }
.selection-sdk-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.selection-sdk-example label { display: grid; gap: 4px; min-width: 0; }
.selection-sdk-example input, .selection-sdk-example textarea, .selection-sdk-example button { max-width: 100%; padding: 7px 9px; border: 1px solid var(--vp-c-divider); border-radius: 6px; background: var(--vp-c-bg); color: var(--vp-c-text-1); font: inherit; }
.selection-sdk-example button { cursor: pointer; }
.selection-sdk-example button:disabled { opacity: .5; cursor: default; }
.selection-sdk-example textarea { resize: vertical; font-family: var(--vp-font-family-mono); font-size: 12px; }
.selection-sdk-example :deep(.mw-editor) { --mw-surface: var(--vp-c-bg); --mw-text: var(--vp-c-text-1); --mw-border: var(--vp-c-divider); --mw-min-height: 120px; }
</style>
