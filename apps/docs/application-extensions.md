<script setup>
import ApplicationExtensionsExample from './.vitepress/theme/ApplicationExtensionsExample.vue';
</script>

# Application entities, callouts and template variables

Build product-specific content with existing SDK contracts and share its schema
with a published reader. These three examples are application-owned TypeScript,
not additional editor packages or a new document format.

<ApplicationExtensionsExample />

## Three supported examples

| Kind | Persisted source | Application meaning |
| --- | --- | --- |
| Entity | Atomic `span`, `data-id`, literal label | A reference your backend resolves and authorizes |
| Callout | Text-only `blockquote`, `data-tone="info"` or `"warning"` | A styled information/warning block |
| Variable | Atomic `span`, declared `data-key`, literal source token | A value resolved explicitly when creating a publication copy |

Entity IDs are opaque strings up to 64 UTF-16 units. They do not become URLs or
authorize access. A changed visible label does not prove a changed backend record.
Atomic inline labels are bounded single-line text. Callouts accept up to 2000
literal text units; arbitrary nested widgets, HTML tags and editable contentDOM
are outside this recipe.

Choose a kind and **Inspect first node** to bind its actual node to the edit draft.
Change its text/attribute and choose **Update inspected**, or **Remove inspected**.
**Undo** restores that command. **Insert at end** deliberately uses the document's
end rather than the previous caret. The SDK still validates insertion boundaries.

Any content edit, composition start or read-only activation expires a draft.
Inspect again before applying. A document that returns to identical HTML does not
reactivate the old draft. Unchanged selection is not permission to bypass command
validation. Read-only and IME block mutations; loading a new document invalidates
old targets.

## Shared schema and existing SDK commands

Copy adjacent `types.ts` and `index.ts` application files. Create a fresh bundle
for a mounted editor. Importing the files does not create DOM or global registries.

<<< @/.vitepress/theme/application-extensions/types.ts

<<< @/.vitepress/theme/application-extensions/index.ts

Pass `bundle.plugins` to the editor or its adapter. Give `bundle.schema` to
`createContentView(readerHost, { value: savedJSON, schema: bundle.schema })`.
The reader does not mount editing plugins, create an editor, or activate entity
references. Optional content-view CSS remains a separate import.

Use `bundle.commands(editor, kind)` for the SDK's insert methods. Application
capture/update/remove helpers also enforce draft revision and actual-node identity;
the SDK rechecks ownership and content after focus before changing the document.
Do not retain captured targets across document replacement or unmount. The
application-owned plugin cleans revision listeners when its editor is destroyed.

## Save, reload and display

**Save JSON** copies the validated document into local memory. **Reload JSON**
passes that snapshot through the same instance schema and intentionally replaces
the current document. External replacement clears undo history according to the
ordinary editor contract. This example creates no durable storage or backend.

The declared entity IDs, tones and variable keys survive HTML/JSON. Runtime
`contenteditable=false` atom presentation does not. An independent reader with the
shared schema retains semantic data. A JSON reader missing these definitions
rejects the unknown owning nodes; an HTML reader uses the codec's safe downgrade
without asserting that metadata was preserved. Install the matching schema when
semantics matter. See [saved-content display](/content-view).

## Literal template expansion

**Publish with values** expands only a detached validated copy; the editor and its
history remain unchanged. The declared keys are `customer` and `order`. For example,
`customer = <b>Ada</b>` displays the literal `<b>Ada</b>`, without creating a B node.
No expression evaluation, arbitrary HTML interpolation or URL substitution occurs.
Entity references and callouts remain in the published copy.

Unknown provided keys reject. Missing own values preserve their source token and
appear in `unresolved`; inherited object properties are never treated as values.
Each provided string is limited to 2000 UTF-16 units, with no NUL/control bytes.
A call handles at most 100 variables and 20000 replacement units; over-budget data
rejects before returning any output. The final document passes the same schema.

These limits describe this small application recipe. Applications choose allowed
keys, authorized data sources and the point when expansion occurs. Resolve
sensitive values and enforce permissions on the backend; editor metadata and
frontend filtering do not establish authorization. See [security](/security).
