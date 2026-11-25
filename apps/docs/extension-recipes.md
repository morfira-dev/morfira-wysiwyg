# Application extension recipes

<script setup lang="ts">
import RecipesExample from './.vitepress/theme/RecipesExample.vue';
</script>

<RecipesExample />

These application-owned examples use public APIs. They add no network, storage or
business policy to core. Laboratory services are local; simulated upload returns a
known site asset and does not send user files.

## Custom nodes, plugins and lifecycle

Create the factory once per component instance. When the document ID changes, create a new session/editor instance: the server version belongs to that specific document. The atom stores a bounded opaque
ID; its label grants no backend authorization. Adapters destroy editors/plugins on
unmount. Applications must also dispose their optional UI controllers; bind their
cleanup to the editor destroy event when appropriate.

<<< @/.vitepress/theme/recipes/index.ts

## Upload progress

The XMLHttpRequest recipe demonstrates actual upload progress, cancellation,
timeout and response validation. It targets your own endpoint and is separate
from the laboratory transport. Endpoint and returned image URL are same-origin.
XHR follows redirects: the upload server must not redirect the request body to a
foreign origin; enforce CSP `connect-src 'self'` when this restriction is required.
Checking the final URL cannot undo an earlier redirect. The server owns auth,
CSRF, file-content/MIME/size validation and storage policy. Browser file names and
MIME labels are not evidence of actual type. Response processing is bounded to
64 KB and oversized observed downloads abort; browser-internal buffering is not
claimed to obey that bound.

<<< @/.vitepress/theme/recipes/upload.ts

## Async mentions

The provider honors signal/limit, returns opaque string IDs and does not expose a
shared mutable result array across instances. Replace the local directory with
an authorized server query. The backend must validate accepted identity references.

<<< @/.vitepress/theme/recipes/mentions.ts

## Saving and version conflicts

Send the server version as a precondition (`If-Match` or an API field). A conflict
does not advance the local token or turn Retry into an overwrite. Explicit Reload
first fetches a snapshot; the application validates it with
`editor.schema.validateDocument`, confirms no local changes occurred while waiting,
and calls `editor.setJSON`. Only after successful application call
`session.acceptReload(snapshot)`. External replacement clears history under the
existing contract. The demo does not automatically merge documents.

<<< @/.vitepress/theme/recipes/save.ts

## Lazy highlighting

The first use loads a module. Successful loading is cached, failures permit retry,
and cancellation is rechecked after loading and provider execution. The bounded
demonstration tokenizer is not a complete grammar. The application chooses actual
libraries/grammars outside core and presets.

<<< @/.vitepress/theme/recipes/highlight.ts

## Five adapters

These files share one factory and public imports. Vue/React/Web Component are
type-checked with the docs; Vue and React StrictMode have focused runtime checks.
Svelte receives a separate template compilation and Angular 21 a strict AOT build
of the example. This is not the full consumer matrix or a fresh Angular 22 check.
Importing shared recipes during SSR does not access DOM/network; Web Component
registration is explicitly browser-only.

### Vue

<<< @/.vitepress/theme/recipes/wrappers/RecipeVue.vue

### React

Mount under React.StrictMode and stabilize the factory with useMemo.

<<< @/.vitepress/theme/recipes/wrappers/RecipeReact.tsx

### Svelte

<<< @/.vitepress/theme/recipes/wrappers/RecipeSvelte.svelte

### Angular

<<< @/.vitepress/theme/recipes/wrappers/angular.ts

### Web Component

<<< @/.vitepress/theme/recipes/wrappers/web-component.ts

Local services and
examples do not certify server security, universal Office fidelity or accessibility.
