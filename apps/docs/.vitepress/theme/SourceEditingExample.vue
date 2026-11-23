<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useData } from 'vitepress';
import type { Editor } from '@morfira-dev/wysiwyg';
import type { SourceEditorController } from '@morfira-dev/wysiwyg/ui/source';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/ui/source.css';
const { lang } = useData();
const ru = computed(() => lang.value === 'ru');
const t = (russian: string, english: string) => ru.value ? russian : english;
const host = ref<HTMLElement>();
const sourceHost = ref<HTMLElement>();
const ready = ref(false);
const readonly = ref(false);
const html = ref('');
const canUndo = ref(false);
const canRedo = ref(false);
let editor: Editor | undefined;
let source: SourceEditorController | undefined;
let stop: (() => void) | undefined;
let disposed = false;
const sample = '<h2>Source editing</h2><p><strong>Original</strong> text and a <a href="https://example.com">safe link</a>.</p>';
const refresh = () => {
  html.value = editor?.getHTML() ?? '';
  canUndo.value = !!editor?.canUndo() && !editor.isReadOnly();
  canRedo.value = !!editor?.canRedo() && !editor.isReadOnly();
};
const open = () => { source?.open(); };
const unsafeDraft = () => {
  if (!source?.open()) return;
  source.setValue('<h2 onclick="alert(1)">Supported heading</h2><p><b>Supported bold</b><script>untrusted()<\/script><a href="javascript:alert(1)">Unsafe URL omitted</a></p>');
  source.preview();
};
const reset = () => { editor?.setHTML(sample); refresh(); };
const undo = () => { editor?.undo(); refresh(); };
const redo = () => { editor?.redo(); refresh(); };
watch(readonly, (value) => { editor?.setReadOnly(value); refresh(); });
watch(ru, () => editor?.setLocale(ru.value ? 'ru' : 'en'));
onMounted(async () => {
  const [{ createEditor }, { createSourceEditor }] = await Promise.all([
    import('@morfira-dev/wysiwyg'), import('@morfira-dev/wysiwyg/ui/source'),
  ]);
  if (disposed || !host.value || !sourceHost.value) return;
  editor = createEditor(host.value, { value: sample, locale: ru.value ? 'ru' : 'en', readOnly: readonly.value });
  source = createSourceEditor(sourceHost.value, editor);
  stop = editor.subscribe(refresh);
  ready.value = true;
  refresh();
});
onBeforeUnmount(() => {
  disposed = true;
  stop?.();
  source?.destroy();
  editor?.destroy();
});
</script>

<template>
  <section class="source-editing-example" :aria-label="t('Редактирование HTML-исходника', 'HTML source editing')">
    <p>{{ t('Черновик и текстовый предпросмотр не меняют документ. Применение — одна операция Undo.', 'The draft and text preview do not change the document. Apply is one Undo operation.') }}</p>
    <div class="source-example-actions">
      <button :disabled="!ready || readonly" @click="open">{{ t('Открыть HTML-исходник', 'Open HTML source') }}</button>
      <button :disabled="!ready || readonly" @click="unsafeDraft">{{ t('Пример неподдерживаемой разметки', 'Unsupported markup example') }}</button>
      <button :disabled="!canUndo" @click="undo">{{ t('Отменить', 'Undo') }}</button>
      <button :disabled="!canRedo" @click="redo">{{ t('Повторить', 'Redo') }}</button>
      <button :disabled="!ready" @click="reset">{{ t('Сбросить пример', 'Reset example') }}</button>
      <label><input v-model="readonly" type="checkbox"> {{ t('Только чтение', 'Read only') }}</label>
    </div>
    <div ref="host" class="source-example-host" />
    <div ref="sourceHost" />
    <label>{{ t('HTML документа', 'Document HTML') }}<textarea :value="html" readonly rows="6" /></label>
  </section>
</template>

<style scoped>
.source-editing-example { min-width: 0; padding: 12px; border: 1px solid var(--vp-c-divider); border-radius: 12px; }
.source-example-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-block: 12px; }
.source-example-actions button { min-height: 36px; padding: 6px 10px; border: 1px solid var(--vp-c-divider); border-radius: 6px; font: inherit; }
.source-example-host { min-height: 180px; padding: 12px; border: 1px solid var(--vp-c-divider); border-radius: 8px; }
.source-editing-example > label { display: grid; gap: 4px; margin-block-start: 12px; }
.source-editing-example > label textarea { box-sizing: border-box; max-width: 100%; padding: 8px; border: 1px solid var(--vp-c-divider); font-family: monospace; }
.source-editing-example button:focus-visible { outline: 2px solid var(--vp-c-brand-1); outline-offset: 2px; }
</style>
