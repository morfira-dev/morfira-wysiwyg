# Contextual selection toolbar

The [homepage](/#editor) and [playground](/playground) enable a separate **Contextual toolbar** switch. Load its sample and select editor text. A small toolbar appears beside a visible selection without taking focus. This is explicit full-demo composition; presets and ready standard UI do not create it automatically.

## Installation and cleanup

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { createContextualToolbar } from '@morfira-dev/wysiwyg/ui/contextual';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/ui/editor.css';
import '@morfira-dev/wysiwyg/ui/contextual.css';

const editor = createEditor(editorHost, { value: '<p>Select <strong>some text</strong>.</p>' });
const contextual = createContextualToolbar(overlayHost, editor, { gap: 8 });

const dispose = () => {
  contextual.destroy();
  editor.destroy();
};
```

`overlayHost` is an empty connected application element in the editor's document, **outside `editor.surface`**. The factory mounts only owned UI; it neither moves application nodes nor creates a global overlay service. Positioning uses fixed viewport coordinates. Transformed/filtered/perspective/paint-contained or clipping host ancestors are unsupported: choose an appropriate top layer without such ancestors. Automatic portals and arbitrary transformed-coordinate mapping are not implemented.

The controller exposes `element`, `refresh()` and idempotent `destroy()`. Refresh after destruction throws; destroying UI leaves its editor working. Editor destruction also releases the toolbar. Owned subscriptions, observers and queued callbacks are removed; detached controls cannot edit a replacement document.

Imports are SSR-safe; mounting requires a browser. There are no runtime dependencies, frameworks, implicit CSS, fonts or network requests. The three CSS imports above are explicit; scoped `--mw-*` styling is independent of documentation styles.

## Visibility, keyboard and history

Defaults provide bold/italic/underline/strike/code and clear inline formatting. They reuse `createEditorUI` controls and commands rather than a separate editing engine. `groups`, `density`, `label` and `onError` follow the shell contract. `gap` is finite 0–32 CSS px, default 8. Public exports include `ContextualToolbarOptions`, `ContextualToolbarController`, `ContextualToolbarMessageKey` and RU/EN `contextualToolbarMessages`.

The toolbar shows for one nonempty text range within the focused editor. Carets, image/BR-only selections, outside/nonvisible ranges, owning semantic nodes and foreign namespaces are ineligible. Showing UI does not broaden formatting contracts or reinterpret table selections as a new cell-selection model.

Automatic showing changes neither focus, content nor selection. **Alt+F10** from this editor focuses the first enabled contextual control. Arrows/Home/End reuse shell navigation. **Escape** dismisses and returns focus to the editor, restoring the remembered range once. Closed controls have no Tab-accessible subtree.

Outside interaction dismisses without stealing focus. Queued `selectionchange` for the same range does not immediately reopen it; a fresh selection or explicit Alt+F10 can reopen. Read-only, IME composition, external document replacement and focus leaving dismiss the toolbar. Ending these conditions alone does not resurrect the old target. Actions retain ordinary history; showing, positioning, dismissal and toggling UI add no Undo revisions.

Placement is above the selection where possible, below otherwise, clamped to the visible viewport. Scrolling, resizing or an anchor leaving view updates or hides the toolbar. Very narrow layouts wrap/scroll controls without overflowing the page. This slice adds no image/table menus, collapsed-caret link controls or custom atomic-node selection. Complete screen-reader accessibility and all-mobile-device support are not claimed.

## Custom action state

`editor.getFormats(range?)` projects a remembered range without moving native Selection or focus. No argument retains current-selection/pending-typing behavior; an explicit Range reads current-document stored formats without pending typing overrides. Foreign/detached ranges yield an empty snapshot; malformed arguments throw. External replacement invalidates UI bookmarks.

Custom `label`, `enabled` and `pressed` readers receive a cloned valid UI range as their optional second argument. Use it explicitly for selection-dependent state. For example, **instead of the defaults**:

```ts
const contextual = createContextualToolbar(overlayHost, editor, {
  groups: [[{
    id: 'app:emphasize', label: 'Emphasize selection', text: 'B+',
    enabled: (_editor, range) => Boolean(range && !range.collapsed),
    pressed: (instance, range) => Boolean(instance.getFormats(range).bold),
    run: (instance) => instance.format('bold', true),
  }]],
});
```

These are trusted synchronous side-effect-free callbacks. Other native-selection-only APIs are not automatically projected. A snapshot does not authorize execution: UI restores a valid range and the command checks the actual target. Labels/errors render as plain text.

A caret or text range wholly inside one link can use separate [contextual link actions](/contextual-links): `/ui/contextual-link`, explicit core/forms/contextual-link CSS, validated Open and whole-link editing/unlinking with Undo. Plain text without a link, mixed ranges and multiple anchors are excluded; presets do not install this UI. When both are mounted, an eligible range inside one link belongs to link actions: the text toolbar hides and yields Alt+F10. Without link actions, text formatting remains available as before.
