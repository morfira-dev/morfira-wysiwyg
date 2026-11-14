<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useData } from 'vitepress';
import type { Editor, EditorCommand, EditorPlugin, SchemaNodeSpec } from '@morfira-dev/wysiwyg';
import type { CalloutPayload, ReferencePayload } from './PluginSDKExample.types.js';
import '@morfira-dev/wysiwyg/style.css';

const { lang } = useData();
const ru = computed(() => lang.value === 'ru');
const t = (russian: string, english: string) => ru.value ? russian : english;
const host = ref<HTMLElement>();
const label = ref(t('Новая заметка', 'New note'));
const referenceID = ref('TASK-42');
const tone = ref<'note' | 'warning'>('note');
const html = ref('');
const json = ref('');
const message = ref('');
const failed = ref(false);
const ready = ref(false);
const readOnly = ref(false);
const canCallout = ref(false);
const canReference = ref(false);
const canUndo = ref(false);
const canRedo = ref(false);
let editor: Editor | undefined;
let callout: EditorCommand<CalloutPayload> | undefined;
let reference: EditorCommand<ReferencePayload> | undefined;
let disposed = false;
const subscriptions: (() => void)[] = [];

const refresh = () => {
  if (!editor || !callout || !reference) return;
  html.value = editor.getHTML();
  json.value = JSON.stringify(editor.getJSON(), null, 2);
  canUndo.value = editor.canUndo();
  canRedo.value = editor.canRedo();
  readOnly.value = editor.isReadOnly();
  canCallout.value = editor.commands.getState(callout).enabled;
  canReference.value = editor.commands.getState(reference).enabled;
};
const run = (action: (instance: Editor) => void) => {
  if (!editor) return;
  failed.value = false;
  message.value = '';
  try {
    action(editor);
    refresh();
  }
  catch {
    failed.value = true;
    message.value = t('Команда отклонена. Проверьте подпись и ID ссылки.', 'Command rejected. Check the label and reference ID.');
    refresh();
  }
};
const insertCallout = () => run((instance) => {
  if (!callout) return;
  instance.setSelection(instance.surface.textContent?.length ?? 0);
  instance.commands.execute(callout, { text: label.value, tone: tone.value });
});
const insertReference = () => run((instance) => {
  if (!reference) return;
  instance.setSelection(instance.surface.textContent?.length ?? 0);
  instance.commands.execute(reference, { text: label.value, id: referenceID.value });
});
const undo = () => run((instance) => instance.undo());
const redo = () => run((instance) => instance.redo());
const toggleReadOnly = () => run((instance) => instance.setReadOnly(!instance.isReadOnly()));

onMounted(async () => {
  const { createEditor, createEditorCommand } = await import('@morfira-dev/wysiwyg');
  if (disposed || !host.value) return;
  callout = createEditorCommand<CalloutPayload>('demo:insert-callout');
  reference = createEditorCommand<ReferencePayload>('demo:insert-reference');
  const calloutCommand = callout;
  const referenceCommand = reference;
  const schema: readonly SchemaNodeSpec[] = [
    { name: 'demo:callout', kind: 'block', tag: 'blockquote', attributes: { 'data-tone': { type: 'enum', values: ['note', 'warning'], required: true } } },
    { name: 'demo:reference', kind: 'inline', tag: 'span', attributes: { 'data-id': { type: 'text', maxLength: 64, required: true } } },
  ];
  const plugin: EditorPlugin = {
    name: 'demo:sdk',
    schema,
    setup: (instance) => {
      const removeCallout = instance.commands.register(calloutCommand, {
        validate: (payload): CalloutPayload => {
          if (!payload || typeof payload !== 'object' || !('text' in payload) || typeof payload.text !== 'string' || !payload.text.trim() || payload.text.length > 200 || !('tone' in payload) || (payload.tone !== 'note' && payload.tone !== 'warning'))
            throw new TypeError('Invalid callout payload.');
          return { text: payload.text, tone: payload.tone };
        },
        execute: (target, payload) => {
          const block = target.surface.ownerDocument.createElement('blockquote');
          block.setAttribute('data-mw-node', 'demo:callout');
          block.setAttribute('data-tone', payload.tone);
          block.textContent = payload.text;
          target.insertHTML(block.outerHTML);
        },
      });
      const removeReference = instance.commands.register(referenceCommand, {
        validate: (payload): ReferencePayload => {
          if (!payload || typeof payload !== 'object' || !('text' in payload) || typeof payload.text !== 'string' || !payload.text.trim() || payload.text.length > 200 || !('id' in payload) || typeof payload.id !== 'string' || !payload.id.trim() || payload.id.length > 64)
            throw new TypeError('Invalid reference payload.');
          return { text: payload.text, id: payload.id };
        },
        execute: (target, payload) => {
          const span = target.surface.ownerDocument.createElement('span');
          span.setAttribute('data-mw-node', 'demo:reference');
          span.setAttribute('data-id', payload.id);
          span.textContent = payload.text;
          target.insertHTML(span.outerHTML);
        },
      });
      return () => {
        removeCallout();
        removeReference();
      };
    },
  };
  try {
    editor = createEditor(host.value, {
      locale: ru.value ? 'ru' : 'en',
      label: t('Пример SDK плагинов', 'Plugin SDK example'),
      plugins: [plugin],
      value: `<p><span data-mw-node="demo:reference" data-id="MORFIRA-1">Morfira</span></p><blockquote data-mw-node="demo:callout" data-tone="note">${t('Схема подключена до начального импорта.', 'Schema is compiled before initial import.')}</blockquote><p><br></p>`,
    });
    subscriptions.push(editor.subscribe(refresh));
    subscriptions.push(editor.onSelectionChange(refresh));
    subscriptions.push(editor.events.on('readonlychange', refresh));
    refresh();
    ready.value = true;
  }
  catch {
    failed.value = true;
    message.value = t('Не удалось создать пример SDK.', 'Unable to initialize the SDK example.');
  }
});

