# Standalone published content view

Status: accepted bounded contract, 2026-11-25. Public entry
`@morfira-dev/wysiwyg/content-view`, with explicit `/content-view.css`.

## Data and rendering

`createContentView(host, options?)` displays saved schema-v1 JSON or HTML without
creating an Editor, editing surface, toolbar, plugins, timers or framework runtime.
Options: `value?: string | EditorDocument`, `schema?: readonly SchemaContribution[]`,
`images?: 'omit' | 'load'`, `links?: 'text' | 'navigate'`, `label?: string`,
`imagePlaceholder?: string`. Configuration is fixed for the instance.

The immutable instance schema validates complete input and bounds document
resources before live projection. HTML uses the existing rebuilding/normalization
contract; JSON rejects invalid/unregistered semantic owners. Application schema
contributions retain registered IDs/attributes without installing editor plugins.
Unknown HTML semantic wrappers downgrade under the existing HTML codec, not custom
callbacks; applications needing their semantics must pass matching schema definitions.
The controller exposes `element`, `setHTML`, `setJSON`, `getHTML`, `getJSON`,
`destroy`. Getters return canonical stored content, never the inert presentation.
Invalid replacement throws and preserves both stored data and the existing DOM.
Getters return independent data. No schema version change or implicit preset import.

## Resources and trust

Default `images: 'omit'` replaces IMG with literal alt/placeholder; default
`links: 'text'` retains link text/marks without navigation attributes. No iframe,
remote media player, arbitrary view callback or executable HTML is created. Semantic
media/formula nodes remain their canonical text/allowed wrappers; playback and
custom MathML presentation are separate integrations. No remote image/thumbnail is
created unless the application explicitly selects `images: 'load'`.

`links: 'navigate'` revalidates resolved destinations as http/https/mailto/tel and
sets noopener/noreferrer for links opening a new window. Non-navigable references
remain plain link text. Relative URLs resolve against the document base at render time and project as
absolute hrefs so later base changes cannot redirect them: applications
own allowed origins, upload authorization, CSP and safe base configuration.
Explicit image loading resolves only http/https destinations and projects absolute
src values, freezing them against later base changes. Unsupported resolved image
protocols remain alt/placeholder text. Imported style attributes still pass the codec allowlist. App-defined fonts/styles
may cause their own requests; this is not a universal no-network sandbox. Trusted
application CSS/plugins and backend validation remain application responsibilities.

## Ownership and lifecycle

Require a connected, genuinely empty ordinary HTML host in the current document,
outside editable surfaces and without a contenteditable ancestor. Append one owned
article child `.mw-content-view`. Setters/getters refuse after destroy and while
host/element is detached, reparented or adopted. Destroy is idempotent, removes only
the owned article wherever it moved, preserves foreign siblings, clears retained
stored data and does not modify the application host. No event listeners or observers.
Import is safe without browser globals; creation requires a live browser document.

Styles are scoped to `.mw-content-view`, use `--mw-*`, and do not import editor
shell/UI/site styles. Applications may compose the optional table/checklist display
without mounting an editing runtime. Real-world app CSS remains application-owned.

## Acceptance

Representative Chromium/Firefox/WebKit cases cover JSON/HTML save-load-render,
headings/table spans/styles/semantic IDs, independent canonical getters, inert
image/link defaults and explicit resource opt-in, unsafe HTML and JSON rejection,
rollback, two instances, detached/reparented ownership and destroy. Add facade/type,
SSR-import and selective tree-shaking/real-tarball boundary checks. RU/EN live
examples accept saved JSON from the editor field and independently show published
content. Measure this optional entry's JS raw/gzip/Brotli and CSS separately; keep
core/preset graphs and existing guards unchanged.
