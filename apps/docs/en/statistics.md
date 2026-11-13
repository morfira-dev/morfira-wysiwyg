# Text statistics

The optional `/plugins/statistics` module counts words and characters in the document and current selection. It does not change HTML, selection, focus or history, and adds no runtime dependencies.

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { statistics, statisticsCommands } from '@morfira-dev/wysiwyg/plugins/statistics';
import type { StatisticsState } from '@morfira-dev/wysiwyg/plugins/statistics';

const editor = createEditor(host, { plugins: [statistics({ locale: 'en' })] });
const api = statisticsCommands(editor);
const updateCounter = (state: StatisticsState) => {
  counter.textContent = `${state.document.words} words, ${state.document.characters} characters`;
};
updateCounter(api.getState());
const unsubscribe = api.subscribe(updateCounter);
// When removing your own panel:
unsubscribe();
```

The module requires platform **Intl.Segmenter** support; it includes neither a polyfill nor an inaccurate UTF-16 fallback. Importing and creating `statistics()` is safe without DOM when Intl.Segmenter exists; editor creation requires a browser. `locale` is an optional valid language tag, defaulting to the runtime locale. It is validated when the plugin is created. Create a new plugin/editor instance to change locale.

## Result shape

```ts
interface TextStatistics {
  characters: number;
  charactersWithoutWhitespace: number;
  words: number;
}
interface StatisticsState {
  document: TextStatistics;
  selection: TextStatistics;
}
```

- `characters` counts Unicode grapheme clusters. A letter plus combining marks, a family emoji or a flag is one character, even when split across adjacent inline elements.
- `charactersWithoutWhitespace` excludes clusters consisting entirely of whitespace, including NBSP. A whitespace character with a visible combining mark remains counted.
- `words` counts segments whose Intl.Segmenter `isWordLike` value is true. Punctuation and emoji do not become words merely by containing characters. Linguistic segmentation depends on locale and browser Unicode data.

This differs from `string.length`, which measures UTF-16 units: one grapheme can contain multiple units. Statistics do not estimate reading time or promise exact parity with Word or other editors.

## Text and boundaries

Real text nodes and their whitespace are counted. Inline styles and links do not split words or graphemes. Paragraphs, headings, items/nested lists, cells, captions, pre/blockquote, br, images and hr separate runs. A synthetic break between blocks **does not add a character**. For example, adjacent cells containing one and two yield two words and six characters rather than the single word onetwo.

Image captions are included. Image alt/title/URL and other HTML attributes are excluded. Other editor instances, panel UI and executable/foreign DOM nodes are outside document statistics. Rowspan/colspan never duplicate merged-cell content.

`selection` describes the actual native Range inside this editor. A collapsed caret, a selection with a boundary outside the editor, or selecting one image yields zero metrics. Partial rich/block selections preserve their semantic boundaries. If the user selects only part of a grapheme, the selected string is counted as-is; the plugin never snaps or changes the Range. Moving focus into an outside field can clear selection metrics: they are not the form's saved bookmark.

## Updates and cleanup

`getState()` calculates current values and returns an independent snapshot. Mutating it does not change plugin state. `subscribe` is not immediate; read initial values separately. Subscriptions notify only when numeric metrics change after input, formatting, undo/redo, external replacement or selection changes. Formatting that leaves metrics unchanged creates no statistics event.

Statistics remain available in read-only mode. Reusing one plugin object in several editors does not share state/subscriptions. After destroy, commands are unavailable and editor subscriptions are disposed; returned unsubscribe functions remain safe to invoke repeatedly.

The [homepage](/en/#editor) and [playground](/en/playground) let you try Unicode text and selection counts. Applications own the panel's appearance; counting does not require the provided UI.

On the homepage/playground choose “Unicode and statistics”, then open Statistics. The sample includes a combining sequence, family emoji and flag. Selection has its own counters; the status bar uses document totals.

Some tested Intl.Segmenter implementations return an incorrect isWordLike: false for a decomposed word in context. A false segment containing letters/numbers is rechecked independently through Intl.Segmenter, without normalizing text or graphemes. Classification remains platform WordLike: numeric keycap sequences may count as numeric tokens, unlike pictographic family and flag emoji. This is a targeted compatibility check rather than a custom linguistic tokenizer.
