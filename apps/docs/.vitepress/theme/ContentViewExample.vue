<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useData } from 'vitepress';
import type { EditorDocument } from '@morfira-dev/wysiwyg';
import { createContentView } from '@morfira-dev/wysiwyg/content-view';
import type { ContentViewController } from '@morfira-dev/wysiwyg/content-view';
import '@morfira-dev/wysiwyg/content-view.css';

const props = defineProps<{ document?: EditorDocument }>();
const { lang } = useData();
const english = computed(() => !lang.value.startsWith('ru'));
const t = (ru: string, en: string) => english.value ? en : ru;
const host = ref<HTMLElement>();
const allowImages = ref(false);
const failed = ref(false);
const shown = ref(false);
const exported = ref('');
let view: ContentViewController | undefined;
const sample = (): string => english.value
  ? '<h2>Published article</h2><p>Saved content works without an editor. <a href="https://example.com">A reference</a>.</p><table><tbody><tr><th scope="col">Item</th><th scope="col">Value</th></tr><tr><td>Storage</td><td>Schema-v1 JSON</td></tr></tbody></table><figure><img src="/logo.svg" alt="Morfira logo"><figcaption>Images stay omitted until explicitly enabled.</figcaption></figure>'
  : '<h2>Опубликованная статья</h2><p>Сохранённый контент работает без редактора. <a href="https://example.com">Ссылка на источник</a>.</p><table><tbody><tr><th scope="col">Поле</th><th scope="col">Значение</th></tr><tr><td>Хранение</td><td>JSON схемы v1</td></tr></tbody></table><figure><img src="/logo.svg" alt="Логотип Morfira"><figcaption>Изображения скрыты до явного разрешения.</figcaption></figure>';
const mount = () => {
  if (!host.value) return;
  const value = view?.getJSON() ?? props.document ?? sample();
  view?.destroy();
  view = undefined;
  try {
    view = createContentView(host.value, {
      value,
      images: allowImages.value ? 'load' : 'omit',
      imagePlaceholder: t('[Изображение]', '[Image]'),
      label: t('Опубликованный контент', 'Published content'),
    });
    failed.value = false;
    shown.value = true;
  }
  catch {
    failed.value = true;
  }
};
const reload = () => {
  if (!view) return;
  try {
    if (props.document) view.setJSON(props.document);
    else view.setJSON(JSON.parse(JSON.stringify(view.getJSON())) as EditorDocument);
    failed.value = false;
    shown.value = true;
  }
  catch { failed.value = true; }
};
const exportJSON = () => {
  if (view) exported.value = JSON.stringify(view.getJSON(), null, 2);
};
watch(() => props.document, (value) => {
  if (!value || !view) return;
  try {
    view.setJSON(value);
    exported.value = '';
    failed.value = false;
    shown.value = true;
  }
  catch { failed.value = true; }
});
watch(allowImages, mount);
onMounted(mount);
onBeforeUnmount(() => view?.destroy());
</script>

<template>
  <section class="content-view-example">
    <h3>{{ t('Контент для читателя', 'Content for the reader') }}</h3>
    <p>{{ t('Отдельное представление сохранённого JSON. Редактор и его панель здесь не создаются.', 'An independent view of saved JSON. No editor or toolbar is created here.') }}</p>
    <div class="content-view-controls">
      <button type="button" @click="reload">{{ t('Перезагрузить сохранённую копию', 'Reload saved copy') }}</button>
      <button type="button" @click="exportJSON">{{ t('Показать сохранённый JSON', 'Show saved JSON') }}</button>
      <label><input v-model="allowImages" type="checkbox"> {{ t('Разрешить загрузку изображений', 'Allow image requests') }}</label>
    </div>
    <p role="status">{{ failed ? t('Документ отклонён. Прежнее содержимое сохранено.', 'Document rejected. Previous content retained.') : shown ? t('Сохранённый контент отображён', 'Saved content displayed') : '' }}</p>
    <div ref="host" class="content-view-host" />
    <pre v-if="exported" class="content-view-json">{{ exported }}</pre>
  </section>
</template>

<style scoped>
.content-view-example { margin-block: 1.5rem; padding: 1rem; border: 1px solid var(--vp-c-divider); border-radius: 12px; }
.content-view-controls { display: flex; align-items: center; flex-wrap: wrap; gap: .5rem; }
.content-view-controls button { padding: .4rem .65rem; border: 1px solid var(--vp-c-divider); border-radius: 6px; }
.content-view-controls label { display: flex; align-items: center; gap: .4rem; }
.content-view-host { padding: 1rem; background: var(--mw-surface, #fff); border: 1px solid var(--vp-c-divider); border-radius: 8px; }
.content-view-json { max-height: 18rem; overflow: auto; font-size: .8rem; }
</style>
