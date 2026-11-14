# Automatic links

`/plugins/autolink` is an optional plugin that converts a completed URL after ordinary typing of **one space with Space**. Core does not load it automatically. It needs no CSS, UI, third-party runtime dependencies or network requests.

## Installation

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { autolink, autolinkCommands } from '@morfira-dev/wysiwyg/plugins/autolink';
import '@morfira-dev/wysiwyg/style.css';

const editor = createEditor(host, {
  locale: 'en',
  value: '<p>Type https://example.com followed by a space.</p><p><br></p>',
  plugins: [autolink({ enabled: true })],
});
const commands = autolinkCommands(editor);
const state = commands.getState(); // { enabled: true }, an independent snapshot
commands.setEnabled(false);
commands.setEnabled(true);

// When the screen unmounts:
const dispose = () => editor.destroy();
```

`host` is an empty browser `HTMLElement`. `enabled` defaults to `true`; invalid options fail. Module imports and `autolink()` factory calls are safe without DOM; editor creation requires browser DOM.

| API | Behavior |
| --- | --- |
| `autolink({ enabled? })` | Creates a plugin definition; each editor installs its own state |
| `autolinkCommands(editor)` | Returns the installed plugin API; throws when the plugin is missing |
| `commands.getState()` | Returns a fresh `{ enabled: boolean }` snapshot |
| `commands.setEnabled(boolean)` | Changes a preference without document/history mutation or a `change` event |

Preferences may change in read-only, but conversion remains blocked. Commands fail after editor destruction; listeners and plugin API ownership are released. One `autolink()` result can be installed in different editors without shared mutable state.

## Recognized input

Type a URL as ordinary text and press Space:

| Typed text | Resulting `href` |
| --- | --- |
| `https://example.com` + Space | `https://example.com` |
| `http://example.com/path` + Space | `http://example.com/path` |
| `www.example.com` + Space | `https://www.example.com` |

Prefixes are case-insensitive. Link labels keep the typed text; `www.` receives a protocol in `href` only. Terminal sentence punctuation and unmatched closing delimiters stay outside the anchor. Balanced delimiters inside URL paths remain. The address/protocol uses existing safe link rules and the browser URL parser; no preview or network address check occurs.

The plugin inspects only a bounded suffix of the current text flow: up to 2050 UTF-16 units before the caret, with a URL limit of 2048. A collapsed caret is required. Ordinary paragraphs, headings, list items, blockquotes and table cells are supported. Surrounding inline formatting and semantic block-callout metadata survive conversion.

## Space, history and limits

Conversion is a separate atomic operation **after** native space input is recorded. One Undo removes automatic linking and restores the literal URL **including the space already typed**. Redo restores the anchor and post-space caret; following text stays outside the anchor. One conversion produces one additional user `change` event.

The plugin does not trigger:

- On Enter: ordinary paragraph/block splitting remains unchanged. Phase 1 supports Space only.
- On paste/drop, HTML/JSON import, external value replacement, history input or multi-character input. Imported URLs remain literal by that action; later ordinary Space input can complete the URL.
- During IME/composition, in read-only or with a noncollapsed selection.
- Inside existing links, `pre`/`code`, `figure`/`figcaption` or an inline semantic node marked with `data-mw-node`.
- Across a block, line break, image, code, existing anchor or semantic inline-node boundary.
- For other protocols, invalid addresses, credentials, overlong URLs or truncated token beginnings.

Quotes and angle delimiters are not recognized token content. This is a bounded URL-completion behavior rather than automatic document-wide link detection.

For explicit link creation/editing, use [link commands](/en/styling) or the [ready UI form](/en/ui). The plugin is independent of the [semantic schema SDK](/en/plugin-sdk): inline references are not automatically linked, while registered block-callout metadata is preserved.
