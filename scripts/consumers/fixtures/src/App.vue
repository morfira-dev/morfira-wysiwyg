<script setup lang="ts">
import { ref } from 'vue';
import { MorfiraEditor } from '@morfira-dev/wysiwyg/vue';
import { plugins, ready, changed } from './common.js';
const value = ref('<p>Initial</p>');
const readOnly = ref(false);
const mounted = ref(true);
let external = 0;
const replace = () => { value.value = `<p>External ${++external}</p>`; };
</script>
<template>
  <button data-action="external" @click="replace">External value</button>
  <button data-action="readonly" @click="readOnly = !readOnly">Read only</button>
  <button data-action="unmount" @click="mounted = false">Unmount</button>
  <MorfiraEditor v-if="mounted" v-model="value" :read-only="readOnly" :plugins="plugins" locale="en" label="Consumer editor" @ready="ready" @change="changed" />
</template>
