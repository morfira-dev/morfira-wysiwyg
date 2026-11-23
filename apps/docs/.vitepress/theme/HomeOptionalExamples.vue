<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue';
import { useData } from 'vitepress';
const { lang } = useData();
const ru = computed(() => lang.value === 'ru');
const mediaOpen = ref(false);
const markdownOpen = ref(false);
const quoteOpen = ref(false);
const MediaFormulaExample = defineAsyncComponent(() => import('./MediaFormulaExample.vue'));
const AdvancedMarkdownExample = defineAsyncComponent(() => import('./AdvancedMarkdownExample.vue'));
const ListQuoteInputExample = defineAsyncComponent(() => import('./ListQuoteInputExample.vue'));
const toggleMedia = (event: Event) => { mediaOpen.value = (event.currentTarget as HTMLDetailsElement).open; };
const toggleMarkdown = (event: Event) => { markdownOpen.value = (event.currentTarget as HTMLDetailsElement).open; };
const toggleQuote = (event: Event) => { quoteOpen.value = (event.currentTarget as HTMLDetailsElement).open; };
</script>

<template>
  <section class="home-optional-examples">
    <h2>{{ ru ? 'Дополнительные примеры' : 'Additional examples' }}</h2>
    <p>{{ ru ? 'Откройте нужный раздел, чтобы запустить дополнительный редактор с выбранными возможностями.' : 'Open a section to start an additional editor with the selected capabilities.' }}</p>
    <details @toggle="toggleMedia"><summary>{{ ru ? 'Видео и математические формулы' : 'Video and mathematical formulas' }}</summary><MediaFormulaExample v-if="mediaOpen" /></details>
    <details @toggle="toggleMarkdown"><summary>{{ ru ? 'Расширенный Markdown: импорт и экспорт' : 'Extended Markdown import and export' }}</summary><AdvancedMarkdownExample v-if="markdownOpen" /></details>
    <details @toggle="toggleQuote"><summary>{{ ru ? 'Удаление на границах цитат в списке' : 'Deletion at list quote boundaries' }}</summary><ListQuoteInputExample v-if="quoteOpen" /></details>
  </section>
</template>

<style scoped>
.home-optional-examples { margin: 24px 0; }
.home-optional-examples details { margin: 12px 0; }
.home-optional-examples summary { padding: 12px; cursor: pointer; border: 1px solid var(--vp-c-divider); border-radius: 8px; font-weight: 600; }
</style>
