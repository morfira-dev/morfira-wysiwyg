<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId } from 'vue';
import { useData, withBase } from 'vitepress';
import { MorfiraEditor } from '@morfira-dev/wysiwyg/vue';
import type { Editor, EditorDocument } from '@morfira-dev/wysiwyg';
import { createStandardPreset } from '@morfira-dev/wysiwyg/presets/standard';
import { createStandardEditorUI } from '@morfira-dev/wysiwyg/ui/standard';
import type { StandardEditorUIController } from '@morfira-dev/wysiwyg/ui/standard';
import { saveState, saveStateCommands } from '@morfira-dev/wysiwyg/plugins/save-state';
import type { SaveStateSnapshot } from '@morfira-dev/wysiwyg/plugins/save-state';
import { imageCommands } from '@morfira-dev/wysiwyg/plugins/images';
import { connectEditorField, editorFieldPlainText } from './editor-field/index.js';
import type { EditorFieldSemantics } from './editor-field/types.js';
import { createLocalEditorFieldServices } from './editor-field/local-services.js';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/plugins/tables.css';
import '@morfira-dev/wysiwyg/ui/editor.css';
import '@morfira-dev/wysiwyg/ui/forms.css';

const emit = defineEmits<{ saved: [document: EditorDocument] }>();
const { lang } = useData();
const t = (ru: string, en: string) => lang.value === 'ru' ? ru : en;
const id = useId();
const labelId = `article-label-${id}`;
const helpId = `article-help-${id}`;
const errorId = `article-error-${id}`;
const value = ref('<p>Application-owned draft.</p>');
const readOnly = ref(false);
const toolbarHost = ref<HTMLElement>();
const validationError = ref(false);
const uploadBusy = ref(false);
const uploadProgress = ref(0);
const uploadError = ref(false);
const ready = ref(false);
const savedText = ref('Application-owned draft.');
const state = ref<SaveStateSnapshot>({ status: 'saved', dirty: false, revision: 0, savedRevision: 0 });
const initial: EditorDocument = { version: 1, children: [{ type: 'element', tag: 'p', attributes: {}, children: [{ type: 'text', text: 'Application-owned draft.' }] }] };
const services = createLocalEditorFieldServices(initial, withBase('/logo.svg'));
const preset = createStandardPreset({ images: { upload: services.upload }, plugins: [saveState({ save: services.save })] });
let editor: Editor | undefined;
let ui: StandardEditorUIController | undefined;
let semantics: EditorFieldSemantics | undefined;
let unsubscribe: (() => void) | undefined;
let disposed = false;
let generation = 0;
let lastEmittedRevision = -1;
const error = computed(() => validationError.value
  ? t('Добавьте текст перед сохранением.', 'Add some text before saving.')
  : state.value.status === 'error' ? t('Не удалось сохранить. Попробуйте ещё раз.', 'Could not save. Try again.') : '');
const status = computed(() => {
  const statuses = {
    saved: t('Сохранено', 'Saved'), dirty: t('Есть изменения', 'Unsaved changes'),
    saving: t('Сохранение…', 'Saving…'), error: t('Ошибка сохранения', 'Save failed'),
  };
  return statuses[state.value.status];
});
const refreshSemantics = () => semantics?.setInvalid(Boolean(error.value));
const changed = () => {
  if (validationError.value && editor?.getText().trim()) validationError.value = false;
  refreshSemantics();
};
const onReady = (instance: Editor) => {
  editor = instance;
  semantics = connectEditorField(instance, { labelId, descriptionId: helpId, errorId });
  if (toolbarHost.value) ui = createStandardEditorUI(toolbarHost.value, instance, { presentation: 'floating', overflow: 'more' });
  unsubscribe = saveStateCommands(instance).subscribe((snapshot) => {
    if (disposed) return;
    state.value = snapshot;
    refreshSemantics();
  });
  ready.value = true;
};
const save = async () => {
  const current = editor;
  if (!current || disposed) return;
  validationError.value = !current.getText().trim();
  refreshSemantics();
  if (validationError.value) {
    current.focus();
    return;
  }
  const attempt = generation;
  const accepted = await saveStateCommands(current).save();
  if (!accepted || disposed || generation !== attempt || editor !== current) return;
  const snapshot = saveStateCommands(current).getState();
  if (snapshot.savedRevision === lastEmittedRevision) return;
  lastEmittedRevision = snapshot.savedRevision;
  const saved = current.schema.validateDocument(services.getSaved());
  // Keep persisted evidence separate from newer unsaved controlled-value edits.
  savedText.value = editorFieldPlainText(saved);
  emit('saved', structuredClone(saved));
};
const restore = () => {
  if (!editor || disposed) return;
  generation++;
  const saved = editor.schema.validateDocument(services.getSaved());
  // Same-value setJSON is intentionally a no-op; explicitly cancel acknowledgement
  // first, so Restore also cancels a pending save of that unchanged baseline.
  saveStateCommands(editor).markSaved();
  editor.setJSON(saved);
  value.value = editor.getHTML();
  validationError.value = false;
  refreshSemantics();
};
const upload = async () => {
  const current = editor;
  if (!current || disposed || uploadBusy.value) return;
  uploadBusy.value = true;
  uploadError.value = false;
  try {
    current.focus();
    current.setSelection(current.getText().length);
    await imageCommands(current).upload(new File(['local-placeholder'], 'local-example.png', { type: 'image/png' }), {
      onProgress: ({ loaded, total }) => { if (!disposed) uploadProgress.value = total ? Math.round(loaded / total * 100) : 0; },
    });
  }
  catch {
    if (!disposed) uploadError.value = true;
  }
  finally {
    if (!disposed) uploadBusy.value = false;
  }
};
const cancelUpload = () => { if (editor) imageCommands(editor).cancelUpload(); };
onBeforeUnmount(() => {
  disposed = true;
  generation++;
  unsubscribe?.();
  ui?.destroy();
  semantics?.destroy();
  services.destroy();
});
</script>

