import type { EditorOptions } from '@morfira-dev/wysiwyg-core';
import { tables } from '../../tables/index.js';
import { images } from '../../images/index.js';
import { search } from '../../search/index.js';
import { statistics } from '../../statistics/index.js';
import { markdownShortcuts } from '../../markdown/index.js';
import { autolink } from '../../autolink/index.js';
import { checkedPresetOptions, copyEditorOptions, featureOptions } from '../shared/options.js';
import type { StandardPresetOptions } from './types.js';

export type { StandardPresetOptions } from './types.js';

/** Compose the supported everyday behaviors without creating DOM or UI. */
export const createStandardPreset = (options: StandardPresetOptions = {}): EditorOptions => {
  checkedPresetOptions(options, ['tables', 'images', 'search', 'statistics', 'markdown', 'autolink']);
  if (options.search !== undefined && typeof options.search !== 'boolean') throw new TypeError('Preset search must be boolean.');
  const editor = copyEditorOptions(options);
  const table = options.tables === false ? undefined : featureOptions(options.tables, 'tables', ['onClipboardError']);
  if (table?.onClipboardError !== undefined && typeof table.onClipboardError !== 'function') throw new TypeError('Table diagnostics must be a function.');
  const image = options.images === false ? undefined : featureOptions(options.images, 'images', ['upload', 'maxFileSize']);
  if (image?.upload !== undefined && typeof image.upload !== 'function') throw new TypeError('Image upload must be a function.');
  return {
    ...editor,
    plugins: [
      ...(table ? [tables(table)] : []),
      ...(image ? [images(image)] : []),
      ...(options.search === false ? [] : [search()]),
      ...(options.statistics === false ? [] : [statistics(featureOptions(options.statistics, 'statistics', ['locale']))]),
      ...(options.markdown === false ? [] : [markdownShortcuts(featureOptions(options.markdown, 'markdown', ['enabled', 'blocks', 'inline']))]),
      ...(options.autolink === false ? [] : [autolink(featureOptions(options.autolink, 'autolink', ['enabled']))]),
      ...editor.plugins!,
    ],
  };
};
