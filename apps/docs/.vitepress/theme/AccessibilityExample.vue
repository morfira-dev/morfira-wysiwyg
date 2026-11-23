<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useData } from 'vitepress';
import type { Editor } from '@morfira-dev/wysiwyg';
import type { StandardEditorUIController } from '@morfira-dev/wysiwyg/ui/standard';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/plugins/tables.css';
import '@morfira-dev/wysiwyg/ui/editor.css';
import '@morfira-dev/wysiwyg/ui/forms.css';

const { lang } = useData();
const ru = computed(() => lang.value === 'ru');
const t = (russian: string, english: string) => ru.value ? russian : english;
const editorHost = ref<HTMLElement>();
const toolbarHost = ref<HTMLElement>();
const width = ref('full');
const density = ref<'comfortable' | 'compact'>('comfortable');
const locale = ref(ru.value ? 'ru' : 'en');
const readOnly = ref(false);
const ready = ref(false);
const error = ref('');
const hostStyle = computed(() => ({ maxWidth: width.value === 'full' ? '100%' : `${width.value}px` }));
let editor: Editor | undefined;
let ui: StandardEditorUIController | undefined;
let createUI: typeof import('@morfira-dev/wysiwyg/ui/standard').createStandardEditorUI | undefined;
let disposed = false;
const mountUI = () => {
  if (!editor || !toolbarHost.value || !createUI) return;
  ui?.destroy();
  ui = undefined;
  ui = createUI(toolbarHost.value, editor, {
    density: density.value,
    overflow: 'more',
    presentation: 'floating',
    onError: (cause) => { error.value = cause instanceof Error ? cause.message : t('Действие отклонено.', 'Action rejected.'); },
  });
};
const updateLocale = () => { editor?.setLocale(locale.value); };
const updateReadOnly = () => { editor?.setReadOnly(readOnly.value); };
const focusEditor = () => { editor?.focus(); };
onMounted(async () => {
  const [{ createEditor }, { createStandardPreset }, standardUI] = await Promise.all([
    import('@morfira-dev/wysiwyg'),
    import('@morfira-dev/wysiwyg/presets/standard'),
    import('@morfira-dev/wysiwyg/ui/standard'),
  ]);
  if (disposed || !editorHost.value) return;
  createUI = standardUI.createStandardEditorUI;
  editor = createEditor(editorHost.value, createStandardPreset({
    locale: locale.value,
    label: t('Текст лаборатории доступности', 'Accessibility laboratory text'),
    value: t('<h2>Доступное редактирование</h2><p>Выделите этот текст. Проверьте панель клавиатурой и уменьшите контейнер.</p>', '<h2>Accessible authoring</h2><p>Select this text. Explore the toolbar with a keyboard and narrow the container.</p>'),
  }));
  mountUI();
  ready.value = true;
});
onBeforeUnmount(() => {
  disposed = true;
  ui?.destroy();
  ui = undefined;
  editor?.destroy();
  editor = undefined;
  createUI = undefined;
});
</script>

<template>
  <section class="accessibility-example" :aria-label="t('Лаборатория доступности', 'Accessibility laboratory')">
    <div class="accessibility-controls">
      <label>{{ t('Ширина контейнера', 'Host width') }}<select v-model="width" :aria-label="t('Ширина контейнера', 'Host width')"><option value="full">{{ t('Вся ширина', 'Full width') }}</option><option value="480">480 px</option><option value="320">320 px</option></select></label>
      <label>{{ t('Плотность панели', 'Toolbar density') }}<select :aria-label="t('Плотность панели', 'Toolbar density')" v-model="density" :disabled="!ready" @change="mountUI"><option value="comfortable">{{ t('Комфортная', 'Comfortable') }}</option><option value="compact">{{ t('Компактная', 'Compact') }}</option></select></label>
      <label>{{ t('Язык редактора', 'Editor language') }}<select :aria-label="t('Язык редактора', 'Editor language')" v-model="locale" :disabled="!ready" @change="updateLocale"><option value="ru">Русский</option><option value="en">English</option></select></label>
      <label class="accessibility-check"><input v-model="readOnly" type="checkbox" :disabled="!ready" @change="updateReadOnly">{{ t('Только чтение', 'Read only') }}</label>
      <button type="button" :disabled="!ready" @click="focusEditor">{{ t('Фокус в редактор', 'Focus editor') }}</button>
    </div>
    <p>{{ t('Tab / Shift+Tab — между областями. В панели: ← / →, Home / End. В select и поле цвета сохраняются обычные клавиши; Alt+← / Alt+→ переключают элементы панели. Escape возвращает фокус из панели в редактор. Compact уменьшает элементы на desktop; при pointer: coarse минимальная ширина и высота элементов панели — 44 CSS px. Реальное сенсорное устройство всё равно требует ручной проверки.', 'Tab / Shift+Tab move between regions. In the toolbar: ← / →, Home / End. Selects and color inputs retain native keys; Alt+← / Alt+→ move between toolbar controls. Escape returns toolbar focus to the editor. Compact reduces desktop controls; pointer: coarse keeps toolbar controls at least 44 CSS px wide and high. Real touch devices still need manual testing.') }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <div class="accessibility-editor-frame" :style="hostStyle">
      <div ref="toolbarHost" class="accessibility-toolbar-host" />
      <div ref="editorHost" class="accessibility-content-host" />
    </div>
    <p role="status">{{ ready ? t('Лаборатория готова. Изменение плотности пересоздаёт только панель.', 'Laboratory ready. Changing density recreates only the toolbar.') : t('Загрузка редактора…', 'Loading editor…') }}</p>
  </section>
</template>

<style scoped>
.accessibility-example { min-width: 0; max-width: 100%; border: 1px solid var(--vp-c-divider); border-radius: 12px; padding: 12px; }
.accessibility-controls { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; }
.accessibility-controls label { display: flex; flex-direction: column; min-width: 0; max-width: 100%; gap: 4px; }
.accessibility-controls .accessibility-check { flex-direction: row; align-items: center; align-self: center; }
.accessibility-controls select, .accessibility-controls button { font: inherit; max-width: 100%; min-height: 36px; border: 1px solid var(--vp-c-divider); border-radius: 6px; padding: 4px 8px; background: var(--vp-c-bg); }
.accessibility-controls :focus-visible { outline: 2px solid var(--vp-c-brand-1); outline-offset: 2px; }
.accessibility-controls :disabled { opacity: .5; }
.accessibility-editor-frame { width: 100%; min-width: 0; margin-inline: auto; }
.accessibility-toolbar-host { min-width: 0; }
.accessibility-content-host { min-width: 0; min-height: 180px; padding: 12px; border: 1px solid var(--vp-c-divider); border-radius: 8px; overflow-wrap: anywhere; }
.accessibility-content-host :deep(.mw-content) { min-width: 0; font-family: var(--mw-font); font-size: var(--mw-font-size); }
.accessibility-content-host :deep(.mw-content h2) { border: 0; padding: 0; }
.accessibility-content-host :deep(.mw-content p) { margin: 0 0 .65em; line-height: var(--mw-line-height); }
</style>
