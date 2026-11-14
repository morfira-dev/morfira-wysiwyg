import type { EditorOptions } from '@morfira-dev/wysiwyg-core';
import type { MinimalPresetOptions } from './types.js';
import { checkedPresetOptions, copyEditorOptions } from '../shared/options.js';

export type { MinimalPresetOptions } from './types.js';

/** Pure core-only configuration; no optional behavior or UI is imported. */
export const createMinimalPreset = (options: MinimalPresetOptions = {}): EditorOptions => {
  checkedPresetOptions(options);
  return copyEditorOptions(options);
};
