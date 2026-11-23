<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useData } from 'vitepress';
import { createEditor } from '@morfira-dev/wysiwyg';
import type { Editor } from '@morfira-dev/wysiwyg';
import { imageCommands } from '@morfira-dev/wysiwyg/plugins/images';
import { mentionCommands, getMentions } from '@morfira-dev/wysiwyg/plugins/mentions';
import { createSuggestionMenu } from '@morfira-dev/wysiwyg/plugins/suggestions';
import { saveStateCommands } from '@morfira-dev/wysiwyg/plugins/save-state';
import { codeBlocks } from '@morfira-dev/wysiwyg/plugins/code-blocks';
import { createCodeBlockView } from '@morfira-dev/wysiwyg/ui/code-blocks';
import type { CodeBlockViewController } from '@morfira-dev/wysiwyg/ui/code-blocks';
import { createLazyHighlight, createRecipeBundle } from './recipes/index.js';
import { createLocalRecipeServices } from './recipes/local-services.js';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/plugins/suggestions.css';
import '@morfira-dev/wysiwyg/ui/code-blocks.css';
const { lang } = useData();
const t = (ru: string, en: string) => lang.value === 'ru' ? ru : en;
const host = ref<HTMLElement>();
const viewHost = ref<HTMLElement>();
const html = ref('');
const status = ref('saved');
const error = ref('');
const clientVersion = ref('v1');
const remoteVersion = ref('v1');
const uploading = ref(false);
const progress = ref(0);
const highlighted = ref(false);
const mentions = ref('');
const ready = ref(false);
let editor: Editor | undefined;
let view: CodeBlockViewController | undefined;
let request: AbortController | undefined;
let disposed = false;
const cleanups: (() => void)[] = [];
const report = (failure: unknown) => {
  error.value = failure instanceof Error && failure.message === 'VERSION_CONFLICT'
    ? t('Конфликт версий: загрузите серверную версию явно.', 'Version conflict: explicitly reload the server version.')
    : t('Операция отклонена или отменена.', 'The operation was rejected or cancelled.');
};
const services = createLocalRecipeServices(report);
const bundle = createRecipeBundle(services.options);
const refresh = () => {
  if (!editor || disposed) return;
  html.value = editor.getHTML();
  status.value = saveStateCommands(editor).getState().status;
  clientVersion.value = services.session.getVersion();
  remoteVersion.value = services.getRemoteVersion();
  mentions.value = getMentions(editor).map((mention) => `${mention.id}: ${mention.text}`).join(', ');
};
const localEdit = () => {
  if (!editor) return;
  editor.transact((surface) => {
    const paragraph = document.createElement('p');
    paragraph.textContent = 'Local edit';
    surface.append(paragraph);
  });
  refresh();
};
const insertRecord = () => {
  if (!editor) return;
  editor.setSelection(0);
  bundle.insertRecord(editor, { id: 'issue_42', label: 'ISSUE-42' });
  refresh();
};
const openMentions = () => {
  if (!editor) return;
  editor.setSelection(editor.surface.textContent?.length ?? 0);
  editor.insertHTML(' @Al');
  mentionCommands(editor).open();
};
const save = async (retry = false) => {
  if (!editor) return;
  error.value = '';
  await (retry ? saveStateCommands(editor).retry() : saveStateCommands(editor).save());
  if (!disposed) refresh();
};
const remoteEdit = () => { services.simulateRemoteChange(); refresh(); };
const reload = async () => {
  if (!editor) return;
  request?.abort();
  const controller = new AbortController();
  request = controller;
  const current = editor;
  const before = current.getHTML();
  let changed = false;
  const stop = current.subscribe(() => { changed = true; });
  try {
    const result = await services.session.reload(controller.signal);
    if (disposed || request !== controller || changed || current.getHTML() !== before) throw new Error('Local edits changed during reload.');
    const document = current.schema.validateDocument(result.document);
    current.setJSON(document);
    services.session.acceptReload(result);
    error.value = '';
    refresh();
  }
  catch (failure) { if (!disposed && request === controller) report(failure); }
  finally { stop(); if (request === controller) request = undefined; }
};
const upload = async () => {
  if (!editor || uploading.value) return;
  uploading.value = true;
  try {
    editor.setSelection(0);
    const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFz8AAAAASUVORK5CYII='), (character) => character.charCodeAt(0));
    await imageCommands(editor).upload(new File([bytes], 'example.png', { type: 'image/png' }), {
      onProgress: ({ loaded, total }) => { if (!disposed) progress.value = total ? Math.round(loaded / total * 100) : 0; },
    });
  }
  catch (failure) { if (!disposed) report(failure); }
  finally { if (!disposed) { uploading.value = false; refresh(); } }
};
const highlight = () => {
  if (!editor || view || !viewHost.value) return;
  view = createCodeBlockView(viewHost.value, editor, { highlight: createLazyHighlight(() => import('./recipes/highlight-provider.js')), onError: report });
  highlighted.value = true;
};
const conflict = computed(() => error.value.length > 0);
onMounted(() => {
  if (disposed || !host.value) return;
  editor = createEditor(host.value, { locale: lang.value === 'ru' ? 'ru' : 'en', label: t('Рецепты расширений', 'Extension recipes'),
    value: '<p>Application-owned extensions</p><pre data-mw-node="morfira:code-block" data-language="typescript">const record = "ISSUE-42";</pre><p>Mentions: </p>',
    plugins: [...bundle.plugins, codeBlocks()] });
  cleanups.push(editor.subscribe(refresh), saveStateCommands(editor).subscribe(refresh), createSuggestionMenu(editor, mentionCommands(editor)));
  ready.value = true;
  refresh();
});
watch(lang, () => editor?.setLocale(lang.value === 'ru' ? 'ru' : 'en'));
onBeforeUnmount(() => {
  disposed = true;
  request?.abort();
  view?.destroy();
  for (const cleanup of cleanups.reverse()) cleanup();
  editor?.destroy();
});
</script>
<template>
  <section class="recipes-example" :aria-label="t('Рецепты расширений', 'Extension recipes')">
    <p>{{ t('Все сервисы в этой демке локальные: пользовательские файлы и документы никуда не отправляются.', 'All services in this demo are local: no user files or documents are uploaded.') }}</p>
    <div class="recipes-controls">
      <button :disabled="!ready" @click="insertRecord">{{ t('Вставить узел с ID', 'Insert node with ID') }}</button>
      <button :disabled="!ready" @click="openMentions">{{ t('Найти @Alice', 'Find @Alice') }}</button>
      <button :disabled="!ready || uploading" @click="upload">{{ t('Имитировать загрузку', 'Simulate upload') }}</button>
      <button :disabled="!ready || highlighted" @click="highlight">{{ t('Ленивая подсветка', 'Lazy highlighting') }}</button>
      <button :disabled="!ready" @click="localEdit">{{ t('Локальное изменение', 'Local edit') }}</button>
      <button :disabled="!ready || status === 'saving'" @click="save(false)">{{ t('Сохранить', 'Save') }}</button>
      <button :disabled="!ready" @click="remoteEdit">{{ t('Изменить на сервере', 'Simulate remote edit') }}</button>
      <button :disabled="!ready || !conflict" @click="save(true)">{{ t('Повторить сохранение', 'Retry save') }}</button>
      <button :disabled="!ready || status === 'saving'" @click="reload">{{ t('Загрузить серверную версию', 'Reload server version') }}</button>
    </div>
    <p class="recipes-save-status" aria-live="polite">{{ t('Состояние', 'Status') }}: {{ status }} · {{ t('Локальная версия', 'Local version') }}: {{ clientVersion }} · {{ t('Сервер', 'Server') }}: {{ remoteVersion }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p>{{ t('Прогресс имитации', 'Simulated progress') }}: {{ progress }}%</p>
    <p v-if="mentions" class="recipe-mentions">{{ mentions }}</p>
    <div ref="host" />
    <div ref="viewHost" class="recipe-code-view" />
    <label>{{ t('HTML рецептов', 'Recipes HTML') }}<textarea :value="html" readonly rows="5" /></label>
  </section>
</template>
<style scoped>
.recipes-example { min-width: 0; padding: 12px; border: 1px solid var(--vp-c-divider); border-radius: 10px; }
.recipes-controls { display: flex; flex-wrap: wrap; gap: 8px; margin-block: 12px; }
.recipes-controls button { min-height: 36px; padding: 5px 9px; color: var(--vp-c-text-1); background: var(--vp-c-bg-soft); border: 1px solid var(--vp-c-divider); border-radius: 6px; font: inherit; }
.recipes-controls button:focus-visible { outline: 2px solid var(--vp-c-brand-1); outline-offset: 2px; }
.recipes-controls button:disabled { opacity: .5; }
.recipes-example textarea { width: 100%; box-sizing: border-box; font-family: monospace; }
@media (pointer: coarse) { .recipes-controls button { min-height: 44px; } }
</style>
