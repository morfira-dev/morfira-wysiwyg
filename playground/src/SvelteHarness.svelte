<script lang="ts">
import { MorfiraEditor } from '@morfira-dev/wysiwyg/svelte';
import type { Editor, EditorChange, EditorPlugin } from '@morfira-dev/wysiwyg';
let { onready, onchange, plugins = [] }: { onready: (editor: Editor) => void; onchange: (change: EditorChange) => void; plugins?: EditorPlugin[]; } = $props();
let value = $state('<p>Initial content</p>');
let readOnly = $state(false);
</script>
<button onclick={() => value = '<p>External update</p>'}>Update value</button>
<button onclick={() => readOnly = !readOnly}>Toggle readonly</button>
<MorfiraEditor {plugins} bind:value {readOnly} {onready} {onchange} />
