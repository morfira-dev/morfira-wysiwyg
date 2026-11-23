<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue';
import { useData } from 'vitepress';
const { lang } = useData();
const ru = computed(() => lang.value === 'ru');
const sourceOpen = ref(false);
const inlineViewsOpen = ref(false);
const SourceEditingExample = defineAsyncComponent(() => import('./SourceEditingExample.vue'));
const InlineNodeViewsExample = defineAsyncComponent(() => import('./InlineNodeViewsExample.vue'));
const toggleSource = (event: Event) => { sourceOpen.value = (event.currentTarget as HTMLDetailsElement).open; };
const toggleInlineViews = (event: Event) => { inlineViewsOpen.value = (event.currentTarget as HTMLDetailsElement).open; };
const mediaOpen = ref(false);
const markdownOpen = ref(false);
const quoteOpen = ref(false);
const navigationOpen = ref(false);
const textToolsOpen = ref(false);
const codeBlocksOpen = ref(false);
const MediaFormulaExample = defineAsyncComponent(() => import('./MediaFormulaExample.vue'));
const AdvancedMarkdownExample = defineAsyncComponent(() => import('./AdvancedMarkdownExample.vue'));
const TextToolsExample = defineAsyncComponent(() => import('./TextToolsExample.vue'));
const CodeBlocksExample = defineAsyncComponent(() => import('./CodeBlocksExample.vue'));
const BlockNavigationExample = defineAsyncComponent(() => import('./BlockNavigationExample.vue'));
const toggleNavigation = (event: Event) => { navigationOpen.value = (event.currentTarget as HTMLDetailsElement).open; };
const toggleTextTools = (event: Event) => { textToolsOpen.value = (event.currentTarget as HTMLDetailsElement).open; };
const toggleCodeBlocks = (event: Event) => { codeBlocksOpen.value = (event.currentTarget as HTMLDetailsElement).open; };
const ListQuoteInputExample = defineAsyncComponent(() => import('./ListQuoteInputExample.vue'));
const toggleMedia = (event: Event) => { mediaOpen.value = (event.currentTarget as HTMLDetailsElement).open; };
const toggleMarkdown = (event: Event) => { markdownOpen.value = (event.currentTarget as HTMLDetailsElement).open; };
const toggleQuote = (event: Event) => { quoteOpen.value = (event.currentTarget as HTMLDetailsElement).open; };
</script>

<template>
  <section class="home-optional-examples">
    <h2>{{ ru ? 'Дополнительные примеры' : 'Additional examples' }}</h2>
    <p>{{ ru ? 'Откройте нужный раздел, чтобы запустить дополнительный редактор с выбранными возможностями.' : 'Open a section to start an additional editor with the selected capabilities.' }}</p>
    <details @toggle="toggleSource"><summary>{{ ru ? 'Безопасный HTML-исходник' : 'Safe HTML source editing' }}</summary><SourceEditingExample v-if="sourceOpen" /></details>
    <details @toggle="toggleInlineViews"><summary>{{ ru ? 'Узлы внутри области редактирования' : 'Node views inside the editor' }}</summary><InlineNodeViewsExample v-if="inlineViewsOpen" /></details>
    <details @toggle="toggleNavigation"><summary>{{ ru ? 'Навигация вокруг изображений и объектов' : 'Navigation around images and objects' }}</summary><BlockNavigationExample v-if="navigationOpen" /></details>
    <details @toggle="toggleTextTools"><summary>{{ ru ? 'Интервалы и перенос форматирования' : 'Paragraph layout and format painter' }}</summary><TextToolsExample v-if="textToolsOpen" /></details>
    <details @toggle="toggleCodeBlocks"><summary>{{ ru ? 'Блоки кода и подсветка' : 'Code blocks and highlighting' }}</summary><CodeBlocksExample v-if="codeBlocksOpen" /></details>
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
