<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId } from 'vue';
import { useData } from 'vitepress';
import { createEditor } from '@morfira-dev/wysiwyg';
import type { Editor, EditorDocument } from '@morfira-dev/wysiwyg';
import { createContentView } from '@morfira-dev/wysiwyg/content-view';
import type { ContentViewController } from '@morfira-dev/wysiwyg/content-view';
import { applicationNodeNames, createApplicationExtensions } from './application-extensions/index.js';
import type { ApplicationNodeKind, ApplicationNodeTarget } from './application-extensions/types.js';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/content-view.css';

const { lang } = useData();
const kindId = `application-extension-kind-${useId()}`;
const t = (ru: string, en: string) => lang.value === 'ru' ? ru : en;
const host = ref<HTMLElement>();
const readerHost = ref<HTMLElement>();
const ready = ref(false);
const kind = ref<ApplicationNodeKind>('entity');
const text = ref('Ada');
const attribute = ref('record-42');
const customer = ref('<b>Ada</b>');
const order = ref('ORD-42');
const readOnly = ref(false);
const status = ref('');
const saved = ref('');
const current = ref(false);
const bundle = createApplicationExtensions();
let editor: Editor | undefined;
let reader: ContentViewController | undefined;
let target: ApplicationNodeTarget | undefined;
let snapshot: EditorDocument | undefined;
let stop: (() => void) | undefined;
const initial = '<p>Contact <span data-mw-node="app:entity" data-id="record-42">Ada</span> about <span data-mw-node="app:variable" data-key="order">{{order}}</span>.</p><blockquote data-mw-node="app:callout" data-tone="info">Keep a copy of the confirmation.</blockquote><p>Hello <span data-mw-node="app:variable" data-key="customer">{{customer}}</span>.</p><p>Continue here.</p>';
const attributeLabel = computed(() => kind.value === 'entity' ? t('ID сущности', 'Entity ID')
  : kind.value === 'callout' ? t('Тон блока: info или warning', 'Callout tone: info or warning') : t('Ключ: customer или order', 'Key: customer or order'));
const attributes = () => ({ [kind.value === 'entity' ? 'data-id' : kind.value === 'callout' ? 'data-tone' : 'data-key']: attribute.value });
const refresh = () => { current.value = !!target && bundle.isCurrent(target); };
const run = (action: () => boolean) => {
  try { status.value = action() ? t('Готово', 'Done') : t('Действие отклонено. Проверьте цель.', 'Action refused. Inspect the target.'); }
  catch { status.value = t('Недопустимые данные. Документ сохранён.', 'Invalid input. Document retained.'); }
  refresh();
};
const inspect = () => {
  if (!editor) return;
  const node = editor.surface.querySelector<HTMLElement>(`[data-mw-node="${applicationNodeNames[kind.value]}"]`);
  target = node ? bundle.capture(editor, kind.value, node) : undefined;
  if (target) {
    text.value = target.node.textContent ?? '';
    attribute.value = target.node.getAttribute(kind.value === 'entity' ? 'data-id' : kind.value === 'callout' ? 'data-tone' : 'data-key') ?? '';
  }
  status.value = target ? t('Цель выбрана', 'Target inspected') : t('Узел не найден', 'Node not found');
  refresh();
};
const choose = () => {
  target = undefined;
  text.value = kind.value === 'entity' ? 'New contact' : kind.value === 'callout' ? 'New information' : '{{customer}}';
  attribute.value = kind.value === 'entity' ? 'record-43' : kind.value === 'callout' ? 'info' : 'customer';
  refresh();
};
const insert = () => run(() => {
  if (!editor) return false;
  editor.setSelection(editor.getText().length);
  return bundle.commands(editor, kind.value).insert(text.value, attributes());
});
const update = () => run(() => !!target && bundle.update(target, text.value, attributes()));
const remove = () => run(() => !!target && bundle.remove(target));
const undo = () => { editor?.undo(); refresh(); };
const toggleReadOnly = () => { editor?.setReadOnly(readOnly.value); refresh(); };
const save = () => {
  if (!editor) return;
  snapshot = editor.getJSON();
  saved.value = JSON.stringify(snapshot, null, 2);
  status.value = t('Снимок сохранён в памяти', 'Snapshot saved in memory');
};
const reload = () => {
  if (!editor || !snapshot) return;
  editor.setJSON(snapshot);
  target = undefined;
  refresh();
  status.value = t('Снимок загружен с той же схемой', 'Snapshot reloaded with the same schema');
};
const publish = () => {
  if (!editor || !reader) return;
  try {
    const result = bundle.expand(editor.getJSON(), { customer: customer.value, order: order.value });
    reader.setJSON(result.document);
    status.value = result.unresolved.length ? t('Есть незаполненные переменные', 'Some variables are unresolved') : t('Показана копия с буквальными значениями', 'Showing a copy with literal values');
  }
  catch { status.value = t('Публикация отклонена. Прежний просмотр сохранён.', 'Publication refused. Previous view retained.'); }
};
onMounted(() => {
  if (!host.value || !readerHost.value) return;
  editor = createEditor(host.value, { value: initial, plugins: bundle.plugins, locale: lang.value === 'ru' ? 'ru' : 'en', label: t('Редактор прикладных расширений', 'Application extensions editor') });
  reader = createContentView(readerHost.value, { value: editor.getJSON(), schema: bundle.schema });
  stop = editor.subscribe(refresh);
  ready.value = true;
  inspect();
});
onBeforeUnmount(() => {
  stop?.();
  reader?.destroy();
  editor?.destroy();
  target = undefined;
  snapshot = undefined;
});
</script>

