<script lang="ts">
import { onMount } from 'svelte';
import { createEditor } from '@morfira/wysiwyg-core';
import type { Editor, EditorChange, EditorPlugin } from '@morfira/wysiwyg-core';

interface Props {
  value?: string;
  readOnly?: boolean;
  placeholder?: string;
  label?: string;
  plugins?: EditorPlugin[];
  onchange?: (change: EditorChange) => void;
  onready?: (editor: Editor) => void;
}
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
