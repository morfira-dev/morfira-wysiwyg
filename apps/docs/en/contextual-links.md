# Link actions at the caret

The [homepage](/en/#editor) and [playground](/en/playground) enable a separate **Link actions at caret** switch. Load its sample and place the caret inside link text. Its address and **Open link**, **Edit link**, **Remove link** appear. Automatic showing neither takes focus nor opens a website.

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

## Caret, actions and history

Eligibility requires **a collapsed native caret inside one actual ordinary HTML anchor containing nonempty text**, within the focused editor. Parent boundary positions, expanded ranges and image-only links are excluded, as are owning semantic ancestors and foreign namespaces. Mixed text/image children of an eligible link are not rewritten. Expanded text ranges use the separate [contextual formatting toolbar](/en/contextual-toolbar).

- **Open** is a native anchor with `target="_blank"` and `rel="noopener noreferrer"`. Navigation requires an explicit user action.
- **Edit** restores the remembered caret, rechecks the same anchor and opens the existing form with focus in its URL field. URL/metadata changes retain children, rich content and an ordinary Undo step.
- **Remove** unlinks the whole anchor while preserving its children, with its normal single Undo step. Unlinking does not delete the text.

An unmodified primary click on an eligible editable content link places the caret without navigation. Modified/auxiliary/context-menu actions and read-only native navigation remain. Read-only may retain preview/Open but disables Edit/Remove and closes an active form. IME composition hides all actions.

**Alt+F10** from this editor with an eligible caret opens/focuses its first enabled action. Expanded ranges belong to the separate text UI; other fields/editors keep their shortcuts. **Escape** closes a form or preview and returns the remembered caret once. Outside interaction/focus departure dismisses without stealing focus. Queued updates for the same range do not immediately reopen; a genuine new editor selection or explicit Alt+F10 can reopen.

External document replacement synchronously invalidates the old target: drafts never retarget to another anchor, and retained detached controls cannot edit or open replacement content. Locale updates change labels without resetting a draft. Showing, positioning and dismissal add no history. Geometry follows visible boundaries, scrolling and viewport resizing; narrow controls wrap/scroll without page overflow.

## Security and limits

The actual current href is validated through the editor codec before preview and immediately before opening, then resolved against `document.baseURI`. Only **http/https/mailto/tel** are allowed; relative URLs require a safe resolved result. Protocol-relative URLs, control/space-obfuscated values and unsafe schemes are ineligible. The codec trims outer whitespace around otherwise safe URLs; internal control/space obfuscations are rejected. URL/messages render as plain text, never HTML. Validation neither fetches a link nor creates a remote page preview.

This frontend boundary does not replace server validation, CSP or application policy for external destinations. Custom text and `onError` belong to trusted application code. Image/table controls, arbitrary portals, transformed-coordinate mapping and complete accessibility/mobile certification are not added. Actual checks and sizes are recorded separately in the [roadmap](/en/roadmap#verification-and-limits).
