<script lang="ts">
import type { Props } from './types.js';
import { onMount } from 'svelte';
import { createEditor } from '@morfira-dev/wysiwyg-core';
import type { Editor } from '@morfira-dev/wysiwyg-core';

let { value = $bindable(''), readOnly = false, placeholder, label, plugins = [], onchange, onready }: Props = $props();
let host: HTMLDivElement;
let editor = $state.raw<Editor>();
let applying = false;
onMount(() => {
  const instance = createEditor(host, {
    value, readOnly, placeholder, label, plugins,
    onChange: (change) => {
      if (applying)
        return;
      value = change.html;
      onchange?.(change);
    },
  });
  editor = instance;
  onready?.(instance);
  return () => { instance.destroy(); editor = undefined; };
});
$effect(() => {
  if (!editor || value === editor.getHTML()) return;
  applying = true;
  try { editor.setHTML(value); } finally { applying = false; }
});
$effect(() => { editor?.setReadOnly(readOnly); });
export const getEditor = (): Editor | undefined => { return editor; };
</script>

<div bind:this={host} class="mw-host"></div>
