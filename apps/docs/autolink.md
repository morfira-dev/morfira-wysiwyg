# Automatic links

`/plugins/autolink` is an optional plugin that converts a completed URL after **one native Space**, supported **controlled Enter**, or an actual **single-URL plain-text clipboard paste**. Core does not load it automatically. It needs no CSS, UI, third-party runtime dependencies or network requests.

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

## Enter and plain-text clipboard paste

At a collapsed caret after a completed URL, ordinary Enter links the URL only after the editor successfully splits the block. The caret stays at the actual new-block position; following typing stays outside the link. Canceled/blocked Enter and Enter consumed by Markdown or slash commands do not cause speculative linking. Shift+Enter and uncontrolled browser paragraph edits are excluded.

Paste must be an actual clipboard event whose HTML representation is empty and whose `text/plain` contains exactly one supported URL token, at most 2048 UTF-16 units, with no whitespace or line breaks. The source selection must be collapsed in a supported flow. Clipboard text stays verbatim; terminal punctuation remains outside the anchor, and neighboring text is not included. HTML/rich clipboard payloads, multiline text, whitespace-delimited URLs and selected replacement remain literal. Programmatic insertion is not clipboard completion.

## Email — explicit opt-in

By default, `autolink()` and the standard/extended presets recognize only URLs. Enable email when installing the plugin; it adds neither a separate plugin nor a network request:

```ts
plugins: [autolink({ email: true })]
// or createStandardPreset({ autolink: { email: true } })
```

`email` accepts only boolean and defaults to `false`. Existing `enabled` state and `setEnabled` commands control all completion together. The full demo explicitly enables email. Click Prepare email for Space and type Space or Enter yourself after `Writer.Name+tag@Example.com`. An actual single-address plain-text paste with an empty HTML representation is also supported. It produces `href="mailto:Writer.Name+tag@Example.com"`, retaining the literal display text and case.

The deliberately conservative ASCII grammar allows at most 254 address characters and 64 local-part characters: nonempty letter/digit/underscore/plus/hyphen atoms separated by single dots. The domain has at least two labels of at most 63 letters/digits/interior hyphens; its final label is 2–63 ASCII letters. Leading/trailing dots, double `@`, edge hyphens, quoted local parts, IDN/Unicode, IP literals, display names, percent-encoding and query/header parameters are unsupported. Malformed tokens must not be partially linked. This is not complete RFC validation, an address-existence check or account authorization.

The same boundaries remain: collapsed caret, Space/controlled Enter/one plain-text token, IME/read-only and semantic-node guards. HTML, multiline clipboard, API import and selected replacement gain no email conversion. First Undo removes the automatic link while retaining the original space/Enter/paste; second Undo reverses that input. Nothing is sent anywhere. Explicitly opening the saved mailto link delegates to the browser/system mail application and does not itself send a message.

## History and limits

Conversion is a separate atomic operation **after** native space input is recorded. One Undo removes automatic linking and restores the literal URL **including the space already typed**. Redo restores the anchor and post-space caret; following text stays outside the anchor. One conversion produces one additional user `change` event.

Enter and supported paste also create **two distinct history operations**: first Undo removes the automatic link but retains the split/pasted literal text; second Undo removes the original input. Redo restores the input and then the link. Any later typing is a subsequent operation. The plugin never temporarily selects the URL to format it. If application observers change the document, selection, pending formats, read-only state or editor lifetime before conversion, it skips the stale completion.

The plugin does not trigger:

- On Shift+Enter or uncontrolled native paragraph splitting; only successful controlled Enter is an Enter trigger.
- On unsupported paste payloads, drop, HTML/JSON import, external value replacement, history input or multi-character native input. Imported URLs remain literal by that action; later ordinary Space input can complete the URL.
- During IME/composition, in read-only or with a noncollapsed selection.
- Inside existing links, `pre`/`code`, `figure`/`figcaption` or an inline semantic node marked with `data-mw-node`.
- Across a block, line break, image, code, existing anchor or semantic inline-node boundary.
- For other protocols, invalid addresses, credentials, overlong URLs or truncated token beginnings.

Quotes and angle delimiters are not recognized token content. This is a bounded URL-completion behavior rather than automatic document-wide link detection.

For explicit link creation/editing, use [link commands](/styling) or the [ready UI form](/ui). The plugin is independent of the [semantic schema SDK](/plugin-sdk): inline references are not automatically linked, while registered block-callout metadata is preserved.

## Try the live example

Open “Automatic links” on the [homepage](/#editor) or [playground](/playground). “Prepare URL for Enter” loads literal text and places the caret at its end: press Enter yourself. “Prepare plain-text paste” creates an empty paragraph: paste `https://example.com` as plain text yourself. The buttons only prepare the document; they do not simulate input or fetch addresses. Use Undo twice to inspect the two operations.
