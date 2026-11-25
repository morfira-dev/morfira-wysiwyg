<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import { useData } from 'vitepress';
import type { EditorDocument } from '@morfira-dev/wysiwyg';
import EditorFieldExample from './EditorFieldExample.vue';
import ContentViewExample from './ContentViewExample.vue';

const { lang } = useData();
const ru = computed(() => lang.value === 'ru');
const savedDocument = shallowRef<EditorDocument>();
const receiveSaved = (document: EditorDocument) => {
  savedDocument.value = document;
};
</script>

<template>
  <section class="publishing-workflow-example">
    <h3>{{ ru ? 'От черновика к публикации' : 'From draft to published content' }}</h3>
    <p>{{ ru
      ? 'Отредактируйте поле и сохраните его: принятый снимок появится в независимом просмотре ниже. Черновик и последняя сохранённая версия могут различаться. Хранилище и загрузка файлов в этом примере локальные, без отправки на сервер.'
      : 'Edit the field and save: the accepted snapshot appears in the independent view below. The draft and last saved version may differ. Storage and uploads in this example are local, with no server transport.' }}</p>
    <EditorFieldExample @saved="receiveSaved" />
    <ContentViewExample :document="savedDocument" />
  </section>
</template>

<style scoped>
.publishing-workflow-example { min-width: 0; }
.publishing-workflow-example > h3 { margin: 20px 0 12px; }
.publishing-workflow-example > p { line-height: 1.6; }
</style>
