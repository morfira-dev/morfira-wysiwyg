<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useData } from 'vitepress';
import type { Editor } from '@morfira-dev/wysiwyg';
import type { MarkdownCodecOptions } from '@morfira-dev/wysiwyg/codecs/markdown';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/plugins/checklists.css';

const { lang } = useData();
const ru = computed(() => lang.value === 'ru');
const t = (russian: string, english: string) => ru.value ? russian : english;
const host = ref<HTMLElement>();
const ready = ref(false);
const message = ref('');
const tasks = ref(true);
const alignment = ref(true);
const sample = ['Morfira &copy;', '===============', '', '[Documentation][guide] and <https://example.com>', '', '[guide]: https://example.com "Reference title"', '', '- [x] Reviewed', '- [ ] Publish', '', '| Left | Center | Right |', '| :--- | :---: | ---: |', '| A | B | C |', '', '    const value = "literal &amp;";'].join('\n');
const source = ref(sample);
let editor: Editor | undefined;
let codec: typeof import('@morfira-dev/wysiwyg/codecs/markdown') | undefined;
let disposed = false;
const options = (): MarkdownCodecOptions => ({ taskLists: tasks.value, tableAlignment: alignment.value });
const importSource = () => {
  if (!editor || !codec || editor.isReadOnly()) return;
  try {
    const value = codec.parseMarkdown(source.value, options());
    editor.setJSON(value);
    message.value = t('Импорт завершён. Предыдущая история сброшена.', 'Imported. Previous history was reset.');
  }
  catch (error) {
    message.value = error instanceof Error ? error.message : t('Ошибка импорта.', 'Import failed.');
  }
};
const exportSource = () => {
  if (!editor || !codec) return;
  try {
    source.value = codec.serializeMarkdown(editor.getJSON(), options());
    message.value = t('Канонический Markdown экспортирован.', 'Canonical Markdown exported.');
  }
  catch (error) {
    message.value = error instanceof Error ? error.message : t('Ошибка экспорта.', 'Export failed.');
  }
};
const reset = () => { source.value = sample; importSource(); };
onMounted(async () => {
  const [{ createEditor }, { checklists }, conversion] = await Promise.all([
    import('@morfira-dev/wysiwyg'), import('@morfira-dev/wysiwyg/plugins/checklists'),
    import('@morfira-dev/wysiwyg/codecs/markdown'),
  ]);
  if (disposed || !host.value) return;
  codec = conversion;
  editor = createEditor(host.value, {
    locale: ru.value ? 'ru' : 'en',
    label: t('Редактор расширенного Markdown', 'Extended Markdown editor'),
    plugins: [checklists()],
  });
  ready.value = true;
  importSource();
});
onBeforeUnmount(() => {
  disposed = true;
  editor?.destroy();
  editor = undefined;
  codec = undefined;
});
</script>

<template>
  <section class="advanced-markdown-example" :aria-label="t('Расширенный Markdown', 'Extended Markdown')">
    <p>{{ t('Reference-ссылки, Setext, код с отступом, entities, чек-листы и выравнивание столбцов. Два последних расширения включаются явно.', 'Reference links, setext, indented code, entities, task lists and column alignment. The last two extensions require explicit options.') }}</p>
    <label>{{ t('Исходный Markdown', 'Markdown source') }}<textarea v-model="source" rows="12" spellcheck="false" /></label>
    <div class="advanced-markdown-controls">
      <label><input v-model="tasks" type="checkbox"> {{ t('Метаданные чек-листов', 'Task-list metadata') }}</label>
      <label><input v-model="alignment" type="checkbox"> {{ t('Выравнивание столбцов', 'Column alignment') }}</label>
      <button type="button" :disabled="!ready" @click="importSource">{{ t('Импортировать Markdown', 'Import Markdown') }}</button>
      <button type="button" :disabled="!ready" @click="exportSource">{{ t('Экспортировать Markdown', 'Export Markdown') }}</button>
      <button type="button" :disabled="!ready" @click="reset">{{ t('Восстановить пример', 'Reset example') }}</button>
    </div>
    <p role="status">{{ message }}</p>
    <div ref="host" class="advanced-markdown-host" />
  </section>
</template>

<style scoped>
.advanced-markdown-example { border: 1px solid var(--vp-c-divider); border-radius: 12px; padding: 16px; }
.advanced-markdown-example textarea { display: block; width: 100%; padding: 10px; border: 1px solid var(--vp-c-divider); border-radius: 6px; font: inherit; font-family: monospace; resize: vertical; }
.advanced-markdown-controls { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-top: 12px; }
.advanced-markdown-controls button { border: 1px solid var(--vp-c-divider); border-radius: 6px; padding: 4px 10px; }
.advanced-markdown-controls button:disabled { opacity: .5; }
.advanced-markdown-host { min-height: 180px; border: 1px solid var(--vp-c-divider); border-radius: 6px; padding: 12px; }
</style>
