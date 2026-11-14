<script lang="ts">
import { MorfiraEditor } from '@morfira-dev/wysiwyg/svelte';
import { plugins, ready, changed } from './common.js';
let value = $state('<p>Initial</p>');
let readOnly = $state(false);
let locale = $state<'en' | 'ru'>('en');
let mounted = $state(true);
let external = 0;
const replace = () => { value = `<p>External ${++external}</p>`; };
</script>
<button data-action="external" onclick={replace}>External value</button>
<button data-action="readonly" onclick={() => readOnly = !readOnly}>Read only</button>
<button data-action="locale-ru" onclick={() => locale = 'ru'}>Russian</button>
<button data-action="locale-en" onclick={() => locale = 'en'}>English</button>
<button data-action="unmount" onclick={() => mounted = false}>Unmount</button>
{#if mounted}
  <MorfiraEditor bind:value {readOnly} {plugins} {locale} label="Consumer editor" onready={ready} onchange={changed} />
{/if}
