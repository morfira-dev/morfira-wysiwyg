<script setup lang="ts">
import { ref } from 'vue';
import { MorfiraEditor } from '@morfira-dev/wysiwyg/vue';
import type { Editor } from '@morfira-dev/wysiwyg';
import { createRecipeBundle } from '../index.js';
import { createLocalRecipeServices } from '../local-services.js';
const props = defineProps<{ onReady?: (editor: Editor) => void; locale?: string }>();
const value = ref('<p>Recipe editor</p>');
const services = createLocalRecipeServices();
const bundle = createRecipeBundle(services.options);
const ready = (editor: Editor) => props.onReady?.(editor);
</script>
<template><MorfiraEditor v-model="value" :locale="locale ?? 'en'" :plugins="bundle.plugins" label="Recipe editor" @ready="ready" /></template>
