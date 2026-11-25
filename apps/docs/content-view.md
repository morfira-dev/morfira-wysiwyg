<script setup>
import ContentViewExample from './.vitepress/theme/ContentViewExample.vue';
</script>

# Display saved content

Use a content view to display an article, knowledge-base entry or saved field
without mounting an editor. Import the viewer and its scoped stylesheet separately.
It accepts the same schema-v1 JSON that `editor.getJSON()` returns, or HTML rebuilt
through the same validation boundary.

<ContentViewExample />

## Save, load and display

```ts
import type { EditorDocument } from '@morfira-dev/wysiwyg';
import { createContentView } from '@morfira-dev/wysiwyg/content-view';
import '@morfira-dev/wysiwyg/content-view.css';

// The application owns storage and server validation.
const saved = editor.getJSON();
const payload = JSON.stringify(saved);
const loaded: unknown = JSON.parse(payload);
const published = createContentView(articleHost);
published.setJSON(loaded as EditorDocument); // runtime schema validation is authoritative

// Replacing with invalid JSON throws and leaves the preceding article intact.
const independentCopy = published.getJSON();
const normalizedHTML = published.getHTML();
// When removing the application screen:
published.destroy();
```

`articleHost` must be a connected, empty HTML element in the current document,
outside contenteditable. The controller owns one article child, not its host.
Getters return canonical stored data, independent from presentation: an omitted
image still retains its original URL and metadata in JSON/HTML. A returned JSON
copy can be changed without changing the displayed article.

## Images and navigation

Default rendering creates no IMG and no navigable `href`: image alt text is shown
as a placeholder, while links retain visible text/marks. This avoids image or
thumbnail requests merely because content is displayed. It does not control
application CSS, fonts or other application-owned network activity.

Explicitly select resource behavior when the application allows it:

```ts
const published = createContentView(articleHost, {
  value: saved,
  images: 'load',
  links: 'navigate',
  imagePlaceholder: '[Image]',
  label: 'Published article',
});
```

`images: 'load'` may request image URLs resolving to http/https. Relative images
are projected as absolute URLs at render time, so later base changes cannot redirect
them. A reference resolving to another protocol stays an alt-text placeholder. `links: 'navigate'` keeps only
resolved http/https/mailto/tel destinations and opens them in a new tab using
`target="_blank" rel="noopener noreferrer"`. Relative references resolve against the document
base URL at render time; the displayed href is absolute so later base changes cannot
redirect it. Canonical stored references remain unchanged. Configure origin policy, CSP and upload authorization in the application;
frontend filtering does not replace server validation.

Media and formulas retain their allowed source wrappers and literal text; this
viewer does not create iframe players, remote thumbnails, MathML or custom node
views. Use separate application integrations where richer presentation is needed.

## Custom document nodes

Pass the same declarative `schema` definitions used by the editor when saved
content contains application-owned nodes:

```ts
const reference = {
  name: 'app:reference', kind: 'inline', tag: 'span',
  attributes: { 'data-id': { type: 'text', required: true, maxLength: 80 } },
} as const;
const published = createContentView(articleHost, {
  schema: [reference],
  value: saved,
});
```

Definitions preserve validated node identity and attributes without installing
editing plugins. JSON containing an unregistered owner is rejected. In HTML,
unregistered semantic wrappers follow the normal codec downgrade: supported text
and ordinary safe structure remain, while unknown identity is discarded. Register
the schema when that identity matters; never infer backend authorization from an ID.

## Lifecycle and styling

`setHTML(html)` normalizes HTML; `setJSON(document)` validates schema-v1 JSON.
Both validate the whole input before replacing the article. Getters/setters throw
after destruction or if the owned article/host is detached, reparented or adopted.
`destroy()` is idempotent and preserves foreign siblings.

The stylesheet scopes its rules to `.mw-content-view` and uses `--mw-font`,
`--mw-font-size`, `--mw-line-height`, `--mw-text`, `--mw-muted`, `--mw-accent`,
`--mw-border`, `--mw-hover` and `--mw-radius`. It does not require editor or site CSS.
Importing the module is safe without a DOM; mounting requires a browser. It is not
a server-side HTML sanitizer, an editing surface or an exact Office-page renderer.
