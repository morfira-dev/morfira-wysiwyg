<script setup>
import AccessibilityExample from './.vitepress/theme/AccessibilityExample.vue';
</script>

# Accessibility and narrow screens

The editor uses native `contenteditable`, Selection/Range and a separate optional toolbar. These provide a basis for accessibility testing, without claiming WCAG conformance or identical behavior across assistive technologies. Applications own the editor's accessible name, form context, error messages, theme colors and custom plugins.

The laboratory below uses public `createStandardPreset()` and `createStandardEditorUI()`. It exercises a narrow embedded host independently from the viewport. Width, density, language and read-only controls belong to the example; no new editor API is required. Changing density recreates only the UI, retaining the editor instance and document. Language and read-only update through `setLocale()` and `setReadOnly()`.

<AccessibilityExample />

## Keyboard and focus

1. Use Tab and Shift+Tab between external fields, the toolbar and text. **“Focus editor”** calls public `editor.focus()`.
2. The toolbar has one active Tab stop. Buttons support ← / → and Home / End. Selects and color inputs retain native keys; Alt+← / Alt+→ move between toolbar controls.
3. **“More”** reveals groups that do not fit. Escape closes the expanded region and restores its button; Escape in the ordinary toolbar restores the editor selection/focus.
4. Insertion forms follow their own contracts: [image forms](/ui) use a native modal dialog when dialog presentation is selected; the [ready toolbar](/editor-ui) can use nonmodal popovers. Floating search remains a nonmodal strip, allowing text interaction.
5. Read-only preserves the document and blocks user edits. Searching/viewing does not imply permission to edit; button availability depends on each command.

Start with comfortable density. Compact reduces desktop controls. Under `pointer: coarse`, CSS keeps ready-toolbar controls at least 44 CSS px wide and high; this does not verify comfort or accessibility on a real device. `--mw-*` CSS variables let applications change sizes/colors, but a customized theme requires another review.

The base theme darkens `--mw-muted` to `#657185` for light backgrounds; custom color combinations require separate measurement. In `forced-colors`, the editor and toolbar use system `Highlight` for visible focus. These rules do not replace manual high-contrast testing.

Primary W3C review references: [Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) for text contrast, [Toolbar Pattern APG](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/) for roving Tab stops and keyboard interaction, and [Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) for evaluating rearrangement at zoom/narrow widths. These are review references, not a WCAG conformance claim.

## Application review

Review visible focus and contrast in your theme, the editor's accessible name, external field labels and error messages. Complete the available keyboard flow in the supported environment. Exercise browser zoom and a narrow host, long strings, tables and custom elements. Automated checks cannot assess alt-text meaning, label quality or understandable navigation.

HTML/JSON and paste still pass ordinary schema validation. Accessible labels do not establish trust in URLs or uploads: [security boundaries](/security) remain required. The laboratory starts no uploads or external resource requests and destroys its UI/editor when leaving the page.

On Safari for macOS, reaching every clickable control with Tab depends on keyboard-navigation settings; Option+Tab provides the broader native traversal. See [Apple keyboard guidance](https://support.apple.com/en-ie/guide/safari/cpsh003/27.0/mac/27). The laboratory preserves that browser policy.
