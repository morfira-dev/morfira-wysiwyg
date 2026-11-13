<script lang="ts">
import { MorfiraEditor } from '@morfira/wysiwyg/svelte';
import type { Editor, EditorChange } from '@morfira/wysiwyg';
let { onready, onchange }: { onready: (editor: Editor) => void; onchange: (change: EditorChange) => void; } = $props();
let value = $state('<p>Initial content</p>');
let readOnly = $state(false);
</script>
<button onclick={() => value = '<p>External update</p>'}>Update value</button>
<button onclick={() => readOnly = !readOnly}>Toggle readonly</button>
<MorfiraEditor bind:value {readOnly} {onready} {onchange} />
