<script lang="ts">
import { MorfiraEditor } from '@morfira-dev/wysiwyg/svelte';
import type { Editor, EditorChange, EditorPlugin, EditorTranslations } from '@morfira-dev/wysiwyg';
let { onready, onchange, plugins = [] }: { onready: (editor: Editor) => void; onchange: (change: EditorChange) => void; plugins?: EditorPlugin[]; } = $props();
let value = $state('<p>Initial content</p>');
let readOnly = $state(false);
let locale = $state('ru');
let translations = $state<EditorTranslations>({});
</script>
<button onclick={() => value = '<p>External update</p>'}>Update value</button>
<button onclick={() => readOnly = !readOnly}>Toggle readonly</button>
<button onclick={() => locale = locale === 'ru' ? 'en' : 'ru'}>Switch locale</button>
<button onclick={() => translations = { 'editor.label': 'Custom editor' }}>Override locale</button>
<MorfiraEditor {plugins} bind:value {readOnly} {locale} {translations} {onready} {onchange} />
