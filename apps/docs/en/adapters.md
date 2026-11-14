# Framework adapters

Adapters share the core HTML contract and lifecycle. Instances are created after mounting; Svelte source requires a Svelte-aware bundler. Import the CSS once in the client entry. Plugins, placeholder, and label are creation-time options; recreate the component to change them. `readOnly` and the document value update reactively. No adapter bundles its framework.

## Vue 3.5+

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { MorfiraEditor } from '@morfira-dev/wysiwyg/vue';
import { tables } from '@morfira-dev/wysiwyg/plugins/tables';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/plugins/tables.css';
const html = ref('<p>Hello</p>');
const plugins = [tables()];
</script>

<template>
  <MorfiraEditor v-model="html" :plugins="plugins" label="Article" />
</template>
```

Events: `update:modelValue` with HTML, `change` with `EditorChange`, and `ready` with `Editor`. The exposed `getEditor()` returns the instance after mounting. Unmounting destroys the instance.

## React 18 / 19

```tsx
import { useState } from 'react';
import { MorfiraEditor } from '@morfira-dev/wysiwyg/react';
import '@morfira-dev/wysiwyg/style.css';

export const Article = () => {
  const [value, setValue] = useState('<p>Hello</p>');
  return <MorfiraEditor value={value}
    onChange={({ html }) => setValue(html)} label="Article" />;
};
```

`onReady(editor)` exposes the instance; a forwarded ref exposes `getEditor()`. The mount cleanup supports StrictMode's setup/cleanup cycle. Omit `value` to manage document updates through the exposed API. The onChange callback always uses the latest prop.

In the browser, mounting, controlled value synchronization and read-only updates use layout effects. A parent layout effect can issue a subsequent command without an older acknowledgement overwriting that edit or resetting its caret/history. Server rendering uses the passive effect fallback and emits only the host element. Deliberately delayed or transformed values remain external replacements; the adapter does not infer an application acknowledgement protocol.

## Svelte 5

```svelte
<script lang="ts">
  import { MorfiraEditor } from '@morfira-dev/wysiwyg/svelte';
  import '@morfira-dev/wysiwyg/style.css';
  let html = $state('<p>Hello</p>');
</script>

<MorfiraEditor bind:value={html} label="Article" />
```

Use callback props `onchange` and `onready`; `bind:this` exposes `getEditor()`. `value` is bindable. Svelte 4 is not supported by this adapter.

## Synchronization

Typing emits a user change. Feeding that HTML back through the binding does not replace the document or reset the caret. A different external value replaces the document, clears history, and does not emit a feedback change from the adapter. Avoid transforming HTML on every keystroke; use explicit normalization on save.

## Installable package verification

```sh
pnpm run build
pnpm run consumers:check
```

The check packs all six libraries into real tarballs and installs them into a separate temporary project outside the workspace. Every Morfira dependency/override points at these archives; source aliases and workspace-source links are forbidden. Tool versions and their transitive dependency edges come from the currently installed environment and are verified after installation. `pnpm install --offline` never fetches a missing cache entry: it fails explicitly.

It then runs ordinary tsc/vue-tsc/svelte-check, a production Vite build of Vue SFC, React StrictMode and Svelte 5 examples, and nine Chromium/Firefox/WebKit browser smoke scenarios. They cover controlled feedback, one-notification structural slash actions, history/following input, external values, reactive read-only and unmount. Production StrictMode does not prove development effect replay; the main adapter suite covers that separately.

`artifacts/consumer-packages.json` records versions, archive SHA-256 hashes, actual export-resolution paths and browser results. The temporary project is removed in finally. This verifies installable artifacts, not npm publication or live CI status.