<template>
  <form class="editor-field-example" @submit.prevent="save">
    <p :id="labelId" class="field-label">{{ t('Текст публикации', 'Publication body') }}</p>
    <p :id="helpId" class="field-help">{{ t('Добавьте текст. Изображения необязательны; сохранение и загрузка здесь имитируются локально.', 'Add some text. Images are optional; saving and upload are simulated locally here.') }}</p>
    <div ref="toolbarHost" />
    <MorfiraEditor v-model="value" :locale="lang === 'ru' ? 'ru' : 'en'" :read-only="readOnly" :plugins="preset.plugins" :label="t('Текст публикации', 'Publication body')" @ready="onReady" @change="changed" />
    <p v-show="error" :id="errorId" class="field-error" role="alert">{{ error }}</p>
    <div class="field-actions">
      <label><input v-model="readOnly" type="checkbox"> {{ t('Только чтение', 'Read only') }}</label>
      <button type="submit" :disabled="!ready || state.status === 'saving'">{{ state.status === 'error' ? t('Повторить сохранение', 'Retry save') : t('Сохранить публикацию', 'Save publication') }}</button>
      <button type="button" :disabled="!ready" @click="restore">{{ t('Восстановить сохранённое', 'Restore saved') }}</button>
      <button type="button" :disabled="!ready || state.status === 'saving'" @click="services.failNextSave()">{{ t('Следующее сохранение с ошибкой', 'Fail next save') }}</button>
      <button type="button" :disabled="!ready || readOnly || uploadBusy" @click="upload">{{ t('Имитировать загрузку изображения', 'Simulate image upload') }}</button>
      <button v-if="uploadBusy" type="button" @click="cancelUpload">{{ t('Отменить загрузку', 'Cancel upload') }}</button>
    </div>
    <p class="field-status" role="status">{{ status }}<span v-if="uploadBusy"> · {{ t('Загрузка', 'Upload') }}: {{ uploadProgress }}%</span></p>
    <p v-if="uploadError" role="alert">{{ t('Загрузка не выполнена.', 'Upload did not complete.') }}</p>
    <details><summary>{{ t('Последний сохранённый текст', 'Last saved text') }}</summary><pre class="field-saved">{{ savedText }}</pre></details>
  </form>
</template>

<style scoped>
.editor-field-example { border: 1px solid var(--vp-c-divider); border-radius: 12px; padding: 16px; margin: 24px 0; }
.field-label { font-weight: 650; margin: 0 0 6px; }
.field-help { font-size: 14px; color: var(--vp-c-text-2); }
.field-error { color: var(--vp-c-danger-1); margin: 8px 0; }
.field-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 12px; }
.field-actions button { border: 1px solid var(--vp-c-divider); border-radius: 6px; padding: 6px 10px; }
.field-actions button:disabled { opacity: .5; cursor: default; }
.field-status { font-size: 14px; }
.field-saved { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