<template>
  <section class="application-extensions-example">
    <div class="extension-fields">
      <div class="extension-kind-field"><label :for="kindId">{{ t('Тип расширения', 'Extension kind') }}</label><select :id="kindId" v-model="kind" @change="choose"><option value="entity">{{ t('Сущность', 'Entity') }}</option><option value="callout">{{ t('Информационный блок', 'Callout') }}</option><option value="variable">{{ t('Переменная', 'Variable') }}</option></select></div>
      <label>{{ t('Текст узла', 'Node text') }}<input v-model="text"></label>
      <label>{{ attributeLabel }}<input v-model="attribute"></label>
    </div>
    <div class="extension-actions">
      <button type="button" :disabled="!ready" @click="inspect">{{ t('Выбрать первый узел', 'Inspect first node') }}</button>
      <button type="button" :disabled="!ready || readOnly" @click="insert">{{ t('Вставить в конец', 'Insert at end') }}</button>
      <button type="button" :disabled="!current || readOnly" @click="update">{{ t('Обновить выбранный', 'Update inspected') }}</button>
      <button type="button" :disabled="!current || readOnly" @click="remove">{{ t('Удалить выбранный', 'Remove inspected') }}</button>
      <button type="button" :disabled="!ready || readOnly" @click="undo">{{ t('Отменить', 'Undo') }}</button>
      <label><input v-model="readOnly" type="checkbox" @change="toggleReadOnly">{{ t('Только чтение', 'Read only') }}</label>
    </div>
    <p role="status">{{ status }}</p>
    <div ref="host" />
    <div class="extension-actions">
      <button type="button" :disabled="!ready" @click="save">{{ t('Сохранить JSON', 'Save JSON') }}</button>
      <button type="button" :disabled="!saved" @click="reload">{{ t('Загрузить JSON', 'Reload JSON') }}</button>
    </div>
    <details v-if="saved"><summary>{{ t('Сохранённый JSON', 'Saved JSON') }}</summary><pre class="application-extension-json">{{ saved }}</pre></details>
    <h3>{{ t('Публикация шаблона', 'Template publication') }}</h3>
    <p>{{ t('Значения подставляются только в копию для читателя. HTML-подобный текст остаётся текстом; редактор не меняется.', 'Values expand only in a copy for the reader. HTML-like input remains text; the editor is unchanged.') }}</p>
    <div class="extension-fields"><label>customer<input v-model="customer"></label><label>order<input v-model="order"></label></div>
    <button type="button" :disabled="!ready" @click="publish">{{ t('Показать с переменными', 'Publish with values') }}</button>
    <div ref="readerHost" class="application-extension-reader" />
  </section>
</template>

<style scoped>
.application-extensions-example { margin-block: 1.5rem; padding: 1rem; border: 1px solid var(--vp-c-divider); border-radius: 12px; }
.extension-fields, .extension-actions { display: flex; flex-wrap: wrap; gap: .6rem; margin-block: .8rem; }
.extension-fields > label, .extension-kind-field { display: grid; gap: .25rem; min-width: 0; flex: 1 1 160px; }
.extension-fields input, .extension-fields select { min-width: 0; width: 100%; padding: .4rem; border: 1px solid var(--vp-c-divider); border-radius: 6px; }
.extension-actions button, .application-extensions-example > button { padding: .4rem .65rem; border: 1px solid var(--vp-c-divider); border-radius: 6px; }
.extension-actions label { display: flex; gap: .35rem; align-items: center; }
.application-extension-reader { margin-top: 1rem; border: 1px solid var(--vp-c-divider); border-radius: 8px; padding: .75rem; }
.application-extension-json { overflow: auto; max-height: 20rem; }
.application-extensions-example :deep([data-mw-node="app:callout"]) { padding: .7rem 1rem; border-inline-start: 4px solid var(--mw-accent, #6658e8); background: var(--mw-hover, #f0f2f7); }
.application-extensions-example :deep([data-mw-node="app:callout"][data-tone="warning"]) { border-inline-start-color: #a66300; }
.application-extensions-example :deep(.mw-content [data-mw-node="app:entity"]), .application-extensions-example :deep(.mw-content [data-mw-node="app:variable"]) { background: var(--mw-hover, #f0f2f7); border-radius: 3px; }
</style>
