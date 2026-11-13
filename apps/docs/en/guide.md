# Getting started

Morfira WYSIWYG is an independently implemented TypeScript editor with an optional table plugin and Vue, React, and Svelte adapters. The editor core and plugins have **zero runtime dependencies**. Project code is licensed under MIT.

## Run locally

Node.js 22.14+ and pnpm 11.0.7 are required.

```sh
pnpm install
pnpm run docs:dev
```

The documentation is local-only. Packages are workspace-linked and have not been published to npm. Rebuild library sources with `pnpm run build` after edits. `pnpm run dev` starts the browser test harness.

## Create an editor

Provide two empty elements: `<div id="toolbar"></div><div id="editor"></div>`.

```ts
import { createEditor, createToolbar } from '@morfira/wysiwyg';
import '@morfira/wysiwyg/style.css';

const host = document.querySelector<HTMLElement>('#editor')!;
const editor = createEditor(host, {
  value: '<p>Hello <strong>Morfira</strong></p>',
  label: 'Article body',
  placeholder: 'Start writing…',
  onChange: ({ html, source }) => {
    if (source === 'user') console.log(html);
  },
});
const removeToolbar = createToolbar(
  document.querySelector<HTMLElement>('#toolbar')!, editor,
);
// On view removal:
removeToolbar();
editor.destroy();
```

The toolbar is optional. Destroy its UI before disposing the editor. Pass initial HTML through `value`; the host must be empty.

## Storage and validation

`getJSON()` returns the versioned `EditorDocument` tree, containing text nodes and allowed semantic elements. Store it with `JSON.stringify` and restore it with `setJSON`. Both HTML and JSON boundaries enforce a schema, URL and style allowlists, nesting limits and document size limits. Unknown document versions are rejected without modifying the editor.

`getHTML()` returns supported semantic HTML. Imported event attributes, executable markup and foreign namespaces are omitted. Unsupported HTML is normalized; arbitrary layout fidelity is not promised. The server still owns its own validation, authorization and output policy.

## Browser and SSR

Importing the core does not access DOM globals. Call `createEditor` only when a browser element exists. Framework adapters create and dispose their instance in the client lifecycle. The Svelte component needs the consuming application's Svelte compiler. Browser editing, composition and assistive technologies still require target-environment testing.
