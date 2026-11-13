# Markdown typing shortcuts — optional module

Status: implemented locally; full check passes 474 editor/module browser tests across Chromium/Firefox/WebKit and 27 bilingual site tests pass. Public `@morfira-dev/wysiwyg/plugins/markdown` exports `markdownShortcuts(options?: MarkdownShortcutOptions)` and `markdownCommands(editor)`. Original strict TypeScript/MIT, no runtime dependencies, core must not import it. Schema v1 unchanged. Independent JS entry plus shared chunks guarded at existing optional-module envelope 150000 bytes.

## API and scope

`MarkdownShortcutOptions { enabled?: boolean; blocks?: boolean; inline?: boolean }`, defaults all true. Validate booleans/options before installation; copy flags so later options-object mutation cannot affect instances. `MarkdownShortcutState { enabled: boolean; blocks: boolean; inline: boolean }`; `MarkdownCommands { getState(): MarkdownShortcutState; setEnabled(enabled: boolean): void }`. State is per setup, including reuse of one plugin object in multiple editors. getState returns a fresh copy. Runtime toggling changes a preference only, not content/history; read-only may still change preference. Disposed commands throw. SSR import/factory accesses no DOM. No parser, Markdown import/export or paste conversion in this milestone.

## Block rules

On native beforeinput `insertText` with exactly one space, at a collapsed caret in a plain p outside existing li/blockquote/pre/code/a/figure/figcaption: recognize the full prefix from paragraph start to caret:

- # through ###### -> h1 through h6.
- > -> blockquote.
- -, *, + -> one-item ul/li.
- 1. or 1) -> one-item ol/li. Other starting numbers remain literal (schema has no list-start attribute).
- ``` -> pre (plain code block, no language identifier).
- ---, ***, ___ -> hr followed by the existing paragraph/empty typing paragraph.

On insertParagraph (Enter), only the exact ``` or horizontal-rule marker prefix is recognized, and only if it occupies the whole paragraph (no suffix). Ordinary Enter stays native. Space conversion retains rich suffix content after the caret, removes the marker, and places caret at its beginning in the new block/list item (or following paragraph for hr). Existing paragraph attributes survive on an appropriate replacement block/item. List rules may leave adjacent compatible lists separate; joining/nesting belongs to existing core list operations. Headings/lists/etc are not recursively reinterpreted as block shortcuts. Plain paragraphs in merged table cells are supported; no cell/grid changes. Exclude blocks that would cross a table/caption/list boundary or contain malformed nested block structures.

## Inline rules

On single-character native insertText completing a delimiter pair: **text** and __text__ -> strong; *text* and _text_ -> em; ~~text~~ -> s; `text` -> code. Operate within one p/h1-h6/li/blockquote text flow, across adjacent text nodes/non-code inline marks, without crossing br/img/hr, anchors, code/pre, captions/figures or nested blocks. Preserve existing content/styles and unaffected siblings. The body is nonempty, has no leading/trailing whitespace, CR/LF or active delimiter character, and is at most 2000 UTF-16 units. Prefix collection/regex matching must be bounded; avoid scanning a full large document on each input. Escaped openers (odd number of preceding backslashes), triple/adjacent ambiguous delimiters, underscores inside identifiers, and rules inside an existing wrapper of the same format remain literal. Opening markers require beginning-of-flow or a non-word preceding character (Unicode letters/numbers/marks/connector punctuation count as word characters); closing underscore followed by a word character is not a rule. An unmatched unescaped inline backtick opener suppresses non-code inline rules until its closing backtick; code text such as **x** stays literal. Block fence recognition is checked first. Nested Markdown parsing is not promised.

Remove only marker characters, preserve rich body content, and apply the semantic tag. Do not insert HTML from strings/unchecked attributes. Place caret after the formatted fragment; subsequent ordinary typing must continue outside the newly applied mark while preserving unrelated surrounding styles. Pending core caret formatting may be used through the public API after the transaction, adding no history. No invisible persisted sentinel characters.

## Events, history and safety

Intercept handled beforeinput in capture phase before core pending-input bookkeeping. Respect defaultPrevented; for a handled shortcut preventDefault AND stopImmediatePropagation so core cannot insert the trigger twice. Do not intercept unmatched input. Every conversion is one editor.transact and one user-change event; any collapsed pending-format adjustment adds no document revision. Undo restores exactly the literal document and caret BEFORE the trigger key (the trigger space/final delimiter/Enter is part of conversion, not separately persisted); redo restores the formatted result, caret and pending exit-from-mark formatting so following input stays outside after redo too. This pre-trigger undo behavior must be explicit in RU/EN docs and tests.

Skip read-only, noncollapsed selection, IME composition/local composition state/event.isComposing, insertCompositionText, paste/drop/history/programmatic setHTML/JSON/insertHTML and multi-character insertText. No automatic conversion after external replacement or composition end. Toggle off leaves input literal. All listeners/APIs belong to the instance and dispose cleanly, including on plugin setup failures. No document.execCommand or external editor/Markdown dependencies.

## Demo and validation

Both homepages/playgrounds: Markdown shortcuts sample/cheat sheet and enable checkbox, empty typing area or starter text, block and inline rule examples, explicit trigger/undo explanation and unsupported parser/paste/language fence limitations. Sample text is literal until typed triggers; external sample loading must not auto-transform. Core keyboard/list/table behavior remains intact. Bilingual detailed page/API examples.

Chromium/Firefox/WebKit: all markers, mixed rich suffix/body retention, disabled flags/runtime toggle, read-only/composition/selection/paste/external/no-op scopes, escaping/identifier/triple boundaries, table merged cells, one-step conversion undo/redo and actual caret/next typing, single change event, instance reuse/disposal/SSR, invalid options, caps/large paragraphs. Test real browser key typing and beforeinput fallback. Full pnpm run check, docs:build, test:docs; independent entry bytes/min/gzip/Brotli/CSS separately. CI/release remains user-owned.
