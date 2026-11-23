<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useData } from 'vitepress';
import type { Editor } from '@morfira-dev/wysiwyg';
import type { InlineNodeViewsController, NodeCommands } from '@morfira-dev/wysiwyg/sdk';
import '@morfira-dev/wysiwyg/style.css';

const { lang } = useData();
const ru = computed(() => lang.value === 'ru');
const t = (russian: string, english: string) => ru.value ? russian : english;
const host = ref<HTMLElement>();
const ready = ref(false);
const readOnly = ref(false);
const html = ref('');
const status = ref('');
let editor: Editor | undefined;
let views: InlineNodeViewsController | undefined;
let commands: NodeCommands | undefined;
let unsubscribe: (() => void) | undefined;
let disposed = false;
const sample = '<p>Before <span data-mw-node="demo:visual" data-id="item-42">Item 42</span> after</p>';
const refresh = () => { if (editor) html.value = editor.getHTML(); };
const rename = () => {
  const target = editor?.surface.querySelector<HTMLElement>('[data-mw-node="demo:visual"]');
  if (target && commands?.update(target, { 'data-id': 'item-42' }, 'Updated 42')) {
    views?.refresh(); refresh();
  }
};
const reset = () => { editor?.setHTML(sample); views?.refresh(); refresh(); };
const undo = () => { editor?.undo(); views?.refresh(); refresh(); };
const setReadOnly = () => { editor?.setReadOnly(readOnly.value); views?.refresh(); };

onMounted(async () => {
  const [{ createEditor }, sdk] = await Promise.all([import('@morfira-dev/wysiwyg'), import('@morfira-dev/wysiwyg/sdk')]);
  if (disposed || !host.value) return;
  editor = createEditor(host.value, {
    label: t('Редактор визуальных узлов', 'Visual node editor'), locale: ru.value ? 'ru' : 'en', value: sample,
    plugins: [sdk.nodeExtension({ name: 'demo:visual', kind: 'inline', tag: 'span',
      attributes: { 'data-id': { type: 'text', minLength: 1, maxLength: 64, singleLine: true, required: true } },
      content: { type: 'text', minLength: 1, maxLength: 64, singleLine: true },
    }, { atomic: true })],
  });
  commands = sdk.nodeCommands(editor, 'demo:visual');
  views = sdk.createInlineNodeViews(editor, {
    name: 'demo:visual',
    onError: () => { status.value = t('Не удалось обновить представление', 'The visual view could not be updated'); },
    create: (context) => {
      const element = document.createElement('span');
      element.className = 'visual-record-chip';
      const update = (next: typeof context) => {
        element.textContent = `◆ ${next.text}`;
        element.title = `ID: ${next.attributes['data-id']}`;
      };
      update(context);
      return { element, update };
    },
  });
  unsubscribe = editor.subscribe(refresh);
  ready.value = true;
  refresh();
});
onBeforeUnmount(() => { disposed = true; unsubscribe?.(); views?.destroy(); editor?.destroy(); });
</script>

<template>
  <section class="inline-node-views-example" :aria-label="t('Визуальные узлы внутри редактора', 'Visual nodes in the editing area')">
    <div class="inline-views-controls">
      <button :disabled="!ready || readOnly" @click="rename">{{ t('Обновить узел', 'Update node') }}</button>
      <button :disabled="!ready || readOnly" @click="undo">{{ t('Отменить', 'Undo') }}</button>
      <button :disabled="!ready" @click="reset">{{ t('Сбросить', 'Reset') }}</button>
      <label><input v-model="readOnly" type="checkbox" :disabled="!ready" @change="setReadOnly">{{ t('Только чтение', 'Read only') }}</label>
    </div>
    <p>{{ t('Нажмите на карточку и удалите атом клавишей Backspace. Ниже сохраняется только исходный текст и ID; внешний вид не попадает в документ.', 'Click the chip and delete the atom with Backspace. Only source text and ID are saved below; rendered UI never enters the document.') }}</p>
    <div ref="host" class="inline-views-host" />
    <p role="status">{{ status }}</p>
    <label>{{ t('HTML визуального узла', 'Visual node HTML') }}<textarea :value="html" readonly rows="4" /></label>
  </section>
</template>

<style scoped>
.inline-node-views-example { min-width: 0; padding: 12px; border: 1px solid var(--vp-c-divider); border-radius: 12px; }
.inline-views-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.inline-views-controls button { min-height: 36px; padding: 6px 10px; border: 1px solid var(--vp-c-divider); border-radius: 6px; font: inherit; }
.inline-views-host { margin: 12px 0; }
.inline-views-host :deep([data-mw-node="demo:visual"]) { display: inline-block; min-width: 150px; min-height: 32px; vertical-align: middle; }
.inline-views-host :deep(.visual-record-chip) { display: flex; align-items: center; justify-content: center; box-sizing: border-box; width: 100%; height: 100%; padding: 2px 8px; border: 1px solid var(--mw-accent, #4269dc); border-radius: 8px; color: var(--mw-text, #263043); background: var(--mw-control-bg, #eef2ff); font-weight: 600; }
.inline-node-views-example textarea { display: block; width: 100%; max-width: 100%; box-sizing: border-box; font: inherit; font-family: monospace; }
.inline-views-controls :focus-visible { outline: 2px solid var(--vp-c-brand-1); outline-offset: 2px; }
</style>
