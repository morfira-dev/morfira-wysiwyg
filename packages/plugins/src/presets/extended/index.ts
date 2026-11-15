import type { EditorOptions } from '@morfira-dev/wysiwyg-core';
import { mentions } from '../../mentions/index.js';
import { slash, createSlashActions } from '../../slash/index.js';
import { createStandardPreset } from '../standard/index.js';
import { checkedPresetOptions, featureOptions } from '../shared/options.js';
import type { ExtendedPresetOptions } from './types.js';
import type { MentionOptions } from '../../mentions/types.js';
import type { SlashOptions } from '../../slash/types.js';

export type { ExtendedPresetOptions } from './types.js';

/** Providers are explicit application callbacks; the preset never supplies demo data or network I/O. */
export const createExtendedPreset = (options: ExtendedPresetOptions): EditorOptions => {
  checkedPresetOptions(options, ['tables', 'images', 'search', 'statistics', 'markdown', 'autolink', 'horizontalRule', 'mentions', 'slash']);
  if (options.mentions === undefined || options.slash === undefined) throw new TypeError('Extended presets require mention and slash providers.');
  const mention = featureOptions<MentionOptions>(options.mentions, 'mentions', ['provide', 'minQueryLength', 'maxItems', 'debounceMs']);
  const slashOptions = featureOptions<SlashOptions>(options.slash, 'slash', ['provide', 'minQueryLength', 'maxItems', 'debounceMs', 'actions']);
  if (typeof mention.provide !== 'function' || typeof slashOptions.provide !== 'function') throw new TypeError('Extended presets require mention and slash provider functions.');
  const { mentions: _mentions, slash: _slash, ...standard } = options;
  const editor = createStandardPreset(standard);
  const appCount = options.plugins?.length ?? 0;
  const builtins = editor.plugins!.slice(0, editor.plugins!.length - appCount);
  const appPlugins = appCount ? editor.plugins!.slice(-appCount) : [];
  if (slashOptions.actions !== undefined && (!slashOptions.actions || typeof slashOptions.actions !== 'object' || Array.isArray(slashOptions.actions)))
    throw new TypeError('Slash actions must be a record.');
  const actions = slashOptions.actions === undefined ? createSlashActions() : { ...slashOptions.actions };
  return { ...editor, plugins: [...builtins, mentions(mention), slash({ ...slashOptions, actions }), ...appPlugins] };
};
