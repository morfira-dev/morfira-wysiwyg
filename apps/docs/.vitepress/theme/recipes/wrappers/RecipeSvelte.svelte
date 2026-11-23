<script lang="ts">
import { MorfiraEditor } from '@morfira-dev/wysiwyg/svelte';
import type { Editor } from '@morfira-dev/wysiwyg';
import { createRecipeBundle } from '../index.js';
import { createLocalRecipeServices } from '../local-services.js';
let { onready }: { onready?: (editor: Editor) => void } = $props();
let value = $state('<p>Recipe editor</p>');
const bundle = createRecipeBundle(createLocalRecipeServices().options);
</script>
<MorfiraEditor bind:value plugins={bundle.plugins} label="Recipe editor" {onready} />
