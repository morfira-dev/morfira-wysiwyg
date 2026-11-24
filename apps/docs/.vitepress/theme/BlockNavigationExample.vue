<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useData, withBase } from 'vitepress';
import type { Editor } from '@morfira-dev/wysiwyg';
import type { BlockNavigationCommands } from '@morfira-dev/wysiwyg/plugins/block-navigation';
import '@morfira-dev/wysiwyg/style.css';

const { lang } = useData();
const ru = computed(() => lang.value === 'ru');
const t = (russian: string, english: string) => ru.value ? russian : english;
const host = ref<HTMLElement>();
const ready = ref(false);
const readOnly = ref(false);
const html = ref('');
const selection = ref('');
let editor: Editor | undefined;
let commands: BlockNavigationCommands | undefined;
let disposed = false;
const stops: (() => void)[] = [];
const sample = `<p>Before: move to the end and press →.</p><hr><figure><img src="${withBase('/logo.svg')}" alt="Morfira logo" width="64" height="64"><figcaption>Editable image caption</figcaption></figure><hr><p>After: move to the beginning and press Backspace.</p>`;
const refresh = () => {
  if (!editor) return;
  html.value = editor.getHTML();
  selection.value = commands?.getSelected()?.localName ?? '—';
};
const reset = () => {
  if (!editor || readOnly.value) return;
  editor.setHTML(sample);
  refresh();
};
const choose = (selector: string) => {
  if (!editor) return;
  editor.focus();
  const target = editor.surface.querySelector<HTMLElement>(selector);
  if (target) commands?.select(target);
  refresh();
};
const undo = () => { editor?.undo(); refresh(); };
const redo = () => { editor?.redo(); refresh(); };
const toggleReadOnly = () => { editor?.setReadOnly(readOnly.value); refresh(); };
onMounted(async () => {
  const [{ createEditor }, navigation] = await Promise.all([
    import('@morfira-dev/wysiwyg'),
    import('@morfira-dev/wysiwyg/plugins/block-navigation'),
  ]);
  if (disposed || !host.value) return;
  editor = createEditor(host.value, { value: sample, plugins: [navigation.blockNavigation()], locale: ru.value ? 'ru' : 'en' });
  commands = navigation.blockNavigationCommands(editor);
  stops.push(editor.subscribe(refresh), editor.onSelectionChange(refresh));
  ready.value = true;
  refresh();
});
onBeforeUnmount(() => {
  disposed = true;
  for (const stop of stops) stop();
  editor?.destroy();
});
</script>

<template>
  <section class="block-navigation-example" :aria-label="t('Навигация вокруг блоков', 'Block navigation')">
    <p>{{ t('Выберите объект. ←/→ выходят до/после него; Enter создаёт абзац после, Shift+Enter — до. Backspace/Delete удаляют выбранный объект. Между объектами можно печатать.', 'Select an object. ←/→ leave before/after it; Enter inserts a paragraph after, Shift+Enter before. Backspace/Delete removes the selected object. You can type between objects.') }}</p>
    <div class="block-navigation-actions">
      <button type="button" :disabled="!ready || readOnly" @click="choose('hr')">{{ t('Выбрать разделитель', 'Select divider') }}</button>
      <button type="button" :disabled="!ready || readOnly" @click="choose('figure')">{{ t('Выбрать изображение', 'Select image') }}</button>
      <button type="button" :disabled="!ready || readOnly" @click="undo">{{ t('Отменить', 'Undo') }}</button>
      <button type="button" :disabled="!ready || readOnly" @click="redo">{{ t('Повторить', 'Redo') }}</button>
      <button type="button" :disabled="!ready || readOnly" @click="reset">{{ t('Сбросить', 'Reset') }}</button>
      <label><input v-model="readOnly" type="checkbox" :disabled="!ready" @change="toggleReadOnly"> Read-only</label>
    </div>
    <p role="status">{{ t('Выбранный объект:', 'Selected object:') }} {{ selection }}</p>
    <div ref="host" class="block-navigation-host" />
    <details><summary>HTML</summary><pre>{{ html }}</pre></details>
  </section>
</template>

<style scoped>
.block-navigation-example { margin-block: 1rem; }
.block-navigation-actions { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; }
.block-navigation-actions button { padding: .4rem .65rem; border: 1px solid var(--vp-c-divider); border-radius: .4rem; }
.block-navigation-actions button:disabled { opacity: .5; }
.block-navigation-host { margin-block: .75rem; }
.block-navigation-host :deep(.mw-content) { min-height: 12rem; }
.block-navigation-example pre { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
