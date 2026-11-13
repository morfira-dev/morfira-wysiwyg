# Theming

Import `@morfira/wysiwyg/style.css` once. Set variables on a wrapper to scope them to one editor, or on `:root` for the entire application. The core does not inject styles at runtime. It works without the default toolbar.

```css
.article-editor {
  --mw-accent: #0d9488;
  --mw-accent-soft: #ccfbf1;
  --mw-font: 'Inter', system-ui, sans-serif;
  --mw-radius: 8px;
  --mw-padding: 24px;
  --mw-min-height: 400px;
}
.article-editor[data-theme='dark'] {
  --mw-text: #e0e6f0;
  --mw-muted: #93a0b5;
  --mw-surface: #1c2130;
  --mw-toolbar-bg: #222839;
  --mw-border: #394259;
  --mw-hover: #30394f;
  --mw-accent: #b0a5ff;
  --mw-accent-soft: #38315e;
}
```

## CSS variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `--mw-font` | system sans-serif stack | Editor and toolbar font |
| `--mw-font-size` | `16px` | Document text size |
| `--mw-line-height` | `1.75` | Document line height |
| `--mw-text` | `#263043` | Text and controls |
| `--mw-muted` | `#8490a1` | Placeholder and secondary text |
| `--mw-surface` | `#ffffff` | Editor background |
| `--mw-toolbar-bg` | `#fafbfc` | Toolbar background |
| `--mw-border` | `#e4e8ef` | Editor and default table borders |
| `--mw-accent` | `#6658e8` | Links, focus, active controls |
| `--mw-accent-soft` | `#eeebff` | Active control background |
| `--mw-hover` | `#f0f2f7` | Hover and code background |
| `--mw-radius` | `12px` | Editor and toolbar radius |
| `--mw-padding` | `32px` | Document inner padding |
| `--mw-min-height` | `320px` | Editable surface minimum height |
| `--mw-button-size` | `34px` | Toolbar button size |
| `--mw-focus-ring` | `0 0 0 3px #6658e82b` | Focus shadow |

## Custom interface

Use `editor.format`, `editor.undo`, and `editor.redo` from your own buttons. Preserve the document selection when moving focus to the toolbar. `createToolbar` already does this. Its third argument accepts your own labels, text icons, and actions. Link/image dialogs, dropdown controls, and menus can be implemented in the host application's UI system.

## Tables and exported HTML

Table UI uses variables bridged to the core theme. Explicit user-selected cell backgrounds/borders are document content and remain unchanged when switching themes. HTML export carries semantic content, not the toolbar theme. If you display exported HTML outside the editor, provide typography/list/table styles for your reader view.

## Accessibility

Keep sufficient contrast for custom colors. Controls have accessible names, pressed state and visible keyboard focus. The document exposes a multiline textbox and read-only state. Full assistive-technology, mobile/touch, and keyboard-only table audits are still pending; this preview is not an accessibility conformance claim.

Table tokens: `--mw-table-cell-padding`, `--mw-table-selection`, `--mw-table-menu-width`.
