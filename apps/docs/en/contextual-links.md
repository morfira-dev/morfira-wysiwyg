# Link actions at the caret and in text selections

The [homepage](/en/#editor) and [playground](/en/playground) enable a separate **Link actions** switch. Load its sample and place the caret inside link text, or use “Select link text” / “Select link text backward”. Its address and **Open link**, **Edit link**, **Remove link** appear. Automatic showing neither takes focus nor opens a website. The selection buttons do not change the document or history.

Caret, single-anchor text ranges and mixed linked ranges have separate scenarios. Actual runs are tracked in the roadmap; historical results do not automatically validate new contexts.

## Installation

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { createContextualLinkUI } from '@morfira-dev/wysiwyg/ui/contextual-link';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/ui/forms.css';
import '@morfira-dev/wysiwyg/ui/contextual-link.css';

const editor = createEditor(editorHost, {
  value: '<p>Before <a href="https://example.com"><strong>Mor</strong>fira</a> after</p>',
});
const links = createContextualLinkUI(overlayHost, editor, { gap: 8 });

const dispose = () => {
  links.destroy();
  editor.destroy();
};
```

This independent optional UI is not installed by presets or ready standard UI. No behavior plugin is required: it reuses existing link commands and `createLinkForm`. There are no runtime dependencies, frameworks, implicit CSS or network assets. Imports are SSR-safe; UI creation requires a browser.

`overlayHost` is an empty connected application-owned HTML element in the editor document, outside `editor.surface`. Choose an appropriate viewport overlay layer: transformed/filtered/perspective/paint-contained or clipping ancestors are unsupported. UI neither moves application nodes nor creates a global overlay manager.

The controller provides `element`, `refresh()` and idempotent `destroy()`. Refresh after destroy throws; the editor remains usable. Owned forms, subscriptions, listeners and observers are released, including setup rollback. Options are optional `label`, `onError` and finite `gap` from 0–32 CSS px, default 8. Public exports include `ContextualLinkUIOptions`, `ContextualLinkUIController`, `ContextualLinkUIMessageKey` and RU/EN `contextualLinkUIMessages`.

## Caret, selection, actions and history

Single-anchor mode requires **a caret or nonempty text range wholly inside one actual ordinary HTML anchor**, within the focused editor. A partial range may cross differently formatted text children in either direction. Plain text without a link remains with text formatting; the mixed single-flow profile below supports linked/plain ranges and multiple anchors. Cross-block boundaries and image-only links remain excluded. Owning semantic nodes and foreign namespaces are also excluded: the whole anchor, including descendants outside the selected substring, and its ancestors are checked. Use the standard form or [contextual formatting toolbar](/en/contextual-toolbar) to create a link on plain text.

**Single-anchor actions apply to that whole link.** For example, selecting `orfi` within `<a><strong>Mor</strong><em>fira</em></a>` and changing the URL updates that entire anchor; Remove unlinks it entirely. This does not split a partial selection into separate link fragments. Original text, rich content, selection and direction survive, with one Undo per change.

When both contextual modules are mounted, link actions take priority for an eligible range inside one link: the text toolbar hides and yields Alt+F10. Pure unlinked text keeps its existing text toolbar behavior; eligible mixed linked ranges use the range actions below. Unmounting link actions restores text toolbar handling for that range. Both modules remain independently and explicitly installed; presets do not add them.

- **Open** is a native anchor with `target="_blank"` and `rel="noopener noreferrer"`. Navigation requires an explicit user action.
- **Edit** restores the remembered range, rechecks the same anchor and opens the existing form with focus in its URL field. The form uses explicit `scope: 'anchor'` to update whole-link metadata without replacing its text.
- **Remove** unlinks the whole anchor while preserving its children, with its normal single Undo step. Unlinking does not delete the text.

An unmodified primary click on an eligible editable content link places the caret without navigation. Modified/auxiliary/context-menu actions and read-only native navigation remain. Read-only may retain preview/Open but disables Edit/Remove and closes an active form. IME composition hides all actions.

**Alt+F10** from this editor with an eligible caret or range opens/focuses its first enabled action; other fields/editors keep their shortcuts. **Escape** closes a form or preview and returns the remembered range and its direction once. Outside interaction/focus departure dismisses without stealing focus. Queued updates for the same range do not immediately reopen; a genuine new editor selection or explicit Alt+F10 can reopen.

External document replacement synchronously invalidates the old target: drafts never retarget to another anchor, and retained detached controls cannot edit or open replacement content. Locale updates change labels without resetting a draft. Showing, positioning and dismissal add no history. Geometry follows visible boundaries, scrolling and viewport resizing; narrow controls wrap/scroll without page overflow.

## Security and limits

Moving focus into owned controls can temporarily clear native Selection: the UI remembers the exact original range, then rechecks the same anchor and document revision before an action. A changed actual range, document or target cannot let a stale draft edit a new target. Read-only blocks mutation and IME hides actions. Editor ownership, rather than matching URLs on separate anchors, determines the target.

The actual current href is validated through the editor codec before preview and immediately before opening, then resolved against `document.baseURI`. Only **http/https/mailto/tel** are allowed; relative URLs require a safe resolved result. Protocol-relative URLs, control/space-obfuscated values and unsafe schemes are ineligible. The codec trims outer whitespace around otherwise safe URLs; internal control/space obfuscations are rejected. URL/messages render as plain text, never HTML. Validation neither fetches a link nor creates a remote page preview.

This frontend boundary does not replace server validation, CSP or application policy for external destinations. Custom text and `onError` belong to trusted application code. Image/table controls, arbitrary portals, transformed-coordinate mapping and complete accessibility/mobile certification are not added. Actual checks and sizes are recorded separately in the [roadmap](/en/roadmap#verification-and-limits).

## Text across multiple links

Choose **Load multiple-link selection** in the demo. The range covers part of the first link, plain text and part of the second. In this mode **Set link for selection** opens the existing form with `scope: 'selection'` and empty metadata drafts; **Remove links from selection** unlinks only selected portions. No Open URL action is offered because there is no single navigation target.

Applying one address links the selected text while unselected parts keep their original URLs, title/target and formatting. Rich text and backward direction survive, with one Undo/Redo operation. Text wholly within one anchor keeps the existing whole-anchor mode.

Mixed context requires one ordinary inline flow: paragraph/heading, list item, quote or cell. Cross-block ranges, selected images, code, semantic/foreign/hidden content are excluded. Pure unlinked text stays with text formatting; an eligible mixed linked range receives only link actions. Read-only blocks editing; replacement, lost ownership and stale drafts cannot redirect the operation to new content.
