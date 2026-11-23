<script setup lang="ts">
import InlineNodeViewsExample from '../.vitepress/theme/InlineNodeViewsExample.vue';
</script>

# Visual nodes in the editing area

<ClientOnly><InlineNodeViewsExample /></ClientOnly>

`createInlineNodeViews` paints a nonpersisted view of a registered atom or text-only block node directly over its location in the editing area. Canonical HTML, JSON and text remain unchanged. Ordinary editable inline extensions are outside this contract.

```ts
import { createInlineNodeViews, nodeExtension } from '@morfira-dev/wysiwyg/sdk';

// Install nodeExtension(..., { atomic: true }) when creating editor.
const views = createInlineNodeViews(editor, {
  name: 'app:record',
  create: (context) => {
    const element = document.createElement('span');
    const update = (next: typeof context) => {
      element.textContent = `◆ ${next.text}`;
    };
    update(context);
    return { element, update, destroy: () => { /* release application resources */ } };
  },
});
views.destroy();
```

`InlineNodeViewsOptions` has `name`, `create` and optional `onError`. The controller exposes `element`, `refresh()` and idempotent `destroy()`. `NodeView` and `NodeViewContext` match the existing external node views. Presets do not install this view and SDK imports no stylesheet.

## Presentation and layout

An owned positioned layer sits inside `editor.element`, outside `editor.surface`. Each view is bounded to the actual source node's geometry and clipped to the editing area. Standard editor CSS already provides `position: relative`; a custom theme must preserve a positioned editor container. Applications can reserve larger source-node geometry with their own CSS without putting presentation DOM in saved content. Container scaling is accounted for; multiline inline nodes with several rectangles hide the overlay while source text remains visible.

ResizeObserver, resize, captured scroll and editor notifications coalesce geometry updates. Without ResizeObserver, applications call `refresh()` after their own layout changes.

Pointer activation selects the actual semantic node. Existing atom/block behavior owns navigation, Backspace/Delete and Undo. Only rendered output becomes inert; text-only block source does not acquire a new generic atomic editing model. Read-only keeps the visual presentation but blocks selection actions. Document replacement disposes obsolete views. Lost layer ownership stops the controller and releases listeners/observers.

## Limits and safety

This is a visual overlay **inside the editing area**, not editable `contentDOM`, an arbitrary widget engine or a document model replacement. `create` executes trusted application code, not HTML sanitization. Returned elements become inert; duplicate visual content is hidden from the accessibility tree. Interactive forms do not belong in these views. Applications control resources loaded by callbacks; the SDK itself makes no network requests.

Export, search and clipboard contain canonical source text/IDs, never view labels or callback DOM. Painting adds no history. Setup failures clean partial resources; later failures stop the controller and notify optional `onError`. Physical-device/screen-reader evidence remains separately unavailable; this page does not claim certification.
