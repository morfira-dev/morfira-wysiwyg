import type { StandardPresetOptions } from '../standard/types.js';
import type { MentionOptions } from '../../mentions/types.js';
import type { SlashOptions } from '../../slash/types.js';

export interface ExtendedPresetOptions extends StandardPresetOptions {
  mentions: MentionOptions;
  slash: SlashOptions;
}
