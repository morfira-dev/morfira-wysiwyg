import type { StandardEditorUIOptions, StandardEditorUIController } from '../standard/types.js';
import type { SuggestionMenuOptions } from '../../suggestions/menu.types.js';

export interface ExtendedEditorUIOptions extends StandardEditorUIOptions {
  mentions?: SuggestionMenuOptions;
  slash?: SuggestionMenuOptions;
}
export interface ExtendedEditorUIController extends StandardEditorUIController {}