onBeforeUnmount(() => {
  disposed = true;
  for (const stop of subscriptions) stop();
  editor?.destroy();
  editor = undefined;
});
</script>

<template>
  <section class="sdk-example" :aria-label="t('Интерактивный SDK', 'Interactive SDK')">
    <p class="sdk-hint">{{ t('Кнопки вставляют содержимое в конец документа. Текст остаётся обычным редактируемым текстом; inline reference ещё не атом.', 'Buttons insert at the document end. Text stays normally editable; the inline reference is not an atom yet.') }}</p>
    <div class="sdk-fields">
      <label>{{ t('Подпись', 'Label') }}<input v-model="label" type="text" maxlength="200"></label>
      <label>{{ t('Тип заметки', 'Note tone') }}<select :aria-label="t('Тип заметки', 'Note tone')" v-model="tone"><option value="note">{{ t('Заметка', 'Note') }}</option><option value="warning">{{ t('Предупреждение', 'Warning') }}</option></select></label>
      <label>{{ t('ID ссылки', 'Reference ID') }}<input v-model="referenceID" type="text"></label>
    </div>
    <div class="sdk-actions">
      <button type="button" :disabled="!ready || !canCallout" @click="insertCallout">{{ t('Вставить заметку', 'Insert callout') }}</button>
      <button type="button" :disabled="!ready || !canReference" @click="insertReference">{{ t('Вставить reference', 'Insert reference') }}</button>
      <button type="button" :disabled="!ready || !canUndo || readOnly" @click="undo">{{ t('Отменить', 'Undo') }}</button>
      <button type="button" :disabled="!ready || !canRedo || readOnly" @click="redo">{{ t('Повторить', 'Redo') }}</button>
      <button type="button" :disabled="!ready" :aria-pressed="readOnly" @click="toggleReadOnly">{{ t('Только чтение', 'Read only') }}</button>
    </div>
    <p v-if="message" :role="failed ? 'alert' : 'status'">{{ message }}</p>
    <div ref="host"></div>
    <label class="sdk-output">HTML<textarea :value="html" readonly rows="5" :aria-label="t('HTML примера SDK', 'SDK example HTML')"></textarea></label>
    <label class="sdk-output">JSON<textarea :value="json" readonly rows="9" :aria-label="t('JSON примера SDK', 'SDK example JSON')"></textarea></label>
  </section>
</template>

<style scoped>
.sdk-example { display: grid; gap: 12px; margin: 20px 0; padding: 16px; border: 1px solid var(--vp-c-divider); border-radius: 12px; min-width: 0; }
.sdk-hint { margin: 0; font-size: 14px; color: var(--vp-c-text-2); }
.sdk-fields { display: flex; flex-wrap: wrap; gap: 12px; }
.sdk-fields label, .sdk-output { display: grid; gap: 4px; min-width: 0; flex: 1 1 150px; }
.sdk-fields input, .sdk-fields select, .sdk-output textarea, .sdk-actions button { border: 1px solid var(--vp-c-divider); border-radius: 6px; padding: 7px 9px; font: inherit; background: var(--vp-c-bg); color: var(--vp-c-text-1); max-width: 100%; }
.sdk-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.sdk-actions button { cursor: pointer; }
.sdk-actions button:disabled { opacity: .5; cursor: default; }
.sdk-output textarea { width: 100%; font-family: var(--vp-font-family-mono); font-size: 12px; resize: vertical; }
.sdk-example :deep(.mw-editor) { --mw-surface: var(--vp-c-bg); --mw-text: var(--vp-c-text-1); --mw-border: var(--vp-c-divider); --mw-min-height: 180px; }
.sdk-example :deep([data-mw-node='demo:callout']) { border-inline-start: 3px solid var(--mw-accent, #6658e8); padding-inline-start: 12px; }
.sdk-example :deep([data-mw-node='demo:callout'][data-tone='warning']) { border-inline-start-color: #b76a11; }
.sdk-example :deep([data-mw-node='demo:reference']) { background: var(--mw-accent-soft, #eeebff); color: var(--mw-accent, #6658e8); border-radius: 4px; padding: 0 3px; }
</style>
