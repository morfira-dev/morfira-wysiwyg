<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useData } from 'vitepress';
import type { Editor } from '@morfira-dev/wysiwyg';
import type { MediaFormController, MediaViewController } from '@morfira-dev/wysiwyg/ui/media';
import type { FormulaFormController, FormulaViewController } from '@morfira-dev/wysiwyg/ui/formula';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/ui/media.css';
import '@morfira-dev/wysiwyg/ui/formula.css';

const { lang } = useData();
const ru = computed(() => lang.value === 'ru');
const t = (russian: string, english: string) => ru.value ? russian : english;
const host = ref<HTMLElement>();
const mediaHost = ref<HTMLElement>();
const formulaHost = ref<HTMLElement>();
const controls = ref<HTMLElement>();
const ready = ref(false);
const readonly = ref(false);
const html = ref('');
const status = ref('');
let editor: Editor | undefined;
let mediaForm: MediaFormController | undefined;
let formulaForm: FormulaFormController | undefined;
let mediaView: MediaViewController | undefined;
let formulaView: FormulaViewController | undefined;
let disposed = false;
const stops: (() => void)[] = [];

const report = (error: unknown) => { status.value = error instanceof Error ? error.message : String(error); };
const refresh = () => { if (editor) html.value = editor.getHTML(); };
const sample = () => {
  if (!editor) return;
  editor.setHTML('<p>Math: <span data-mw-node="morfira:formula">\\frac{1}{2}+x^2</span></p><figure data-mw-node="morfira:media" data-provider="youtube" data-video-id="M7lc1UVf-VE">YouTube API demo</figure><p><br></p>');
  editor.setSelection(0);
  status.value = '';
  refresh();
};
const endSelection = () => {
  if (!editor) return;
  const last = editor.surface.lastElementChild;
  if (!last) return;
  editor.focus();
  const range = editor.surface.ownerDocument.createRange();
  range.selectNodeContents(last);
  range.collapse(false);
  const selection = editor.surface.ownerDocument.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
};
const insertMedia = () => {
  endSelection();
  mediaForm?.open();
};
const insertFormula = () => {
  endSelection();
  formulaForm?.open();
};
const editFormula = () => {
  const target = editor?.surface.querySelector<HTMLElement>('[data-mw-node="morfira:formula"]');
  if (target) formulaForm?.open(target);
};
const undo = () => { editor?.undo(); refresh(); };
const toggleReadOnly = () => { editor?.setReadOnly(readonly.value); };

onMounted(async () => {
  const [{ createEditor }, { media }, { formulas }, mediaUI, formulaUI] = await Promise.all([
    import('@morfira-dev/wysiwyg'), import('@morfira-dev/wysiwyg/plugins/media'),
    import('@morfira-dev/wysiwyg/plugins/formula'), import('@morfira-dev/wysiwyg/ui/media'),
    import('@morfira-dev/wysiwyg/ui/formula'),
  ]);
  if (disposed || !host.value || !mediaHost.value || !formulaHost.value || !controls.value) return;
  try {
    editor = createEditor(host.value, {
      label: t('Редактор media и формул', 'Media and formula editor'), locale: ru.value ? 'ru' : 'en',
      plugins: [media(), formulas()],
    });
    mediaView = mediaUI.createMediaView(mediaHost.value, editor);
    formulaView = formulaUI.createFormulaView(formulaHost.value, editor, { display: 'block' });
    mediaForm = mediaUI.createMediaForm(controls.value, editor, { presentation: 'dialog', onError: report });
    formulaForm = formulaUI.createFormulaForm(controls.value, editor, { onError: report });
    stops.push(editor.subscribe(refresh));
    ready.value = true;
    sample();
  }
  catch (error) { report(error); }
});

onBeforeUnmount(() => {
  disposed = true;
  for (const stop of stops) stop();
  mediaForm?.destroy();
  formulaForm?.destroy();
  mediaView?.destroy();
  formulaView?.destroy();
  editor?.destroy();
});
</script>

<template>
  <section class="media-formula-example" :aria-label="t('Пример media и формул', 'Media and formula example')">
    <div class="media-formula-actions">
      <button type="button" :disabled="!ready || readonly" @click="sample">{{ t('Загрузить пример', 'Load sample') }}</button>
      <button type="button" :disabled="!ready || readonly" @click="insertMedia">{{ t('Вставить видео', 'Insert video') }}</button>
      <button type="button" :disabled="!ready || readonly" @click="insertFormula">{{ t('Вставить формулу', 'Insert formula') }}</button>
      <button type="button" :disabled="!ready || readonly" @click="editFormula">{{ t('Изменить формулу', 'Edit formula') }}</button>
      <button type="button" :disabled="!ready || readonly" @click="undo">{{ t('Отменить', 'Undo') }}</button>
      <label><input v-model="readonly" type="checkbox" @change="toggleReadOnly">{{ t('Только чтение', 'Read only') }}</label>
    </div>
    <div ref="host"></div>
    <p>{{ t('MathML и video preview размещены во внешних управляемых представлениях. В документе сохраняются проверенные источник формулы и ссылка на провайдера, а не iframe/MathML.', 'MathML and video previews use managed external views. The document stores validated formula source and provider references, not iframe/MathML markup.') }}</p>
    <div ref="formulaHost" class="formula-preview-host" :aria-label="t('Представления формул', 'Formula views')"></div>
    <div ref="mediaHost" class="media-preview-host" :aria-label="t('Представления видео', 'Video views')"></div>
    <p>{{ t('Видео не обращается к провайдеру до отдельного нажатия «Загрузить». Это действие создаёт внешний iframe; формулы не используют сеть.', 'Video does not contact its provider until the separate Load action. That action creates an external iframe; formulas use no network.') }}</p>
    <div ref="controls"></div>
    <p role="status">{{ status }}</p>
    <label>HTML<textarea readonly :value="html" rows="5" :aria-label="t('HTML media и формул', 'Media and formula HTML')"></textarea></label>
  </section>
</template>

<style scoped>
.media-formula-example { display: grid; gap: 12px; padding: 16px; border: 1px solid var(--vp-c-divider); border-radius: 12px; min-width: 0; }
.media-formula-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.media-formula-actions button { padding: 7px 10px; border: 1px solid var(--vp-c-divider); border-radius: 6px; background: var(--vp-c-bg); color: var(--vp-c-text-1); }
.media-formula-actions label { display: flex; align-items: center; gap: 6px; }
.media-formula-example > label { display: grid; gap: 4px; }
.media-formula-example textarea { width: 100%; box-sizing: border-box; font: 12px var(--vp-font-family-mono); background: var(--vp-c-bg); color: var(--vp-c-text-1); padding: 8px; border: 1px solid var(--vp-c-divider); border-radius: 6px; }
.media-formula-example :deep(.mw-editor) { --mw-surface: var(--vp-c-bg); --mw-text: var(--vp-c-text-1); --mw-border: var(--vp-c-divider); --mw-min-height: 100px; }
</style>
