# Framework adapters

Adapters share the core HTML contract and lifecycle. Instances are created after mounting; Svelte source requires a Svelte-aware bundler. Import the CSS once in the client entry. In Vue/React/Svelte/Angular, plugins, placeholder, and label are creation-time options; recreate the component to change them. `readOnly`, the document value, `locale` and `translations` update reactively. No adapter bundles its framework. The framework-free Web Component is described separately below.

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

## Angular 21 / 22

`MorfiraEditor` is a standalone component with selector `morfira-editor` and ControlValueAccessor. Import it directly in your application's component `imports`. Add `ReactiveFormsModule` for reactive forms:

```ts
import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MorfiraEditor } from '@morfira-dev/wysiwyg/angular';
import type { Editor, EditorTranslations } from '@morfira-dev/wysiwyg';
import '@morfira-dev/wysiwyg/style.css';

@Component({
  selector: 'app-article',
  standalone: true,
  imports: [MorfiraEditor, ReactiveFormsModule],
  template: `<morfira-editor [formControl]="body" [locale]="language"
    [translations]="messages" label="Article" (ready)="onReady($event)" />`,
})
export class Article {
  readonly body = new FormControl('<p>Hello</p>', { nonNullable: true });
  language = 'en';
  readonly messages: EditorTranslations = { 'editor.placeholder': 'Article text…' };
  readonly onReady = (editor: Editor) => {
    console.log(editor.getHTML());
  };
}
```

For template-driven forms, import `FormsModule` and use `[(ngModel)]="html"`. For direct HTML binding without Angular forms, use `[(value)]="html"`, or `[value]="html" (valueChange)="html = $event"`. Do not combine `[value]` with a form binding on the same instance: one model must own the value.

Inputs are `value`, `readOnly`, `locale`, `translations`, `plugins`, `label` and `placeholder`. Outputs are `valueChange` with an HTML string, `change` with `EditorChange`, and `ready` with `Editor`. A component ref exposes `getEditor()` after `ready`. User input updates the CVA and outputs; external `writeValue`/binding updates remain silent. CVA `null` resets the document to empty. `control.disable()` and `[readOnly]` combine: either blocks document mutations. Focus leaving the component marks the control touched.

The editor is created in `afterNextRender`, never during SSR, and is destroyed with its component. The library is partial-compiled; the application's Angular linker completes compilation without a hidden JIT fallback. Angular core/common/forms are peers, and the adapter bundles neither CSS nor Angular runtime. Angular 22 compatibility uses a separate consumer profile with its required Node/TypeScript toolchain, rather than being inferred solely from peer ranges.

## Framework-free Web Component

Registration is explicit: importing `/web-component` does not define a custom element and remains safe during SSR. Call `defineMorfiraEditor()` in the browser; its default tag is `morfira-wysiwyg`:

```ts
import { defineMorfiraEditor } from '@morfira-dev/wysiwyg/web-component';
import type { MorfiraEditorElement } from '@morfira-dev/wysiwyg/web-component';
import type { Editor, EditorChange } from '@morfira-dev/wysiwyg';
import { tables } from '@morfira-dev/wysiwyg/plugins/tables';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/plugins/tables.css';

defineMorfiraEditor();
const field = document.createElement('morfira-wysiwyg') as MorfiraEditorElement;
field.value = '<p>Hello</p>';
field.locale = 'en';
field.translations = { 'tables.resizeColumn': 'Column width' };
field.plugins = [tables()];
field.addEventListener('value-change', (event) => {
  const html = (event as CustomEvent<string>).detail;
  console.log(html);
});
field.addEventListener('change', (event) => {
  if (!(event instanceof CustomEvent)) return;
  const change = (event as CustomEvent<EditorChange>).detail;
  console.log(change.source);
});
field.addEventListener('ready', (event) => {
  const editor = (event as CustomEvent<Editor>).detail;
  console.log(editor.getHTML());
});
document.querySelector('#editor-host')!.append(field);
```

The element uses light DOM: import CSS manually and scope `--mw-*` variables to its wrapper or the element itself. Properties `value`, `readOnly`, `locale`, `translations`, `label` and `placeholder` update after connection. Set `plugins` before connection or after disconnection; changing the list of an active editor throws. `getEditor()` returns the current instance only while connected.

Attributes `value`, `readonly`, `locale`, `label` and `placeholder` are supported; pass translations and plugins as properties. `readonly` is a boolean presence attribute: even `readonly="false"` enables read-only, so remove it or set `field.readOnly = false` to disable it. Prefer the `value` property for HTML strings.

`value-change`, `change` and `ready` are bubbling native CustomEvents with `detail`. External `value` assignment emits no feedback events; same-value feedback preserves caret/history. Disconnect destroys the editor; reconnect restores the last validated HTML into a new instance with fresh history. This is **not yet a form-associated custom element**: it has no automatic FormData/validation/disabled relationship with `<form>`. The application binds the value itself.

## Reactive localization

All four framework adapters and the Web Component forward `locale` and `translations` to the instance-local API. Supply a new translations record for reactive updates; language changes neither replace the document nor emit a user change. Explicit label/placeholder and custom labels retain precedence. See [localization](/localization) for language tags, fallback and the key catalog.

## Synchronization

Typing emits a user change. Feeding that HTML back through the binding does not replace the document or reset the caret. A different external value replaces the document, clears history, and does not emit a feedback change from the adapter. Avoid transforming HTML on every keystroke; use explicit normalization on save.

## Installable package verification

```sh
pnpm run build
pnpm run consumers:check
# Separate Angular 22 profile, on a compatible Node:
pnpm run consumers:angular22
```

The check targets eight library tarballs installed into a separate temporary project outside the workspace. Every Morfira dependency/override points at these archives; source aliases and workspace-source links are forbidden. Tool versions and their transitive dependency edges come from the currently installed environment and are verified after installation. The baseline `pnpm install --offline` never fetches a missing cache entry: it fails explicitly.

The baseline covers tsc/vue-tsc/svelte-check, Angular AOT/linker and production examples for Vue SFC, React StrictMode, Svelte 5, Angular 21 and Web Component: fifteen Chromium/Firefox/WebKit browser smoke scenarios. `consumers:angular22` adds three scenarios and a separate TypeScript toolchain in its temporary project; it requires Node 22.22.3+ on the 22 branch or a compatible Node 24.15+. This profile may need network access to obtain its Angular 22 toolchain, without modifying the root lockfile. They cover controlled feedback, one-notification structural slash actions, history/following input, external values, reactive locale/read-only and unmount. Production StrictMode does not prove development effect replay; the main adapter suite covers that separately. This describes the tooling coverage contract, not the outcome of the latest run.

`artifacts/consumer-packages.json` and `artifacts/consumer-angular22.json` record versions, archive SHA-256 hashes, actual export-resolution paths and browser results for their respective profiles. The temporary project is removed in finally. This verifies installable artifacts, not npm publication or live CI status.
