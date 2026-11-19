import type { SearchCommands, SearchRangeSnapshot } from '@morfira-dev/wysiwyg/plugins/search';
import { getSearchRanges } from '@morfira-dev/wysiwyg/plugins/search';
import { createSearchHighlights } from '@morfira-dev/wysiwyg/ui/search-highlights';
import type { SearchHighlightsController, SearchHighlightsOptions, SearchHighlightsState } from '@morfira-dev/wysiwyg/ui/search-highlights';
import type { Editor } from '@morfira-dev/wysiwyg';

export interface SearchHighlightsFixtureOptions {
  mount?: boolean;
}

declare global {
  interface Window {
    searchHighlightsModule: typeof import('@morfira-dev/wysiwyg/ui/search-highlights');
    searchHighlightsSearchModule: typeof import('@morfira-dev/wysiwyg/plugins/search');
    searchHighlightAPI: SearchCommands;
    searchHighlighter: SearchHighlightsController;
    secondSearchHighlightEditor: Editor;
    secondSearchHighlighter: SearchHighlightsController;
    secondSearchHighlightAPI: SearchCommands;
    searchHighlightsErrors: string[];
    searchHighlightsNative: boolean;
  }
}

const checkSearchHighlightTypes = (editor: Editor): void => {
  const options: SearchHighlightsOptions = { onError: (error) => { void error; } };
  const controller: SearchHighlightsController = createSearchHighlights(editor, options);
  const state: SearchHighlightsState = controller.getState();
  const snapshot: SearchRangeSnapshot = getSearchRanges(editor);
  const ranges: readonly Range[] = snapshot.ranges;
  void ranges;
  void state;
  // @ts-expect-error highlighting has no document-mutation option
  createSearchHighlights(editor, { wrapMatches: true });
  controller.destroy();
};
void checkSearchHighlightTypes;
